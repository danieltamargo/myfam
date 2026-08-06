begin;

alter table public.expenses
  drop constraint expenses_collection_id_category_id_fkey,
  add constraint expenses_collection_id_category_id_fkey
    foreign key (collection_id, category_id)
    references public.expense_categories(collection_id, id)
    on delete set null (category_id);

create or replace function private.seed_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.expense_categories (collection_id, name, color, icon)
  values
    (new.id, 'Alimentación', '#16A34A', 'shopping-basket'),
    (new.id, 'Hogar', '#2563EB', 'house'),
    (new.id, 'Transporte', '#D97706', 'car'),
    (new.id, 'Salud', '#DC2626', 'heart-pulse'),
    (new.id, 'Educación', '#7C3AED', 'graduation-cap'),
    (new.id, 'Ocio', '#DB2777', 'sparkles'),
    (new.id, 'Otros', '#64748B', 'shapes')
  on conflict (collection_id, name) do nothing;
  return new;
end;
$$;

create trigger seed_expense_categories_after_insert
  after insert on public.expense_collections
  for each row execute function private.seed_expense_categories();

insert into public.expense_categories (collection_id, name, color, icon)
select collection.id, category.name, category.color, category.icon
from public.expense_collections as collection
cross join (
  values
    ('Alimentación', '#16A34A', 'shopping-basket'),
    ('Hogar', '#2563EB', 'house'),
    ('Transporte', '#D97706', 'car'),
    ('Salud', '#DC2626', 'heart-pulse'),
    ('Educación', '#7C3AED', 'graduation-cap'),
    ('Ocio', '#DB2777', 'sparkles'),
    ('Otros', '#64748B', 'shapes')
) as category(name, color, icon)
on conflict (collection_id, name) do nothing;

create or replace function public.get_expense_collection_invitations()
returns table (
  collection_id uuid,
  family_id uuid,
  collection_name text,
  description text,
  currency text,
  role text,
  invited_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    collection.id,
    collection.family_id,
    collection.name,
    collection.description,
    collection.currency,
    member.role,
    member.invited_by
  from public.expense_collection_members as member
  join public.expense_collections as collection on collection.id = member.collection_id
  where member.user_id = (select auth.uid())
    and member.status = 'invited'
  order by collection.created_at desc;
$$;

revoke all on function public.get_expense_collection_invitations() from public, anon;
grant execute on function public.get_expense_collection_invitations() to authenticated;

create or replace function private.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function private.safe_uuid(text) from public, anon;
grant execute on function private.safe_uuid(text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_select_members
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and private.is_active_expense_member(
      private.safe_uuid((storage.foldername(name))[1]),
      (select auth.uid())
    )
  );

create policy expense_receipts_insert_contributors
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.has_expense_collection_role(
      private.safe_uuid((storage.foldername(name))[1]),
      (select auth.uid()),
      array['owner', 'manager', 'contributor']
    )
  );

create policy expense_receipts_delete_owner_or_managers
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'expense-receipts'
    and private.is_active_expense_member(
      private.safe_uuid((storage.foldername(name))[1]),
      (select auth.uid())
    )
    and (
      private.safe_uuid((storage.foldername(name))[2]) = (select auth.uid())
      or private.has_expense_collection_role(
        private.safe_uuid((storage.foldername(name))[1]),
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

  if new.receipt_path is not null
    and split_part(new.receipt_path, '/', 1) <> new.collection_id::text
  then
    raise exception 'Receipt path must belong to the expense collection'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.seed_expense_categories() from public, anon, authenticated;
revoke all on function private.validate_expense_participants() from public, anon, authenticated;

commit;
