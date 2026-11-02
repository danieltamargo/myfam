begin;

create or replace function public.set_family_list_type(p_list_id uuid, p_version bigint, p_list_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  list_row public.family_lists%rowtype;
begin
  perform private.require_session_mfa();
  select * into list_row from public.family_lists
  where id = p_list_id and private.can_edit_family_list(id, (select auth.uid()))
  for update;
  if list_row.id is null
    or not private.can_edit_family_list(p_list_id, (select auth.uid())) then
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

notify pgrst, 'reload schema';
commit;
