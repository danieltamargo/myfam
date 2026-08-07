begin;

create or replace function private.is_iana_timezone(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names as timezone_name
    where timezone_name.name = p_timezone
      and timezone_name.name !~ '^(posix|right)/'
  );
$$;

revoke all on function private.is_iana_timezone(text) from public, anon, authenticated;
grant execute on function private.is_iana_timezone(text) to service_role;

create unique index if not exists gift_event_categories_family_id_id_idx
  on public.gift_event_categories (family_id, id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (private.is_iana_timezone(timezone)),
  all_day boolean not null default false,
  visibility text not null default 'family'
    check (visibility in ('family', 'selected_members')),
  recurrence_frequency text not null default 'none'
    check (recurrence_frequency in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_interval smallint not null default 1
    check (recurrence_interval between 1 and 30),
  recurrence_until timestamptz,
  recurrence_count smallint check (recurrence_count between 1 and 366),
  wishlist_category_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, wishlist_category_id)
    references public.gift_event_categories(family_id, id) on delete set null,
  check (ends_at > starts_at),
  check (
    not all_day
    or (
      (starts_at at time zone timezone)::time = time '00:00'
      and (ends_at at time zone timezone)::time = time '00:00'
    )
  ),
  check (
    (recurrence_frequency = 'none' and recurrence_until is null and recurrence_count is null)
    or (
      recurrence_frequency <> 'none'
      and recurrence_until is not null
      and recurrence_until >= starts_at
      and recurrence_until <= starts_at + interval '2 years'
    )
  )
);

