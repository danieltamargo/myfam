begin;

create function public.get_calendar_event_origins(p_family_id uuid, p_event_ids uuid[])
returns table (event_id uuid, origin text)
language plpgsql stable security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.is_family_member(p_family_id, actor_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  return query select event.id, case when exists (
    select 1 from public.calendar_external_event_links as link
    where link.local_event_id = event.id and link.direction = 'imported'
  ) then 'google'::text else 'internal'::text end
  from public.calendar_events as event
  where event.family_id = p_family_id and event.id = any(p_event_ids)
    and private.can_view_calendar_event(event.id, actor_id);
end;
$$;
revoke all on function public.get_calendar_event_origins(uuid, uuid[]) from public, anon;
grant execute on function public.get_calendar_event_origins(uuid, uuid[]) to authenticated;

commit;
