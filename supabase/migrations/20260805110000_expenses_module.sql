begin;

create table public.expense_collections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_collection_members (
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'contributor', 'viewer')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'revoked', 'left')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  removed_at timestamptz,
  primary key (collection_id, user_id),
  check ((status = 'active' and joined_at is not null) or status <> 'active'),
  check ((status in ('revoked', 'left') and removed_at is not null) or status not in ('revoked', 'left'))
);

create unique index expense_collection_single_active_owner_idx
  on public.expense_collection_members (collection_id)
  where role = 'owner' and status = 'active';

create index expense_collection_members_user_status_collection_idx
  on public.expense_collection_members (user_id, status, collection_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text check (icon is null or char_length(icon) <= 40),
  unique (collection_id, name),
  unique (collection_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  category_id uuid,
  created_by uuid not null references public.profiles(id),
  paid_by uuid not null references public.profiles(id),
  description text not null check (char_length(btrim(description)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null,
  notes text check (notes is null or char_length(notes) <= 4000),
  receipt_path text check (
    receipt_path is null
    or (
      char_length(receipt_path) <= 512
      and receipt_path !~ '\.\.'
      and receipt_path !~ '[\\]'
      and receipt_path !~ '://'
    )
  ),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (collection_id, created_by)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, paid_by)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, category_id)
    references public.expense_categories(collection_id, id)
);

create index expenses_collection_occurred_id_idx
  on public.expenses (collection_id, occurred_on desc, id desc);
create index expenses_collection_category_occurred_idx
  on public.expenses (collection_id, category_id, occurred_on);
create index expenses_collection_paid_by_occurred_idx
  on public.expenses (collection_id, paid_by, occurred_on);

alter table public.expense_collections enable row level security;
alter table public.expense_collection_members enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create or replace function private.is_active_expense_member(
  p_collection_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.expense_collection_members as member
      where member.collection_id = p_collection_id
        and member.user_id = p_user_id
        and member.status = 'active'
    );
$$;

create or replace function private.has_expense_collection_role(
  p_collection_id uuid,
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.expense_collection_members as member
      where member.collection_id = p_collection_id
        and member.user_id = p_user_id
        and member.status = 'active'
        and member.role = any(p_roles)
    );
$$;

revoke all on function private.is_active_expense_member(uuid, uuid) from public, anon;
revoke all on function private.has_expense_collection_role(uuid, uuid, text[]) from public, anon;
grant execute on function private.is_active_expense_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_expense_collection_role(uuid, uuid, text[]) to authenticated, service_role;

create policy expense_collections_select_active_members
  on public.expense_collections for select
  to authenticated
  using (private.is_active_expense_member(id, (select auth.uid())));

create policy expense_collections_update_managers
  on public.expense_collections for update
  to authenticated
  using (
    private.has_expense_collection_role(
      id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  )
  with check (
    private.has_expense_collection_role(
      id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  );

create policy expense_members_select_collection_or_self
  on public.expense_collection_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_active_expense_member(collection_id, (select auth.uid()))
  );

create policy expense_categories_select_active_members
  on public.expense_categories for select
  to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

create policy expense_categories_insert_managers
  on public.expense_categories for insert
  to authenticated
  with check (
    private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  );

create policy expense_categories_update_managers
  on public.expense_categories for update
  to authenticated
  using (
    private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  )
  with check (
    private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  );

create policy expense_categories_delete_managers
  on public.expense_categories for delete
  to authenticated
  using (
    private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  );

create policy expenses_select_active_members
  on public.expenses for select
  to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

create policy expenses_insert_contributors
  on public.expenses for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager', 'contributor']
    )
  );

create policy expenses_update_author_or_managers
  on public.expenses for update
  to authenticated
  using (
    created_by = (select auth.uid())
    or private.has_expense_collection_role(
      collection_id,
      (select auth.uid()),
      array['owner', 'manager']
    )
  )
  with check (
    private.is_active_expense_member(collection_id, (select auth.uid()))
    and (
      created_by = (select auth.uid())
      or private.has_expense_collection_role(
        collection_id,
        (select auth.uid()),
        array['owner', 'manager']
      )
    )
  );

create policy expenses_delete_author_or_managers
  on public.expenses for delete
  to authenticated
  using (
    private.is_active_expense_member(collection_id, (select auth.uid()))
    and (
      created_by = (select auth.uid())
      or private.has_expense_collection_role(
        collection_id,
        (select auth.uid()),
        array['owner', 'manager']
      )
    )
  );

