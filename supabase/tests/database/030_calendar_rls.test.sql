begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'calendar-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'calendar-admin@example.test', '{"name":"Admin"}', now(), now()),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'calendar-member@example.test', '{"name":"Member"}', now(), now()),
  ('30000000-0000-4000-8000-000000000004', 'authenticated', 'calendar-selected@example.test', '{"name":"Selected"}', now(), now()),
  ('30000000-0000-4000-8000-000000000005', 'authenticated', 'calendar-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('30000000-1000-4000-8000-000000000001', 'Calendar family', '30000000-0000-4000-8000-000000000001'),
  ('30000000-1000-4000-8000-000000000002', 'Other family', '30000000-0000-4000-8000-000000000005');

insert into public.family_members (family_id, user_id, role)
values
  ('30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'owner'),
  ('30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'admin'),
  ('30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'member'),
  ('30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'member'),
  ('30000000-1000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'owner');

insert into public.gift_event_categories (
  id, family_id, name, icon, event_date, is_system, color, created_by
) values (
  '30000000-2000-4000-8000-000000000001',
  '30000000-1000-4000-8000-000000000001',
  'Cumpleaños',
  '🎂',
  '2026-08-20',
  false,
  '#7C3AED',
  '30000000-0000-4000-8000-000000000001'
);

insert into public.calendar_events (
  id, family_id, created_by, title, starts_at, ends_at, timezone, all_day, visibility,
  recurrence_frequency, recurrence_interval, recurrence_until, recurrence_count
) values
  (
    '30000000-3000-4000-8000-000000000001',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Evento familiar',
    '2026-08-10 16:00+00',
    '2026-08-10 17:00+00',
    'Europe/Madrid',
    false,
    'family',
    'none',
    1,
    null,
    null
  ),
  (
    '30000000-3000-4000-8000-000000000002',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Evento seleccionado',
    '2026-08-11 16:00+00',
    '2026-08-11 17:00+00',
    'Europe/Madrid',
    false,
    'selected_members',
    'none',
    1,
    null,
    null
  ),
  (
    '30000000-3000-4000-8000-000000000003',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Cruza medianoche',
    '2026-08-12 20:30+00',
    '2026-08-12 22:30+00',
    'Europe/Madrid',
    false,
    'family',
    'none',
    1,
    null,
    null
  ),
  (
    '30000000-3000-4000-8000-000000000004',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Semanal con DST',
    '2026-03-22 08:00+00',
    '2026-03-22 09:00+00',
    'Europe/Madrid',
    false,
    'family',
    'weekly',
    1,
    '2026-04-12 07:00+00',
    4
  ),
  (
    '30000000-3000-4000-8000-000000000005',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Día del cambio horario',
    '2026-03-28 23:00+00',
    '2026-03-29 22:00+00',
    'Europe/Madrid',
    true,
    'family',
    'none',
    1,
    null,
    null
  ),
  (
    '30000000-3000-4000-8000-000000000006',
    '30000000-1000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Fin de mes',
    '2026-01-31 08:00+00',
    '2026-01-31 09:00+00',
    'Europe/Madrid',
    false,
    'family',
    'monthly',
    1,
    '2026-04-30 07:00+00',
    4
  );

insert into public.calendar_event_participants (event_id, family_id, user_id, response)
values
  ('30000000-3000-4000-8000-000000000001', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted'),
  ('30000000-3000-4000-8000-000000000002', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted'),
  ('30000000-3000-4000-8000-000000000002', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'pending'),
  ('30000000-3000-4000-8000-000000000003', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted'),
  ('30000000-3000-4000-8000-000000000004', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted'),
  ('30000000-3000-4000-8000-000000000005', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted'),
  ('30000000-3000-4000-8000-000000000006', '30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'accepted');

select has_table('public', 'calendar_events', 'calendar events table exists');
select has_table('public', 'calendar_event_participants', 'calendar participants table exists');
select has_table('public', 'calendar_event_reminders', 'calendar reminders table exists');
select has_function('public', 'create_calendar_event', 'calendar event creation RPC exists');
select has_function('public', 'update_calendar_event', 'calendar event update RPC exists');
select has_function('public', 'delete_calendar_event', array['uuid', 'bigint'], 'calendar event delete RPC exists');
select has_function('public', 'get_calendar_occurrences', 'calendar occurrence RPC exists');
select has_function('public', 'process_calendar_reminders', array['timestamp with time zone', 'integer'], 'calendar reminder processor exists');
select ok(not has_table_privilege('authenticated', 'public.calendar_events', 'insert'), 'events cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.calendar_event_participants', 'insert'), 'participants cannot be inserted directly');
select ok(private.is_iana_timezone('Europe/Madrid'), 'IANA timezone is accepted');
select ok(not private.is_iana_timezone('Madrid/House'), 'invented timezone is rejected');

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.calendar_events), 5, 'ordinary member sees family events but not unselected event');
select is((select count(*)::integer from public.calendar_event_participants), 5, 'participants of hidden events stay hidden');
select throws_ok(
  $$insert into public.calendar_events (family_id, created_by, title, starts_at, ends_at, timezone) values ('30000000-1000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Directo', now(), now() + interval '1 hour', 'Europe/Madrid')$$,
  '42501',
  'permission denied for table calendar_events',
  'direct event insertion is blocked'
);
select lives_ok(
  $$select public.create_calendar_event(
    p_family_id => '30000000-1000-4000-8000-000000000001',
    p_title => 'Creado por miembro',
    p_description => null,
    p_starts_at => '2026-08-15 09:00+00',
    p_ends_at => '2026-08-15 10:00+00',
    p_timezone => 'Europe/Madrid',
    p_all_day => false,
    p_visibility => 'selected_members',
    p_participant_ids => array['30000000-0000-4000-8000-000000000004']::uuid[],
    p_recurrence_frequency => 'daily',
    p_recurrence_interval => 1,
    p_recurrence_until => '2026-08-17 09:00+00',
    p_recurrence_count => 3,
    p_wishlist_category_id => '30000000-2000-4000-8000-000000000001',
    p_reminder_minutes => 30
  )$$,
  'family member creates a selected recurring event atomically'
);
select throws_ok(
  $$select public.create_calendar_event(
    p_family_id => '30000000-1000-4000-8000-000000000001',
    p_title => 'Participante externo',
    p_description => null,
    p_starts_at => '2026-08-15 09:00+00',
    p_ends_at => '2026-08-15 10:00+00',
    p_timezone => 'Europe/Madrid',
    p_all_day => false,
    p_visibility => 'family',
    p_participant_ids => array['30000000-0000-4000-8000-000000000005']::uuid[]
  )$$,
  '22023',
  'Every participant must belong to the family',
  'outside participants are rejected'
);
select throws_ok(
  $$select public.update_calendar_event(
    p_event_id => '30000000-3000-4000-8000-000000000001',
    p_version => 1,
    p_title => 'Sin permiso',
    p_description => null,
    p_starts_at => '2026-08-10 16:00+00',
    p_ends_at => '2026-08-10 17:00+00',
    p_timezone => 'Europe/Madrid',
    p_all_day => false,
    p_visibility => 'family',
    p_participant_ids => array[]::uuid[]
  )$$,
  '42501',
  'Calendar event permission denied',
  'ordinary member cannot update another author event'
);
select is(
  (select count(*)::integer from public.get_calendar_occurrences(
    '30000000-1000-4000-8000-000000000001',
    '2026-08-15 00:00+00',
    '2026-08-18 00:00+00'
  ) where title = 'Creado por miembro'),
  3,
  'daily recurrence respects its occurrence count'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.calendar_events where id = '30000000-3000-4000-8000-000000000002'), 1, 'selected participant sees selected event');
select is(
  (select count(*)::integer from public.get_calendar_occurrences(
    '30000000-1000-4000-8000-000000000001',
    '2026-08-11 00:00+00',
    '2026-08-12 00:00+00',
    '30000000-0000-4000-8000-000000000004'
  )),
  1,
  'participant filter returns only matching visible occurrences'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.calendar_events), 0, 'member of another family sees no events');
select is(
  (select count(*)::integer from public.get_calendar_occurrences(
    '30000000-1000-4000-8000-000000000001',
    '2026-08-01 00:00+00',
    '2026-09-01 00:00+00'
  )),
  0,
  'occurrence RPC preserves RLS isolation'
);
select throws_ok(
  $$select public.process_calendar_reminders(now(), 20)$$,
  '42501',
  'permission denied for function process_calendar_reminders',
  'authenticated users cannot process reminders'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.update_calendar_event(
    p_event_id => '30000000-3000-4000-8000-000000000001',
    p_version => 1,
    p_title => 'Evento familiar actualizado',
    p_description => 'Editado por administración',
    p_starts_at => '2026-08-10 16:00+00',
    p_ends_at => '2026-08-10 17:00+00',
    p_timezone => 'Europe/Madrid',
    p_all_day => false,
    p_visibility => 'family',
    p_participant_ids => array['30000000-0000-4000-8000-000000000003']::uuid[],
    p_reminder_minutes => 15
  )$$,
  'family admin can update an event'
);
select is((select version::integer from public.calendar_events where id = '30000000-3000-4000-8000-000000000001'), 2, 'calendar event version increments');
select throws_ok(
  $$select public.update_calendar_event(
    p_event_id => '30000000-3000-4000-8000-000000000001',
    p_version => 1,
    p_title => 'Conflicto',
    p_description => null,
    p_starts_at => '2026-08-10 16:00+00',
    p_ends_at => '2026-08-10 17:00+00',
    p_timezone => 'Europe/Madrid',
    p_all_day => false,
    p_visibility => 'family',
    p_participant_ids => array[]::uuid[]
  )$$,
  '40001',
  'Calendar event changed concurrently',
  'stale calendar update is rejected'
);

select is(
  (
    select to_char(occurrence_start at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI')
    from public.get_calendar_occurrences(
      '30000000-1000-4000-8000-000000000001',
      '2026-03-28 00:00+00',
      '2026-04-01 00:00+00'
    )
    where event_id = '30000000-3000-4000-8000-000000000004'
  ),
  '2026-03-29 09:00',
  'weekly recurrence preserves local wall time across DST'
);
select is(
  (
    select extract(epoch from (occurrence_end - occurrence_start))::integer
    from public.get_calendar_occurrences(
      '30000000-1000-4000-8000-000000000001',
      '2026-03-28 00:00+00',
      '2026-03-31 00:00+00'
    )
    where event_id = '30000000-3000-4000-8000-000000000005'
  ),
  82800,
  'all-day event spanning DST lasts 23 real hours'
);
select is(
  (
    select to_char(occurrence_end at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI')
    from public.get_calendar_occurrences(
      '30000000-1000-4000-8000-000000000001',
      '2026-08-12 00:00+00',
      '2026-08-14 00:00+00'
    )
    where event_id = '30000000-3000-4000-8000-000000000003'
  ),
  '2026-08-13 00:30',
  'event crossing midnight preserves its local end'
);
select is(
  (
    select to_char(occurrence_start at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI')
    from public.get_calendar_occurrences(
      '30000000-1000-4000-8000-000000000001',
      '2026-02-01 00:00+00',
      '2026-03-01 00:00+00'
    )
    where event_id = '30000000-3000-4000-8000-000000000006'
  ),
  '2026-02-28 09:00',
  'monthly recurrence keeps month-end semantics and local wall time'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into public.calendar_event_reminders (
  event_id, recipient_id, occurrence_start, minutes_before, scheduled_for
) values (
  '30000000-3000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  now() + interval '15 minutes',
  30,
  now() - interval '1 minute'
);
select is(public.process_calendar_reminders(now(), 20), 1, 'service role processes due reminder once');
select is(public.process_calendar_reminders(now(), 20), 0, 'reminder processing is idempotent');
select is(
  (
    select link
    from public.notifications
    where user_id = '30000000-0000-4000-8000-000000000003'
      and type = 'calendar_reminder'
    order by created_at desc
    limit 1
  ),
  '/family/30000000-1000-4000-8000-000000000001/calendar?event=30000000-3000-4000-8000-000000000001',
  'calendar reminder contains only a safe internal deep link'
);

select * from finish();
rollback;
