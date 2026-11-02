begin;

alter table public.family_lists
  add column list_type text not null default 'other'
    check (list_type in ('shopping', 'home', 'other'));

create function public.create_typed_family_list(
  p_family_id uuid, p_title text, p_description text, p_visibility text,
  p_member_ids uuid[], p_list_type text, p_source_list_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_row public.family_lists%rowtype;
  new_list_id uuid;
begin
  perform private.require_session_mfa();
  if p_list_type is null or p_list_type not in ('shopping', 'home', 'other') then
    raise exception 'Invalid list type' using errcode = '22023';
  end if;
  if p_source_list_id is not null then
    select * into source_row from public.family_lists where id = p_source_list_id for share;
    if source_row.id is null or source_row.family_id <> p_family_id
      or not private.can_view_family_list(p_source_list_id, caller_id) then
      raise exception 'Template is not available' using errcode = '42501';
    end if;
    -- A restricted source must never become a broadly shared copy.
    if source_row.visibility <> 'family' and p_visibility <> 'private' then
      raise exception 'Restricted templates require a private destination' using errcode = '42501';
    end if;
  end if;
  new_list_id := public.create_family_list(
    p_family_id, p_title, p_description, p_visibility, p_member_ids
  );
  update public.family_lists set list_type = p_list_type where id = new_list_id;
  if p_source_list_id is not null then
    insert into public.family_list_items (list_id, created_by, title, quantity, unit, sort_order)
    select new_list_id, caller_id, item.title, item.quantity, item.unit,
      (row_number() over (order by item.sort_order, item.id)) * 1024
    from (
      select distinct on (translate(lower(regexp_replace(btrim(title), '\s+', ' ', 'g')), 'áéíóúüñ', 'aeiouun')) *
      from public.family_list_items where list_id = p_source_list_id
      order by translate(lower(regexp_replace(btrim(title), '\s+', ' ', 'g')), 'áéíóúüñ', 'aeiouun'), sort_order, id
    ) as item;
  end if;
  return new_list_id;
end;
$$;

create function public.set_family_list_type(p_list_id uuid, p_version bigint, p_list_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  list_row public.family_lists%rowtype;
begin
  perform private.require_session_mfa();
  select * into list_row from public.family_lists where id = p_list_id for update;
  if list_row.id is null then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_family_list(p_list_id, (select auth.uid())) then
    raise exception 'List permission denied' using errcode = '42501';
  end if;
  if list_row.archived_at is not null or p_list_type is null
    or p_list_type not in ('shopping', 'home', 'other') then
    raise exception 'Invalid list type or archived list' using errcode = '22023';
  end if;
  if p_version is null or list_row.version <> p_version then
    raise exception 'List changed' using errcode = 'PT409';
  end if;
  update public.family_lists
  set list_type = p_list_type, version = version + 1, updated_at = now()
  where id = p_list_id;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    list_row.family_id, (select auth.uid()), 'lists.type_updated', 'lists', 'family_list', p_list_id,
    jsonb_build_object('list_type', p_list_type)
  );
end;
$$;

revoke all on function public.create_typed_family_list(uuid, text, text, text, uuid[], text, uuid) from public, anon;
revoke all on function public.set_family_list_type(uuid, bigint, text) from public, anon;
grant execute on function public.create_typed_family_list(uuid, text, text, text, uuid[], text, uuid) to authenticated;
grant execute on function public.set_family_list_type(uuid, bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
