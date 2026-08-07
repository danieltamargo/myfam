begin;

create table public.family_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  display_name text not null check (
    char_length(btrim(display_name)) between 1 and 180
    and display_name !~ '[/\\]'
    and display_name !~ '[[:cntrl:]]'
  ),
  original_name text not null check (
    char_length(btrim(original_name)) between 1 and 180
    and original_name !~ '[/\\]'
    and original_name !~ '[[:cntrl:]]'
  ),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  storage_path text not null unique check (
    char_length(storage_path) <= 512
    and storage_path !~ '\.\.'
    and storage_path !~ '[\\]'
    and storage_path !~ '://'
  ),
  folder_name text check (
    folder_name is null
    or (
      char_length(btrim(folder_name)) between 1 and 80
      and folder_name not in ('.', '..')
      and folder_name !~ '[/\\]'
      and folder_name !~ '[[:cntrl:]]'
    )
  ),
  visibility text not null default 'private'
    check (visibility in ('private', 'selected_members')),
  expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'deleting')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id)
);

create table public.family_document_members (
  document_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (document_id, user_id),
  foreign key (family_id, document_id)
    references public.family_documents(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create index family_documents_family_status_updated_idx
  on public.family_documents (family_id, status, updated_at desc, id desc);
create index family_documents_family_folder_idx
  on public.family_documents (family_id, folder_name, updated_at desc, id desc)
  where status = 'active';
create index family_documents_owner_idx
  on public.family_documents (owner_id, family_id, updated_at desc);
create index family_documents_expiry_idx
  on public.family_documents (expires_at, id)
  where status = 'active' and expires_at is not null;
create index family_document_members_user_idx
  on public.family_document_members (user_id, family_id, document_id);
create index family_document_members_added_by_idx
  on public.family_document_members (added_by, document_id);

alter table public.family_documents enable row level security;
alter table public.family_document_members enable row level security;

create or replace function private.can_manage_family_document(
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_documents as document
      join public.family_members as member
        on member.family_id = document.family_id
       and member.user_id = p_user_id
      where document.id = p_document_id
        and document.owner_id = p_user_id
    );
$$;

create or replace function private.can_download_family_document(
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_documents as document
      join public.family_members as member
        on member.family_id = document.family_id
       and member.user_id = p_user_id
      where document.id = p_document_id
        and document.status = 'active'
        and (document.expires_at is null or document.expires_at > now())
        and (
          document.owner_id = p_user_id
          or exists (
            select 1
            from public.family_document_members as selected_member
            where selected_member.document_id = document.id
              and selected_member.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_read_family_document_metadata(
  p_document_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_family_document(p_document_id, p_user_id)
    or private.can_download_family_document(p_document_id, p_user_id);
$$;

revoke all on function private.can_manage_family_document(uuid, uuid) from public, anon;
revoke all on function private.can_download_family_document(uuid, uuid) from public, anon;
revoke all on function private.can_read_family_document_metadata(uuid, uuid) from public, anon;
grant execute on function private.can_manage_family_document(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_download_family_document(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_read_family_document_metadata(uuid, uuid) to authenticated, service_role;

create policy family_documents_select_visible
  on public.family_documents for select to authenticated
  using (private.can_read_family_document_metadata(id, (select auth.uid())));
create policy family_document_members_select_visible
  on public.family_document_members for select to authenticated
  using (private.can_read_family_document_metadata(document_id, (select auth.uid())));

grant select on table public.family_documents to authenticated;
grant select on table public.family_document_members to authenticated;
grant all privileges on table public.family_documents to service_role;
grant all privileges on table public.family_document_members to service_role;
revoke insert, update, delete on table public.family_documents from authenticated;
revoke insert, update, delete on table public.family_document_members from authenticated;

create or replace function private.bump_family_document_version()
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

create trigger bump_family_document_version_before_update
  before update on public.family_documents
  for each row execute function private.bump_family_document_version();
revoke all on function private.bump_family_document_version() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-documents',
  'family-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy family_documents_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'family-documents'
    and exists (
      select 1
      from public.family_documents as document
      where document.storage_path = name
        and private.can_download_family_document(document.id, (select auth.uid()))
    )
  );

create policy family_documents_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-documents'
    and exists (
      select 1
      from public.family_documents as document
      where document.storage_path = name
        and document.status = 'pending'
        and document.owner_id = (select auth.uid())
        and split_part(name, '/', 1) = document.family_id::text
        and split_part(name, '/', 2) = document.owner_id::text
        and split_part(name, '/', 3) = document.id::text
        and split_part(name, '/', 4) = ''
    )
  );

create policy family_documents_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'family-documents'
    and exists (
      select 1
      from public.family_documents as document
      where document.storage_path = name
        and private.can_manage_family_document(document.id, (select auth.uid()))
    )
  );

create or replace function public.begin_family_document_upload(
  p_family_id uuid,
  p_display_name text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_folder_name text default null,
  p_visibility text default 'private',
  p_member_ids uuid[] default array[]::uuid[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_document_id uuid := gen_random_uuid();
  new_storage_path text;
  selected_count integer;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  if p_visibility not in ('private', 'selected_members') then
    raise exception 'Invalid document visibility' using errcode = '22023';
  end if;
  if p_expires_at is not null
    and (p_expires_at <= now() or p_expires_at > now() + interval '10 years')
  then
    raise exception 'Document expiry outside allowed range' using errcode = '22023';
  end if;
  perform private.validate_family_member_ids(p_family_id, p_member_ids);
  select count(distinct requested.user_id)
  into selected_count
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as requested(user_id)
  where requested.user_id <> caller_id;
  if p_visibility = 'private' and selected_count > 0 then
    raise exception 'Private documents cannot have selected members' using errcode = '22023';
  end if;
  if p_visibility = 'selected_members' and selected_count = 0 then
    raise exception 'Selected documents require another family member' using errcode = '22023';
  end if;

  new_storage_path := format('%s/%s/%s', p_family_id, caller_id, new_document_id);
  insert into public.family_documents (
    id, family_id, owner_id, display_name, original_name, mime_type,
    size_bytes, storage_path, folder_name, visibility, expires_at
  ) values (
    new_document_id,
    p_family_id,
    caller_id,
    btrim(p_display_name),
    btrim(p_original_name),
    p_mime_type,
    p_size_bytes,
    new_storage_path,
    nullif(btrim(p_folder_name), ''),
    p_visibility,
    p_expires_at
  );

  if p_visibility = 'selected_members' then
    insert into public.family_document_members (document_id, family_id, user_id, added_by)
    select new_document_id, p_family_id, requested.user_id, caller_id
    from (
      select distinct user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where user_id <> caller_id
    ) as requested;
  end if;

  return jsonb_build_object(
    'document_id', new_document_id,
    'storage_path', new_storage_path
  );
end;
$$;

create or replace function public.complete_family_document_upload(p_document_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_row public.family_documents%rowtype;
  next_version bigint;
begin
  select * into document_row
  from public.family_documents
  where id = p_document_id
  for update;
  if document_row.id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  if document_row.status = 'active' then
    return document_row.version;
  end if;
  if document_row.status <> 'pending' then
    raise exception 'Document upload is not pending' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'family-documents'
      and object.name = document_row.storage_path
  ) then
    raise exception 'Document object is missing' using errcode = 'P0002';
  end if;

  update public.family_documents
  set status = 'active'
  where id = p_document_id
  returning version into next_version;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    document_row.family_id, caller_id, 'documents.uploaded', 'documents',
    'family_document', p_document_id,
    jsonb_build_object('mime_type', document_row.mime_type, 'size_bytes', document_row.size_bytes)
  );
  return next_version;
end;
$$;

create or replace function public.cancel_family_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  delete from public.family_documents
  where id = p_document_id and status = 'pending';
  if not found then
    raise exception 'Pending document not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.update_family_document_access(
  p_document_id uuid,
  p_version bigint,
  p_folder_name text,
  p_visibility text,
  p_member_ids uuid[],
  p_expires_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_row public.family_documents%rowtype;
  selected_count integer;
  next_version bigint;
begin
  select * into document_row
  from public.family_documents
  where id = p_document_id
  for update;
  if document_row.id is null or document_row.status <> 'active' then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  if document_row.version <> p_version then
    raise exception 'Family document changed concurrently' using errcode = '40001';
  end if;
  if p_visibility not in ('private', 'selected_members') then
    raise exception 'Invalid document visibility' using errcode = '22023';
  end if;
  if p_expires_at is not null
    and (p_expires_at <= now() or p_expires_at > now() + interval '10 years')
  then
    raise exception 'Document expiry outside allowed range' using errcode = '22023';
  end if;
  perform private.validate_family_member_ids(document_row.family_id, p_member_ids);
  select count(distinct requested.user_id)
  into selected_count
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as requested(user_id)
  where requested.user_id <> caller_id;
  if p_visibility = 'private' and selected_count > 0 then
    raise exception 'Private documents cannot have selected members' using errcode = '22023';
  end if;
  if p_visibility = 'selected_members' and selected_count = 0 then
    raise exception 'Selected documents require another family member' using errcode = '22023';
  end if;

  update public.family_documents
  set folder_name = nullif(btrim(p_folder_name), ''),
      visibility = p_visibility,
      expires_at = p_expires_at
  where id = p_document_id
  returning version into next_version;
  delete from public.family_document_members where document_id = p_document_id;
  if p_visibility = 'selected_members' then
    insert into public.family_document_members (document_id, family_id, user_id, added_by)
    select p_document_id, document_row.family_id, requested.user_id, caller_id
    from (
      select distinct user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where user_id <> caller_id
    ) as requested;
  end if;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    document_row.family_id, caller_id, 'documents.access_changed', 'documents',
    'family_document', p_document_id,
    jsonb_build_object(
      'visibility', p_visibility,
      'selected_count', selected_count,
      'expires_at', p_expires_at,
      'folder_name', nullif(btrim(p_folder_name), '')
    )
  );
  return next_version;
end;
$$;

create or replace function public.prepare_family_document_download(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_row public.family_documents%rowtype;
begin
  select * into document_row from public.family_documents where id = p_document_id;
  if document_row.id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_download_family_document(p_document_id, caller_id) then
    raise exception 'Document download permission required' using errcode = '42501';
  end if;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    document_row.family_id, caller_id, 'documents.downloaded', 'documents',
    'family_document', p_document_id, jsonb_build_object('mime_type', document_row.mime_type)
  );
  return document_row.storage_path;
end;
$$;

create or replace function public.prepare_family_document_delete(
  p_document_id uuid,
  p_version bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_row public.family_documents%rowtype;
begin
  select * into document_row
  from public.family_documents
  where id = p_document_id
  for update;
  if document_row.id is null or document_row.status <> 'active' then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  if document_row.version <> p_version then
    raise exception 'Family document changed concurrently' using errcode = '40001';
  end if;
  update public.family_documents set status = 'deleting' where id = p_document_id;
  return document_row.storage_path;
end;
$$;

create or replace function public.restore_family_document_delete(p_document_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_version bigint;
begin
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  update public.family_documents
  set status = 'active'
  where id = p_document_id and status = 'deleting'
  returning version into next_version;
  if next_version is null then
    raise exception 'Deleting document not found' using errcode = 'P0002';
  end if;
  return next_version;
end;
$$;

create or replace function public.complete_family_document_delete(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  document_row public.family_documents%rowtype;
begin
  select * into document_row
  from public.family_documents
  where id = p_document_id
  for update;
  if document_row.id is null then
    return;
  end if;
  if document_row.status <> 'deleting' then
    raise exception 'Deleting document not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_manage_family_document(p_document_id, caller_id) then
    raise exception 'Document owner permission required' using errcode = '42501';
  end if;
  delete from public.family_documents where id = p_document_id;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    document_row.family_id, caller_id, 'documents.deleted', 'documents',
    'family_document', p_document_id,
    jsonb_build_object('mime_type', document_row.mime_type, 'size_bytes', document_row.size_bytes)
  );
end;
$$;

revoke all on function public.begin_family_document_upload(uuid, text, text, text, bigint, text, text, uuid[], timestamptz) from public, anon;
revoke all on function public.complete_family_document_upload(uuid) from public, anon;
revoke all on function public.cancel_family_document_upload(uuid) from public, anon;
revoke all on function public.update_family_document_access(uuid, bigint, text, text, uuid[], timestamptz) from public, anon;
revoke all on function public.prepare_family_document_download(uuid) from public, anon;
revoke all on function public.prepare_family_document_delete(uuid, bigint) from public, anon;
revoke all on function public.restore_family_document_delete(uuid) from public, anon;
revoke all on function public.complete_family_document_delete(uuid) from public, anon;
grant execute on function public.begin_family_document_upload(uuid, text, text, text, bigint, text, text, uuid[], timestamptz) to authenticated, service_role;
grant execute on function public.complete_family_document_upload(uuid) to authenticated, service_role;
grant execute on function public.cancel_family_document_upload(uuid) to authenticated, service_role;
grant execute on function public.update_family_document_access(uuid, bigint, text, text, uuid[], timestamptz) to authenticated, service_role;
grant execute on function public.prepare_family_document_download(uuid) to authenticated, service_role;
grant execute on function public.prepare_family_document_delete(uuid, bigint) to authenticated, service_role;
grant execute on function public.restore_family_document_delete(uuid) to authenticated, service_role;
grant execute on function public.complete_family_document_delete(uuid) to authenticated, service_role;

comment on table public.family_documents is 'Private family document metadata; storage paths are server-generated and never user-provided.';
comment on table public.family_document_members is 'Explicit readers for selected family documents; family roles do not bypass this ACL.';
comment on column public.family_documents.folder_name is 'Logical folder label only; never part of the object path.';
comment on column public.family_documents.storage_path is 'Canonical private object path generated from trusted UUIDs.';

commit;
