begin;

create table private.family_storage_limits (
  family_id uuid primary key references public.families(id) on delete cascade,
  limit_bytes bigint not null check (limit_bytes > 0)
);
alter table private.family_storage_limits enable row level security;
revoke all on private.family_storage_limits from public, anon, authenticated, service_role;

create function private.family_storage_used_bytes(
  p_family_id uuid, p_bucket_id text, p_name text, p_object_id uuid, p_limit_bytes bigint
)
returns numeric
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(case
      when object.metadata ->> 'size' ~ '^[0-9]{1,19}$'
        then (object.metadata ->> 'size')::numeric
      else p_limit_bytes::numeric
    end), 0)
  from storage.objects object
  where (p_object_id is null or object.id <> p_object_id)
    and not (
      (object.bucket_id, object.name) = (p_bucket_id, p_name)
      and not coalesce((to_jsonb(object) ->> 'is_versioned')::boolean, false)
      and to_jsonb(object) ->> 'archived_at' is null
      and not coalesce((to_jsonb(object) ->> 'is_delete_marker')::boolean, false)
    )
    and (
      (object.bucket_id in ('gift-images', 'family-documents') and split_part(object.name, '/', 1) = p_family_id::text)
      or (object.bucket_id = 'expense-receipts' and split_part(object.name, '/', 1) in (
        select id::text from public.expense_collections where family_id = p_family_id
      ))
    );
$$;
revoke all on function private.family_storage_used_bytes(uuid, text, text, uuid, bigint)
  from public, anon, authenticated, service_role;

create function private.enforce_family_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  family uuid;
  scope_id uuid;
  bytes numeric;
  used_bytes numeric;
  allowed_bytes bigint;
begin
  if new.bucket_id not in ('gift-images', 'expense-receipts', 'family-documents') then
    return new;
  end if;
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception using errcode = '42501', message = 'Direct storage uploads are forbidden';
  end if;
  if tg_op = 'UPDATE' then
    if new.bucket_id is not distinct from old.bucket_id
      and new.name is not distinct from old.name
      and new.metadata is not distinct from old.metadata
      and to_jsonb(new) -> 'is_versioned' is not distinct from to_jsonb(old) -> 'is_versioned'
      and to_jsonb(new) -> 'archived_at' is not distinct from to_jsonb(old) -> 'archived_at'
      and to_jsonb(new) -> 'is_delete_marker' is not distinct from to_jsonb(old) -> 'is_delete_marker' then
      return new;
    end if;
  end if;
  if coalesce((to_jsonb(new) ->> 'is_versioned')::boolean, false)
    or to_jsonb(new) ->> 'archived_at' is not null
    or coalesce((to_jsonb(new) ->> 'is_delete_marker')::boolean, false) then
    raise exception using errcode = '22023', message = 'Versioned family storage is not supported';
  end if;
  if new.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+/[^/]+$' then
    raise exception using errcode = '22023', message = 'Invalid storage scope';
  end if;
  scope_id := split_part(new.name, '/', 1)::uuid;
  if new.bucket_id = 'expense-receipts' then
    select collection.family_id into family
    from public.expense_collections collection where collection.id = scope_id;
  else
    select id into family from public.families where id = scope_id;
  end if;
  if family is null then
    raise exception using errcode = '22023', message = 'Invalid storage scope';
  end if;

  -- Storage tests permission with a size-less version '1' row and rolls it back.
  if new.version = '1' and (new.metadata is null or (
    jsonb_typeof(new.metadata) = 'object' and not (new.metadata ? 'size')
  )) then
    return new;
  end if;
  if jsonb_typeof(new.metadata -> 'size') not in ('number', 'string')
    or new.metadata ->> 'size' is null
    or new.metadata ->> 'size' !~ '^[0-9]{1,19}$' then
    raise exception using errcode = '22023', message = 'Invalid storage size';
  end if;
  bytes := (new.metadata ->> 'size')::numeric;
  if bytes > 9223372036854775807 then
    raise exception using errcode = '22023', message = 'Invalid storage size';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'Storage quota requires read committed isolation';
  end if;

  -- A fresh snapshot after the family lock includes the preceding upload's commit.
  perform pg_advisory_xact_lock(hashtextextended('family-storage:' || family::text, 0));
  select coalesce((select limit_bytes from private.family_storage_limits where family_id = family), 1073741824)
    into allowed_bytes;
  used_bytes := private.family_storage_used_bytes(family, new.bucket_id, new.name, new.id, allowed_bytes);
  if used_bytes + bytes > allowed_bytes then
    raise exception using errcode = 'P0001', message = 'FAMILY_STORAGE_QUOTA_EXCEEDED';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_family_storage_quota() from public, anon, authenticated, service_role;

create trigger enforce_family_storage_quota
before insert or update on storage.objects
for each row execute function private.enforce_family_storage_quota();

create function private.reject_unfinished_storage_probe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from storage.objects
    where id = new.id
      and bucket_id in ('gift-images', 'expense-receipts', 'family-documents')
      and metadata ->> 'size' is null
  ) then
    raise exception using errcode = '22023', message = 'Invalid storage size';
  end if;
  return null;
end;
$$;
revoke all on function private.reject_unfinished_storage_probe() from public, anon, authenticated, service_role;
create constraint trigger reject_unfinished_storage_probe
after insert or update on storage.objects
deferrable initially deferred
for each row execute function private.reject_unfinished_storage_probe();

create function public.family_storage_has_capacity(
  p_bucket_id text, p_name text, p_size_bytes bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  family uuid;
  scope_id uuid;
  allowed_bytes bigint;
begin
  if p_size_bytes is null or p_size_bytes < 0 then
    raise exception using errcode = '22023', message = 'Invalid storage size';
  end if;
  if p_bucket_id is null or p_bucket_id not in ('gift-images', 'expense-receipts', 'family-documents')
    or p_name is null
    or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+/[^/]+$' then
    raise exception using errcode = '22023', message = 'Invalid storage scope';
  end if;
  scope_id := split_part(p_name, '/', 1)::uuid;
  if p_bucket_id = 'expense-receipts' then
    select family_id into family from public.expense_collections where id = scope_id;
  else
    select id into family from public.families where id = scope_id;
  end if;
  if family is null then
    raise exception using errcode = '22023', message = 'Invalid storage scope';
  end if;
  select coalesce((select limit_bytes from private.family_storage_limits where family_id = family), 1073741824)
    into allowed_bytes;
  return private.family_storage_used_bytes(family, p_bucket_id, p_name, null, allowed_bytes)
    + p_size_bytes::numeric <= allowed_bytes;
end;
$$;
revoke all on function public.family_storage_has_capacity(text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.family_storage_has_capacity(text, text, bigint) to service_role;

commit;
