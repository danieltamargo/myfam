begin;

revoke all on public.external_connections from authenticated;
grant select (id, family_id, user_id, provider, expires_at, metadata, connected_at, updated_at)
  on public.external_connections to authenticated;
grant all on public.external_connections to service_role;
alter table public.external_connections
  add column sync_lease_id uuid,
  add column sync_lease_until timestamptz;

create table public.calendar_oauth_states (
  nonce_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.calendar_oauth_states enable row level security;
revoke all on public.calendar_oauth_states from public, anon, authenticated;
grant all on public.calendar_oauth_states to service_role;

create table public.calendar_external_event_links (
  connection_id uuid not null references public.external_connections(id) on delete cascade,
  remote_event_id text not null check (char_length(remote_event_id) between 1 and 1024),
  local_event_id uuid references public.calendar_events(id) on delete set null,
  direction text not null check (direction in ('imported', 'exported')),
  remote_etag text not null,
  local_version bigint not null,
  remote_deleted boolean not null default false,
  conflict text,
  primary key (connection_id, remote_event_id),
  unique (connection_id, local_event_id)
);
alter table public.calendar_external_event_links enable row level security;
revoke all on public.calendar_external_event_links from public, anon, authenticated;
grant select on public.calendar_external_event_links to authenticated;
grant all on public.calendar_external_event_links to service_role;
create policy calendar_external_links_owner on public.calendar_external_event_links
  for select to authenticated using (exists (
    select 1 from public.external_connections as connection
    where connection.id = connection_id and connection.user_id = (select auth.uid())
      and private.is_family_member(connection.family_id, (select auth.uid()))
  ));

create or replace function private.can_manage_calendar_event(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.calendar_events as event
    join public.family_members as member on member.family_id = event.family_id and member.user_id = p_user_id
    where event.id = p_event_id and (
      event.created_by = p_user_id or (
        member.role in ('owner', 'admin') and not exists (
          select 1 from public.calendar_external_event_links as link
          where link.local_event_id = event.id and link.direction = 'imported'
        )
      )
    )
  );
$$;

create function public.acquire_google_calendar_sync(p_connection_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare lease_id uuid := gen_random_uuid();
begin
  update public.external_connections set sync_lease_id = lease_id, sync_lease_until = now() + interval '10 minutes'
  where id = p_connection_id and user_id = p_user_id and provider = 'google_calendar'
    and exists (select 1 from public.family_members where family_members.family_id = external_connections.family_id and family_members.user_id = p_user_id)
    and (sync_lease_until is null or sync_lease_until < now());
  if not found then raise exception 'Connection unavailable or synchronizing' using errcode = '40001'; end if;
  return lease_id;
end;
$$;

create function public.apply_google_calendar_event(
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
      timezone = p_event->>'timezone', all_day = (p_event->>'allDay')::boolean
    where id = local_event.id returning version into event_version;
    perform private.sync_calendar_reminders(local_event.id, reminder_minutes);
    update public.calendar_external_event_links set remote_etag = p_etag, local_version = event_version, conflict = null, remote_deleted = false
    where connection_id = p_connection_id and remote_event_id = p_remote_event_id;
  end if;
  return 'applied';
end;
$$;

create function public.record_google_calendar_export(
  p_connection_id uuid, p_lease_id uuid, p_remote_event_id text, p_etag text,
  p_local_event_id uuid, p_local_version bigint
)
returns void language plpgsql security definer set search_path = ''
as $$
declare connection public.external_connections%rowtype;
begin
  select * into connection from public.external_connections
    where id = p_connection_id and sync_lease_id = p_lease_id and sync_lease_until > now() for update;
  if connection.id is null or not exists (select 1 from public.family_members where family_id = connection.family_id and user_id = connection.user_id) then
    raise exception 'Connection unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.calendar_events where id = p_local_event_id
    and created_by = connection.user_id and family_id = connection.family_id and recurrence_frequency = 'none') then
    raise exception 'Only own non-recurring events can be exported' using errcode = '42501';
  end if;
  insert into public.calendar_external_event_links(connection_id, remote_event_id, local_event_id, direction, remote_etag, local_version)
  values (p_connection_id, p_remote_event_id, p_local_event_id, 'exported', p_etag, p_local_version)
  on conflict (connection_id, remote_event_id) do update set
    remote_etag = excluded.remote_etag, local_version = excluded.local_version, conflict = null, remote_deleted = false;
end;
$$;

create function private.delete_imported_google_events()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.calendar_events where id in (
    select local_event_id from public.calendar_external_event_links
    where connection_id = old.id and direction = 'imported'
  );
  return old;
end;
$$;
create trigger remove_imported_google_events before delete on public.external_connections
  for each row execute function private.delete_imported_google_events();

revoke all on function private.delete_imported_google_events() from public, anon, authenticated;
revoke all on function public.acquire_google_calendar_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_google_calendar_event(uuid, uuid, text, text, jsonb, boolean, bigint) from public, anon, authenticated;
revoke all on function public.record_google_calendar_export(uuid, uuid, text, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.acquire_google_calendar_sync(uuid, uuid) to service_role;
grant execute on function public.apply_google_calendar_event(uuid, uuid, text, text, jsonb, boolean, bigint) to service_role;
grant execute on function public.record_google_calendar_export(uuid, uuid, text, text, uuid, bigint) to service_role;

commit;
