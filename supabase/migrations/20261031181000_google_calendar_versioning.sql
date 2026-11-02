begin;

create or replace function public.apply_google_calendar_event(
  p_connection_id uuid, p_lease_id uuid, p_remote_event_id text, p_etag text,
  p_event jsonb, p_force boolean default false, p_expected_version bigint default null
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  connection public.external_connections%rowtype;
  link public.calendar_external_event_links%rowtype;
  local_event public.calendar_events%rowtype;
  event_id uuid;
  event_version bigint;
  reminder_minutes integer;
begin
  select * into connection from public.external_connections
  where id = p_connection_id and provider = 'google_calendar'
    and sync_lease_id = p_lease_id and sync_lease_until > now() for update;
  if connection.id is null or not exists (select 1 from public.family_members where family_id = connection.family_id and user_id = connection.user_id) then
    raise exception 'Connection unavailable' using errcode = '42501';
  end if;
  select * into link from public.calendar_external_event_links
  where connection_id = p_connection_id and remote_event_id = p_remote_event_id for update;
  if found and link.local_event_id is not null then
    select * into local_event from public.calendar_events where id = link.local_event_id for update;
    if local_event.created_by <> connection.user_id or local_event.family_id <> connection.family_id then
      raise exception 'Event ownership mismatch' using errcode = '42501';
    end if;
    if (not p_force and local_event.version <> link.local_version)
      or (p_force and local_event.version is distinct from p_expected_version) then
      update public.calendar_external_event_links set conflict = 'both_changed'
      where connection_id = p_connection_id and remote_event_id = p_remote_event_id;
      return 'conflict';
    end if;
    if not p_force and p_event is not null and link.remote_etag = p_etag then return 'applied'; end if;
  end if;
  if p_event is null then
    if local_event.id is not null then delete from public.calendar_events where id = local_event.id; end if;
    update public.calendar_external_event_links set remote_deleted = true, conflict = null
    where connection_id = p_connection_id and remote_event_id = p_remote_event_id;
    return 'deleted';
  end if;
  if link.connection_id is not null and link.local_event_id is null then return 'deleted'; end if;
  if local_event.id is null then
    insert into public.calendar_events (family_id, created_by, title, description, starts_at, ends_at, timezone, all_day, visibility)
    values (connection.family_id, connection.user_id, p_event->>'title', p_event->>'description',
      (p_event->>'startsAt')::timestamptz, (p_event->>'endsAt')::timestamptz,
      p_event->>'timezone', (p_event->>'allDay')::boolean, 'selected_members')
    returning id, version into event_id, event_version;
    insert into public.calendar_event_participants(event_id, family_id, user_id, response)
    values (event_id, connection.family_id, connection.user_id, 'accepted');
    insert into public.calendar_external_event_links(connection_id, remote_event_id, local_event_id, direction, remote_etag, local_version)
    values (p_connection_id, p_remote_event_id, event_id, 'imported', p_etag, event_version);
  else
    select minutes_before into reminder_minutes from public.calendar_event_reminders
      where calendar_event_reminders.event_id = local_event.id limit 1;
    update public.calendar_events set title = p_event->>'title', description = p_event->>'description',
      starts_at = (p_event->>'startsAt')::timestamptz, ends_at = (p_event->>'endsAt')::timestamptz,
      timezone = p_event->>'timezone', all_day = (p_event->>'allDay')::boolean,
      version = version + 1, updated_at = now()
    where id = local_event.id returning version into event_version;
    perform private.sync_calendar_reminders(local_event.id, reminder_minutes);
    update public.calendar_external_event_links set remote_etag = p_etag, local_version = event_version, conflict = null, remote_deleted = false
    where connection_id = p_connection_id and remote_event_id = p_remote_event_id;
  end if;
  return 'applied';
end;
$$;

commit;