create table public.calendar_event_participants (
  event_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'pending'
    check (response in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (family_id, event_id)
    references public.calendar_events(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.calendar_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_start timestamptz not null,
  minutes_before integer not null check (minutes_before between 0 and 10080),
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, recipient_id, occurrence_start, minutes_before)
);

create index calendar_events_family_start_id_idx
  on public.calendar_events (family_id, starts_at, id);
create index calendar_events_family_created_by_idx
  on public.calendar_events (family_id, created_by, starts_at);
create index calendar_events_wishlist_category_idx
  on public.calendar_events (wishlist_category_id)
  where wishlist_category_id is not null;
create index calendar_participants_user_family_event_idx
  on public.calendar_event_participants (user_id, family_id, event_id);
create index calendar_reminders_due_idx
  on public.calendar_event_reminders (scheduled_for, id)
  where delivered_at is null;
create index calendar_reminders_recipient_idx
  on public.calendar_event_reminders (recipient_id, scheduled_for desc);

alter table public.calendar_events enable row level security;
alter table public.calendar_event_participants enable row level security;
alter table public.calendar_event_reminders enable row level security;

create or replace function private.can_view_calendar_event(
  p_event_id uuid,
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
      from public.calendar_events as event
      join public.family_members as family_member
        on family_member.family_id = event.family_id
       and family_member.user_id = p_user_id
      where event.id = p_event_id
        and (
          event.visibility = 'family'
          or event.created_by = p_user_id
          or exists (
            select 1
            from public.calendar_event_participants as participant
            where participant.event_id = event.id
              and participant.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_manage_calendar_event(
  p_event_id uuid,
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
      from public.calendar_events as event
      join public.family_members as family_member
        on family_member.family_id = event.family_id
       and family_member.user_id = p_user_id
      where event.id = p_event_id
        and (
          event.created_by = p_user_id
          or family_member.role in ('owner', 'admin')
        )
    );
$$;

revoke all on function private.can_view_calendar_event(uuid, uuid) from public, anon;
revoke all on function private.can_manage_calendar_event(uuid, uuid) from public, anon;
grant execute on function private.can_view_calendar_event(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_calendar_event(uuid, uuid) to authenticated, service_role;

create policy calendar_events_select_visible
  on public.calendar_events for select
  to authenticated
  using (private.can_view_calendar_event(id, (select auth.uid())));

create policy calendar_participants_select_visible_event
  on public.calendar_event_participants for select
  to authenticated
  using (private.can_view_calendar_event(event_id, (select auth.uid())));

create policy calendar_reminders_select_recipient
  on public.calendar_event_reminders for select
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and private.can_view_calendar_event(event_id, (select auth.uid()))
  );

grant select on table public.calendar_events to authenticated;
grant select on table public.calendar_event_participants to authenticated;
grant select on table public.calendar_event_reminders to authenticated;
revoke insert, update, delete on table public.calendar_events from anon, authenticated;
revoke insert, update, delete on table public.calendar_event_participants from anon, authenticated;
revoke insert, update, delete on table public.calendar_event_reminders from anon, authenticated;
grant all privileges on table public.calendar_events to service_role;
grant all privileges on table public.calendar_event_participants to service_role;
grant all privileges on table public.calendar_event_reminders to service_role;

create or replace function private.expand_calendar_event(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_frequency text,
  p_interval integer,
  p_until timestamptz,
  p_count integer,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  occurrence_start timestamptz,
  occurrence_end timestamptz,
  occurrence_index integer
)
language sql
stable
set search_path = ''
as $$
  with occurrence_numbers as (
    select series.value::integer as occurrence_index
    from generate_series(0, 365) as series(value)
    where p_frequency <> 'none' or series.value = 0
  ), expanded as (
    select
      case p_frequency
        when 'daily' then
          ((p_starts_at at time zone p_timezone) + make_interval(days => occurrence_index * p_interval))
            at time zone p_timezone
        when 'weekly' then
          ((p_starts_at at time zone p_timezone) + make_interval(days => occurrence_index * p_interval * 7))
            at time zone p_timezone
        when 'monthly' then
          ((p_starts_at at time zone p_timezone) + make_interval(months => occurrence_index * p_interval))
            at time zone p_timezone
        else p_starts_at
      end as occurrence_start,
      case p_frequency
        when 'daily' then
          ((p_ends_at at time zone p_timezone) + make_interval(days => occurrence_index * p_interval))
            at time zone p_timezone
        when 'weekly' then
          ((p_ends_at at time zone p_timezone) + make_interval(days => occurrence_index * p_interval * 7))
            at time zone p_timezone
        when 'monthly' then
          ((p_ends_at at time zone p_timezone) + make_interval(months => occurrence_index * p_interval))
            at time zone p_timezone
        else p_ends_at
      end as occurrence_end,
      occurrence_index
    from occurrence_numbers
    where p_count is null or occurrence_index < p_count
  )
  select expanded.occurrence_start, expanded.occurrence_end, expanded.occurrence_index
  from expanded
  where (p_frequency = 'none' or expanded.occurrence_start <= p_until)
    and expanded.occurrence_start < p_to
    and expanded.occurrence_end > p_from
  order by expanded.occurrence_start;
$$;

revoke all on function private.expand_calendar_event(
  timestamptz, timestamptz, text, text, integer, timestamptz, integer, timestamptz, timestamptz
) from public, anon;
grant execute on function private.expand_calendar_event(
  timestamptz, timestamptz, text, text, integer, timestamptz, integer, timestamptz, timestamptz
) to authenticated, service_role;

create or replace function public.get_calendar_occurrences(
  p_family_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_participant_id uuid default null
)
returns table (
  event_id uuid,
  family_id uuid,
  title text,
  description text,
  occurrence_start timestamptz,
  occurrence_end timestamptz,
  occurrence_index integer,
  timezone text,
  all_day boolean,
  visibility text,
  created_by uuid,
  wishlist_category_id uuid,
  version bigint,
  participant_ids uuid[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    event.id,
    event.family_id,
    event.title,
    event.description,
    occurrence.occurrence_start,
    occurrence.occurrence_end,
    occurrence.occurrence_index,
    event.timezone,
    event.all_day,
    event.visibility,
    event.created_by,
    event.wishlist_category_id,
    event.version,
    coalesce(
      (
        select array_agg(participant.user_id order by participant.user_id)
        from public.calendar_event_participants as participant
        where participant.event_id = event.id
      ),
      array[]::uuid[]
    )
  from public.calendar_events as event
  cross join lateral private.expand_calendar_event(
    event.starts_at,
    event.ends_at,
    event.timezone,
    event.recurrence_frequency,
    event.recurrence_interval,
    event.recurrence_until,
    event.recurrence_count,
    p_from,
    p_to
  ) as occurrence
  where event.family_id = p_family_id
    and p_from < p_to
    and p_to <= p_from + interval '2 years'
    and (
      p_participant_id is null
      or event.created_by = p_participant_id
      or exists (
        select 1
        from public.calendar_event_participants as participant_filter
        where participant_filter.event_id = event.id
          and participant_filter.user_id = p_participant_id
      )
    )
  order by occurrence.occurrence_start, event.id
  limit 1000;
$$;

revoke all on function public.get_calendar_occurrences(uuid, timestamptz, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_calendar_occurrences(uuid, timestamptz, timestamptz, uuid)
  to authenticated;

create or replace function private.validate_calendar_participants(
  p_family_id uuid,
  p_participant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(p_participant_ids, array[]::uuid[])) as requested(user_id)
    where not exists (
      select 1
      from public.family_members as member
      where member.family_id = p_family_id
        and member.user_id = requested.user_id
    )
  ) then
    raise exception 'Every participant must belong to the family' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.sync_calendar_reminders(
  p_event_id uuid,
  p_minutes_before integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.calendar_events%rowtype;
begin
  delete from public.calendar_event_reminders as reminder
  where reminder.event_id = p_event_id
    and reminder.delivered_at is null;

  if p_minutes_before is null then
    return;
  end if;

  if p_minutes_before not between 0 and 10080 then
    raise exception 'Invalid reminder offset' using errcode = '22023';
  end if;

  select * into event_row
  from public.calendar_events as event
  where event.id = p_event_id;

  insert into public.calendar_event_reminders (
    event_id,
    recipient_id,
    occurrence_start,
    minutes_before,
    scheduled_for
  )
  select
    event_row.id,
    participant.user_id,
    occurrence.occurrence_start,
    p_minutes_before,
    occurrence.occurrence_start - make_interval(mins => p_minutes_before)
  from public.calendar_event_participants as participant
  cross join lateral private.expand_calendar_event(
    event_row.starts_at,
    event_row.ends_at,
    event_row.timezone,
    event_row.recurrence_frequency,
    event_row.recurrence_interval,
    event_row.recurrence_until,
    event_row.recurrence_count,
    now(),
    coalesce(event_row.recurrence_until + interval '1 day', event_row.ends_at + interval '1 day')
  ) as occurrence
  where participant.event_id = event_row.id
    and occurrence.occurrence_start >= now()
  on conflict (event_id, recipient_id, occurrence_start, minutes_before) do nothing;
end;
$$;

revoke all on function private.validate_calendar_participants(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.sync_calendar_reminders(uuid, integer) from public, anon, authenticated;

create or replace function public.create_calendar_event(
  p_family_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_all_day boolean,
  p_visibility text,
  p_participant_ids uuid[],
  p_recurrence_frequency text default 'none',
  p_recurrence_interval integer default 1,
  p_recurrence_until timestamptz default null,
  p_recurrence_count integer default null,
  p_wishlist_category_id uuid default null,
  p_reminder_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  event_id uuid;
begin
  if caller_id is null
    or not exists (
      select 1 from public.family_members as member
      where member.family_id = p_family_id and member.user_id = caller_id
    )
  then
    raise exception 'Family membership required' using errcode = '42501';
  end if;

  perform private.validate_calendar_participants(p_family_id, p_participant_ids);

  insert into public.calendar_events (
    family_id,
    created_by,
    title,
    description,
    starts_at,
    ends_at,
    timezone,
    all_day,
    visibility,
    recurrence_frequency,
    recurrence_interval,
    recurrence_until,
    recurrence_count,
    wishlist_category_id
  ) values (
    p_family_id,
    caller_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    p_starts_at,
    p_ends_at,
    p_timezone,
    coalesce(p_all_day, false),
    p_visibility,
    p_recurrence_frequency,
    p_recurrence_interval,
    p_recurrence_until,
    p_recurrence_count,
    p_wishlist_category_id
  ) returning id into event_id;

  insert into public.calendar_event_participants (event_id, family_id, user_id, response)
  select event_id, p_family_id, participant.user_id,
    case when participant.user_id = caller_id then 'accepted' else 'pending' end
  from (
    select distinct user_id
    from unnest(array_append(coalesce(p_participant_ids, array[]::uuid[]), caller_id)) as input(user_id)
  ) as participant;

  perform private.sync_calendar_reminders(event_id, p_reminder_minutes);

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id,
    caller_id,
    'calendar.event_created',
    'calendar',
    'calendar_event',
    event_id,
    jsonb_build_object('visibility', p_visibility, 'recurrence', p_recurrence_frequency)
  );

  return event_id;
end;
$$;

create or replace function public.update_calendar_event(
  p_event_id uuid,
  p_version bigint,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_all_day boolean,
  p_visibility text,
  p_participant_ids uuid[],
  p_recurrence_frequency text default 'none',
  p_recurrence_interval integer default 1,
  p_recurrence_until timestamptz default null,
  p_recurrence_count integer default null,
  p_wishlist_category_id uuid default null,
  p_reminder_minutes integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  event_row public.calendar_events%rowtype;
begin
  select * into event_row
  from public.calendar_events as event
  where event.id = p_event_id
  for update;

  if event_row.id is null then
    raise exception 'Calendar event not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_calendar_event(p_event_id, caller_id) then
    raise exception 'Calendar event permission denied' using errcode = '42501';
  end if;
  if event_row.version <> p_version then
    raise exception 'Calendar event changed concurrently' using errcode = '40001';
  end if;

  perform private.validate_calendar_participants(event_row.family_id, p_participant_ids);

  update public.calendar_events
  set title = btrim(p_title),
      description = nullif(btrim(p_description), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = p_timezone,
      all_day = coalesce(p_all_day, false),
      visibility = p_visibility,
      recurrence_frequency = p_recurrence_frequency,
      recurrence_interval = p_recurrence_interval,
      recurrence_until = p_recurrence_until,
      recurrence_count = p_recurrence_count,
      wishlist_category_id = p_wishlist_category_id,
      version = version + 1,
      updated_at = now()
  where id = p_event_id;

  delete from public.calendar_event_participants
  where event_id = p_event_id;

  insert into public.calendar_event_participants (event_id, family_id, user_id, response)
  select p_event_id, event_row.family_id, participant.user_id,
    case when participant.user_id = event_row.created_by then 'accepted' else 'pending' end
  from (
    select distinct user_id
    from unnest(
      array_append(coalesce(p_participant_ids, array[]::uuid[]), event_row.created_by)
    ) as input(user_id)
  ) as participant;

  perform private.sync_calendar_reminders(p_event_id, p_reminder_minutes);

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    event_row.family_id,
    caller_id,
    'calendar.event_updated',
    'calendar',
    'calendar_event',
    p_event_id,
    jsonb_build_object('previous_version', p_version)
  );
end;
$$;

create or replace function public.delete_calendar_event(
  p_event_id uuid,
  p_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  event_row public.calendar_events%rowtype;
begin
  select * into event_row
  from public.calendar_events as event
  where event.id = p_event_id
  for update;

  if event_row.id is null then
    raise exception 'Calendar event not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_calendar_event(p_event_id, caller_id) then
    raise exception 'Calendar event permission denied' using errcode = '42501';
  end if;
  if event_row.version <> p_version then
    raise exception 'Calendar event changed concurrently' using errcode = '40001';
  end if;

  delete from public.calendar_events where id = p_event_id;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    event_row.family_id,
    caller_id,
    'calendar.event_deleted',
    'calendar',
    'calendar_event',
    p_event_id,
    jsonb_build_object('title', event_row.title)
  );
end;
$$;

revoke all on function public.create_calendar_event(
  uuid, text, text, timestamptz, timestamptz, text, boolean, text, uuid[], text, integer,
  timestamptz, integer, uuid, integer
) from public, anon;
revoke all on function public.update_calendar_event(
  uuid, bigint, text, text, timestamptz, timestamptz, text, boolean, text, uuid[], text,
  integer, timestamptz, integer, uuid, integer
) from public, anon;
revoke all on function public.delete_calendar_event(uuid, bigint) from public, anon;
grant execute on function public.create_calendar_event(
  uuid, text, text, timestamptz, timestamptz, text, boolean, text, uuid[], text, integer,
  timestamptz, integer, uuid, integer
) to authenticated;
grant execute on function public.update_calendar_event(
  uuid, bigint, text, text, timestamptz, timestamptz, text, boolean, text, uuid[], text,
  integer, timestamptz, integer, uuid, integer
) to authenticated;
grant execute on function public.delete_calendar_event(uuid, bigint) to authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'mention', 'comment', 'invitation', 'gift_status', 'family_join',
    'game_finished', 'game_won', 'game_invite', 'calendar_reminder'
  ));

create or replace function private.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default null,
  p_link text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  if p_type <> all(array[
    'mention', 'comment', 'invitation', 'gift_status', 'family_join',
    'game_finished', 'game_won', 'game_invite', 'calendar_reminder'
  ]) then
    raise exception 'Unsupported notification type' using errcode = '22023';
  end if;

  if p_link is not null
    and p_link <> '/dashboard'
    and p_link !~ '^/family/[0-9a-fA-F-]{36}/(members|wishlist|expenses|calendar|tasks|lists|notes|planner|meals|habits|documents)([/?#].*)?$'
  then
    raise exception 'Unsupported notification link' using errcode = '22023';
  end if;

  insert into public.notifications (
    user_id, type, title, message, link, reference_type, reference_id
  ) values (
    p_user_id,
    p_type,
    left(btrim(p_title), 160),
    p_message,
    p_link,
    p_reference_type,
    p_reference_id
  ) returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function private.create_notification(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.create_notification(uuid, text, text, text, text, text, uuid)
  to service_role;

create or replace function public.process_calendar_reminders(
  p_now timestamptz default now(),
  p_limit integer default 200
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reminder record;
  processed integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 1000 then
    raise exception 'Invalid reminder batch size' using errcode = '22023';
  end if;

  for reminder in
    select
      queued.id,
      queued.recipient_id,
      event.id as event_id,
      event.family_id,
      event.title
    from public.calendar_event_reminders as queued
    join public.calendar_events as event on event.id = queued.event_id
    where queued.delivered_at is null
      and queued.scheduled_for <= p_now
      and queued.occurrence_start >= p_now - interval '1 day'
    order by queued.scheduled_for, queued.id
    for update of queued skip locked
    limit p_limit
  loop
    if private.can_view_calendar_event(reminder.event_id, reminder.recipient_id) then
      perform private.create_notification(
        reminder.recipient_id,
        'calendar_reminder',
        'Recordatorio: ' || reminder.title,
        'Tienes un evento familiar próximo.',
        format('/family/%s/calendar?event=%s', reminder.family_id, reminder.event_id),
        'calendar_event',
        reminder.event_id
      );
    end if;

    update public.calendar_event_reminders
    set delivered_at = p_now
    where id = reminder.id;
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.process_calendar_reminders(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.process_calendar_reminders(timestamptz, integer)
  to service_role;

commit;
