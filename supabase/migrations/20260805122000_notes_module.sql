begin;

-- public.notes remains untouched as a legacy polymorphic table until its data can be audited.
comment on table public.notes is
  'Legacy polymorphic notes table. Do not add new product writes; family notes live in public.family_notes.';

create table public.family_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  content text not null default '' check (char_length(content) <= 20000),
  visibility text not null default 'private'
    check (visibility in ('family', 'private', 'selected_members')),
  search_vector tsvector generated always as (
    to_tsvector('spanish'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id)
);

create table public.family_note_members (
  note_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (note_id, user_id),
  foreign key (family_id, note_id)
    references public.family_notes(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create index family_notes_family_active_updated_idx
  on public.family_notes (family_id, updated_at desc, id)
  where archived_at is null;
create index family_notes_creator_updated_idx
  on public.family_notes (created_by, updated_at desc, id);
create index family_notes_search_idx
  on public.family_notes using gin (search_vector);
create index family_note_members_user_note_idx
  on public.family_note_members (user_id, family_id, note_id);

alter table public.family_notes enable row level security;
alter table public.family_note_members enable row level security;

create or replace function private.can_view_family_note(p_note_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_notes as note
      join public.family_members as member
        on member.family_id = note.family_id
       and member.user_id = p_user_id
      where note.id = p_note_id
        and (
          note.visibility = 'family'
          or note.created_by = p_user_id
          or exists (
            select 1
            from public.family_note_members as note_member
            where note_member.note_id = note.id
              and note_member.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_edit_family_note(p_note_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_notes as note
      join public.family_members as member
        on member.family_id = note.family_id
       and member.user_id = p_user_id
      where note.id = p_note_id
        and note.created_by = p_user_id
    );
$$;

create or replace function private.validate_note_member_ids(
  p_family_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested(user_id)
    left join public.family_members as member
      on member.family_id = p_family_id
     and member.user_id = requested.user_id
    where member.user_id is null
  ) then
    raise exception 'Every selected note reader must belong to the family'
      using errcode = '23503';
  end if;
end;
$$;

revoke all on function private.can_view_family_note(uuid, uuid) from public, anon;
revoke all on function private.can_edit_family_note(uuid, uuid) from public, anon;
revoke all on function private.validate_note_member_ids(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function private.can_view_family_note(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_edit_family_note(uuid, uuid)
  to authenticated, service_role;

create policy family_notes_select_visible
  on public.family_notes for select to authenticated
  using (private.can_view_family_note(id, (select auth.uid())));
create policy family_note_members_select_visible
  on public.family_note_members for select to authenticated
  using (private.can_view_family_note(note_id, (select auth.uid())));

grant select on table public.family_notes to authenticated;
grant select on table public.family_note_members to authenticated;
revoke insert, update, delete on table public.family_notes from anon, authenticated;
revoke insert, update, delete on table public.family_note_members from anon, authenticated;
grant all privileges on table public.family_notes to service_role;
grant all privileges on table public.family_note_members to service_role;

create or replace function public.create_family_note(
  p_family_id uuid,
  p_title text,
  p_content text,
  p_visibility text default 'private',
  p_member_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_note_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  perform private.validate_note_member_ids(p_family_id, p_member_ids);

  if p_visibility = 'selected_members' and not exists (
    select 1
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as requested(user_id)
    where requested.user_id <> caller_id
  ) then
    raise exception 'Select at least one other family member' using errcode = '22023';
  end if;

  insert into public.family_notes (family_id, created_by, title, content, visibility)
  values (p_family_id, caller_id, btrim(p_title), p_content, p_visibility)
  returning id into new_note_id;

  if p_visibility = 'selected_members' then
    insert into public.family_note_members (note_id, family_id, user_id, added_by)
    select new_note_id, p_family_id, requested.user_id, caller_id
    from (
      select distinct input.user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where input.user_id <> caller_id
    ) as requested;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'notes.note_created', 'notes', 'family_note', new_note_id,
    jsonb_build_object('visibility', p_visibility)
  );
  return new_note_id;
end;
$$;

create or replace function public.update_family_note(
  p_note_id uuid,
  p_version bigint,
  p_title text,
  p_content text,
  p_visibility text,
  p_member_ids uuid[] default array[]::uuid[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  note_row public.family_notes%rowtype;
  new_version bigint;
begin
  select * into note_row
  from public.family_notes
  where id = p_note_id
  for update;
  if note_row.id is null then
    raise exception 'Family note not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_family_note(p_note_id, caller_id) then
    raise exception 'Family note permission denied' using errcode = '42501';
  end if;
  if note_row.version <> p_version then
    raise exception 'Family note changed concurrently' using errcode = '40001';
  end if;
  perform private.validate_note_member_ids(note_row.family_id, p_member_ids);

  if p_visibility = 'selected_members' and not exists (
    select 1
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as requested(user_id)
    where requested.user_id <> caller_id
  ) then
    raise exception 'Select at least one other family member' using errcode = '22023';
  end if;

  update public.family_notes
  set title = btrim(p_title),
      content = p_content,
      visibility = p_visibility,
      version = version + 1,
      updated_at = now()
  where id = p_note_id
  returning version into new_version;

  delete from public.family_note_members where note_id = p_note_id;
  if p_visibility = 'selected_members' then
    insert into public.family_note_members (note_id, family_id, user_id, added_by)
    select p_note_id, note_row.family_id, requested.user_id, caller_id
    from (
      select distinct input.user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where input.user_id <> caller_id
    ) as requested;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    note_row.family_id, caller_id, 'notes.note_updated', 'notes', 'family_note', p_note_id,
    jsonb_build_object('previous_version', p_version, 'visibility', p_visibility)
  );
  return new_version;
end;
$$;

create or replace function public.set_family_note_archived(
  p_note_id uuid,
  p_version bigint,
  p_archived boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  note_row public.family_notes%rowtype;
  new_version bigint;
begin
  select * into note_row
  from public.family_notes
  where id = p_note_id
  for update;
  if note_row.id is null then
    raise exception 'Family note not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_family_note(p_note_id, caller_id) then
    raise exception 'Family note permission denied' using errcode = '42501';
  end if;
  if note_row.version <> p_version then
    raise exception 'Family note changed concurrently' using errcode = '40001';
  end if;

  update public.family_notes
  set archived_at = case when p_archived then now() else null end,
      version = version + 1,
      updated_at = now()
  where id = p_note_id
  returning version into new_version;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    note_row.family_id, caller_id, 'notes.archive_changed', 'notes', 'family_note', p_note_id,
    jsonb_build_object('archived', p_archived, 'previous_version', p_version)
  );
  return new_version;
end;
$$;

revoke all on function public.create_family_note(uuid, text, text, text, uuid[])
  from public, anon;
revoke all on function public.update_family_note(uuid, bigint, text, text, text, uuid[])
  from public, anon;
revoke all on function public.set_family_note_archived(uuid, bigint, boolean)
  from public, anon;
grant execute on function public.create_family_note(uuid, text, text, text, uuid[])
  to authenticated;
grant execute on function public.update_family_note(uuid, bigint, text, text, text, uuid[])
  to authenticated;
grant execute on function public.set_family_note_archived(uuid, bigint, boolean)
  to authenticated;

commit;