create or replace function private.validate_expense_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.expense_collection_members as creator
    where creator.collection_id = new.collection_id
      and creator.user_id = new.created_by
      and creator.status = 'active'
  ) then
    raise exception 'Expense creator must be an active collection member'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.expense_collection_members as payer
    where payer.collection_id = new.collection_id
      and payer.user_id = new.paid_by
      and payer.status = 'active'
  ) then
    raise exception 'Expense payer must be an active collection member'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_expense_participants_before_write
  before insert or update of collection_id, created_by, paid_by
  on public.expenses
  for each row execute function private.validate_expense_participants();

create or replace function private.touch_expense_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_expense_collection_before_update
  before update on public.expense_collections
  for each row execute function private.touch_expense_collection();

create or replace function private.bump_expense_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger bump_expense_version_before_update
  before update on public.expenses
  for each row execute function private.bump_expense_version();

revoke all on function private.validate_expense_participants() from public, anon, authenticated;
revoke all on function private.touch_expense_collection() from public, anon, authenticated;
revoke all on function private.bump_expense_version() from public, anon, authenticated;

create or replace function public.create_expense_collection(
  p_family_id uuid,
  p_name text,
  p_description text default null,
  p_currency text default 'EUR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  collection_id uuid;
  normalized_name text := btrim(p_name);
  normalized_currency text := upper(btrim(coalesce(p_currency, '')));
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.family_members as family_member
    where family_member.family_id = p_family_id
      and family_member.user_id = caller_id
  ) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;

  if normalized_name is null
    or char_length(normalized_name) not between 1 and 80
    or normalized_currency !~ '^[A-Z]{3}$'
    or (p_description is not null and char_length(p_description) > 2000)
  then
    raise exception 'Invalid expense collection data' using errcode = '22023';
  end if;

  insert into public.expense_collections (
    family_id,
    created_by,
    name,
    description,
    currency
  ) values (
    p_family_id,
    caller_id,
    normalized_name,
    nullif(btrim(p_description), ''),
    normalized_currency
  ) returning id into collection_id;

  insert into public.expense_collection_members (
    collection_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  ) values (
    collection_id,
    caller_id,
    'owner',
    'active',
    caller_id,
    now()
  );

  return collection_id;
end;
$$;

create or replace function public.invite_expense_collection_member(
  p_collection_id uuid,
  p_user_id uuid,
  p_role text default 'contributor'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  collection_family_id uuid;
  caller_role text;
begin
  select collection.family_id, member.role
  into collection_family_id, caller_role
  from public.expense_collections as collection
  join public.expense_collection_members as member
    on member.collection_id = collection.id
   and member.user_id = caller_id
   and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;

  if caller_role not in ('owner', 'manager') then
    raise exception 'Collection management permission required' using errcode = '42501';
  end if;

  if p_role not in ('manager', 'contributor', 'viewer')
    or (caller_role = 'manager' and p_role = 'manager')
  then
    raise exception 'Role cannot be assigned' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.family_members as family_member
    where family_member.family_id = collection_family_id
      and family_member.user_id = p_user_id
  ) then
    raise exception 'Invitee must belong to the family' using errcode = '23514';
  end if;

  insert into public.expense_collection_members (
    collection_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at,
    removed_at
  ) values (
    p_collection_id,
    p_user_id,
    p_role,
    'invited',
    caller_id,
    null,
    null
  )
  on conflict (collection_id, user_id) do update
    set role = excluded.role,
        status = 'invited',
        invited_by = caller_id,
        joined_at = null,
        removed_at = null
    where expense_collection_members.status in ('revoked', 'left');

  if not found then
    raise exception 'Member already belongs to or is invited to this collection'
      using errcode = '23505';
  end if;
end;
$$;

