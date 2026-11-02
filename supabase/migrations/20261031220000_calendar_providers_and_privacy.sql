begin;

alter table public.external_connections drop constraint external_connections_provider_check;
alter table public.external_connections add constraint external_connections_provider_check
  check (provider in ('google_calendar', 'microsoft_calendar', 'github'));

create or replace function private.can_manage_calendar_event(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.calendar_events as event
    join public.family_members as member on member.family_id = event.family_id and member.user_id = p_user_id
    where event.id = p_event_id and (
      event.created_by = p_user_id or (
        member.role in ('owner', 'admin')
        and private.can_view_calendar_event(event.id, p_user_id)
        and not exists (
          select 1 from public.calendar_external_event_links as link
          where link.local_event_id = event.id and link.direction = 'imported'
        )
      )
    )
  );
$$;

-- Keep the shared RPC names and current locking/version checks intact.
do $migration$
declare signature text; definition text; rewritten text;
begin
  foreach signature in array array[
    'public.acquire_google_calendar_sync(uuid,uuid)',
    'public.apply_google_calendar_event(uuid,uuid,text,text,jsonb,boolean,bigint)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(signature));
    rewritten := replace(definition,
      $predicate$provider = 'google_calendar'$predicate$,
      $predicate$provider in ('google_calendar', 'microsoft_calendar')$predicate$);
    if rewritten is null or rewritten = definition then
      raise exception 'Expected calendar provider boundary is missing: %', signature;
    end if;
    execute rewritten;
  end loop;
end;
$migration$;

-- Hidden event identifiers behave like missing identifiers at mutation entry points.
do $migration$
declare signature text; definition text; rewritten text;
begin
  foreach signature in array array[
    'public.delete_calendar_event(uuid,bigint)',
    'public.update_calendar_event(uuid,bigint,text,text,timestamp with time zone,timestamp with time zone,text,boolean,text,uuid[],text,integer,timestamp with time zone,integer,uuid,integer)'
  ] loop
    definition := pg_get_functiondef(to_regprocedure(signature));
    rewritten := regexp_replace(definition,
      'where event\.id = p_event_id([[:space:]]+)for update;',
      $predicate$where event.id = p_event_id and private.can_view_calendar_event(event.id, caller_id)\1for update;$predicate$,
      'g');
    if rewritten is null or rewritten = definition then
      raise exception 'Expected calendar visibility boundary is missing: %', signature;
    end if;
    execute rewritten;
  end loop;
end;
$migration$;

create or replace function public.record_google_calendar_export(
  p_connection_id uuid, p_lease_id uuid, p_remote_event_id text, p_etag text,
  p_local_event_id uuid, p_local_version bigint
)
returns void language plpgsql security definer set search_path = ''
as $$
declare connection public.external_connections%rowtype;
begin
  select * into connection from public.external_connections
    where id = p_connection_id and provider in ('google_calendar', 'microsoft_calendar')
      and sync_lease_id = p_lease_id and sync_lease_until > now() for update;
  if connection.id is null or not exists (
    select 1 from public.family_members where family_id = connection.family_id and user_id = connection.user_id
  ) then
    raise exception 'Connection unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.calendar_events where id = p_local_event_id
      and created_by = connection.user_id and family_id = connection.family_id and recurrence_frequency = 'none'
  ) then
    raise exception 'Only own non-recurring events can be exported' using errcode = '42501';
  end if;
  insert into public.calendar_external_event_links(
    connection_id, remote_event_id, local_event_id, direction, remote_etag, local_version
  ) values (p_connection_id, p_remote_event_id, p_local_event_id, 'exported', p_etag, p_local_version)
  on conflict (connection_id, remote_event_id) do update set
    remote_etag = excluded.remote_etag, local_version = excluded.local_version,
    conflict = null, remote_deleted = false;
end;
$$;

create or replace function public.get_calendar_event_origins(p_family_id uuid, p_event_ids uuid[])
returns table(event_id uuid, origin text)
language plpgsql stable security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if not private.is_family_member(p_family_id, actor_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  return query
  select event.id, coalesce((
    select case connection.provider when 'google_calendar' then 'google'::text
      when 'microsoft_calendar' then 'outlook'::text end
    from public.calendar_external_event_links as link
    join public.external_connections as connection on connection.id = link.connection_id
    where link.local_event_id = event.id and link.direction = 'imported'
      and connection.family_id = event.family_id and connection.user_id = event.created_by
      and connection.provider in ('google_calendar', 'microsoft_calendar')
    order by link.connection_id limit 1
  ), 'internal'::text)
  from public.calendar_events as event
  where event.family_id = p_family_id and event.id = any(p_event_ids)
    and private.can_view_calendar_event(event.id, actor_id);
end;
$$;

revoke all on function public.acquire_google_calendar_sync(uuid,uuid) from public, anon, authenticated;
revoke all on function public.apply_google_calendar_event(uuid,uuid,text,text,jsonb,boolean,bigint) from public, anon, authenticated;
revoke all on function public.record_google_calendar_export(uuid,uuid,text,text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.acquire_google_calendar_sync(uuid,uuid) to service_role;
grant execute on function public.apply_google_calendar_event(uuid,uuid,text,text,jsonb,boolean,bigint) to service_role;
grant execute on function public.record_google_calendar_export(uuid,uuid,text,text,uuid,bigint) to service_role;
revoke all on function public.get_calendar_event_origins(uuid,uuid[]) from public, anon;
grant execute on function public.get_calendar_event_origins(uuid,uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