create or replace function public.accept_expense_collection_invitation(
  p_collection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  update public.expense_collection_members
  set status = 'active',
      joined_at = now(),
      removed_at = null
  where collection_id = p_collection_id
    and user_id = caller_id
    and status = 'invited';

  if not found then
    raise exception 'Pending invitation not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.change_expense_collection_role(
  p_collection_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  perform 1
  from public.expense_collections as collection
  where collection.id = p_collection_id
  for update;

  if not exists (
    select 1
    from public.expense_collection_members as caller
    where caller.collection_id = p_collection_id
      and caller.user_id = caller_id
      and caller.role = 'owner'
      and caller.status = 'active'
  ) then
    raise exception 'Collection ownership required' using errcode = '42501';
  end if;

  if p_role not in ('manager', 'contributor', 'viewer') then
    raise exception 'Invalid collection role' using errcode = '22023';
  end if;

  update public.expense_collection_members
  set role = p_role
  where collection_id = p_collection_id
    and user_id = p_user_id
    and role <> 'owner'
    and status = 'active';

  if not found then
    raise exception 'Active non-owner member not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.transfer_expense_collection_ownership(
  p_collection_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  perform 1
  from public.expense_collections as collection
  where collection.id = p_collection_id
  for update;

  if not exists (
    select 1
    from public.expense_collection_members as caller
    where caller.collection_id = p_collection_id
      and caller.user_id = caller_id
      and caller.role = 'owner'
      and caller.status = 'active'
  ) then
    raise exception 'Collection ownership required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.expense_collection_members as target
    where target.collection_id = p_collection_id
      and target.user_id = p_new_owner_id
      and target.status = 'active'
      and target.user_id <> caller_id
  ) then
    raise exception 'New owner must be another active member' using errcode = '23514';
  end if;

  update public.expense_collection_members
  set role = 'manager'
  where collection_id = p_collection_id
    and user_id = caller_id;

  update public.expense_collection_members
  set role = 'owner'
  where collection_id = p_collection_id
    and user_id = p_new_owner_id;
end;
$$;

create or replace function public.revoke_expense_collection_member(
  p_collection_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_role text;
begin
  perform 1
  from public.expense_collections as collection
  where collection.id = p_collection_id
  for update;

  select member.role into caller_role
  from public.expense_collection_members as member
  where member.collection_id = p_collection_id
    and member.user_id = caller_id
    and member.status = 'active';

  select member.role into target_role
  from public.expense_collection_members as member
  where member.collection_id = p_collection_id
    and member.user_id = p_user_id
    and member.status in ('active', 'invited');

  if caller_role not in ('owner', 'manager')
    or target_role is null
    or target_role = 'owner'
    or (caller_role = 'manager' and target_role = 'manager')
  then
    raise exception 'Member cannot be revoked' using errcode = '42501';
  end if;

  update public.expense_collection_members
  set status = 'revoked',
      removed_at = now()
  where collection_id = p_collection_id
    and user_id = p_user_id
    and status in ('active', 'invited');
end;
$$;

create or replace function public.leave_expense_collection(
  p_collection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  update public.expense_collection_members
  set status = 'left',
      removed_at = now()
  where collection_id = p_collection_id
    and user_id = caller_id
    and status in ('active', 'invited')
    and role <> 'owner';

  if not found then
    raise exception 'Collection owner cannot leave before transferring ownership'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_expense_collection(uuid, text, text, text) from public, anon;
revoke all on function public.invite_expense_collection_member(uuid, uuid, text) from public, anon;
revoke all on function public.accept_expense_collection_invitation(uuid) from public, anon;
revoke all on function public.change_expense_collection_role(uuid, uuid, text) from public, anon;
revoke all on function public.transfer_expense_collection_ownership(uuid, uuid) from public, anon;
revoke all on function public.revoke_expense_collection_member(uuid, uuid) from public, anon;
revoke all on function public.leave_expense_collection(uuid) from public, anon;

grant execute on function public.create_expense_collection(uuid, text, text, text) to authenticated;
grant execute on function public.invite_expense_collection_member(uuid, uuid, text) to authenticated;
grant execute on function public.accept_expense_collection_invitation(uuid) to authenticated;
grant execute on function public.change_expense_collection_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_expense_collection_ownership(uuid, uuid) to authenticated;
grant execute on function public.revoke_expense_collection_member(uuid, uuid) to authenticated;
grant execute on function public.leave_expense_collection(uuid) to authenticated;

revoke all on table public.expense_collections from public, anon, authenticated;
revoke all on table public.expense_collection_members from public, anon, authenticated;
revoke all on table public.expense_categories from public, anon, authenticated;
revoke all on table public.expenses from public, anon, authenticated;

grant select on table public.expense_collections to authenticated;
grant update (name, description, currency, archived_at) on table public.expense_collections to authenticated;
grant select on table public.expense_collection_members to authenticated;
grant select, insert, update, delete on table public.expense_categories to authenticated;
grant select, delete on table public.expenses to authenticated;
grant insert (
  collection_id,
  category_id,
  created_by,
  paid_by,
  description,
  amount,
  occurred_on,
  notes,
  receipt_path
) on table public.expenses to authenticated;
grant update (
  category_id,
  paid_by,
  description,
  amount,
  occurred_on,
  notes,
  receipt_path
) on table public.expenses to authenticated;

grant all privileges on table public.expense_collections to service_role;
grant all privileges on table public.expense_collection_members to service_role;
grant all privileges on table public.expense_categories to service_role;
grant all privileges on table public.expenses to service_role;

commit;
