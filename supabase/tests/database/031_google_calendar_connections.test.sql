begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
select ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'calendar-connection-' || n || '@example.test', '{"name":"Calendar tester"}', now(), now()
from generate_series(1, 4) as n;
insert into public.families(id, name, created_by) values
  ('31000000-1000-4000-8000-000000000001', 'Calendar family', '31000000-0000-4000-8000-000000000001'),
  ('31000000-1000-4000-8000-000000000002', 'Other family', '31000000-0000-4000-8000-000000000004');
insert into public.family_members(family_id, user_id, role) values
  ('31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'owner'),
  ('31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', 'admin'),
  ('31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'member'),
  ('31000000-1000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000004', 'owner');
insert into public.external_connections(id, family_id, user_id, provider, access_token, refresh_token, sync_lease_id, sync_lease_until)
values ('31000000-2000-4000-8000-000000000001', '31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003',
  'google_calendar', 'synthetic-encrypted-access', 'synthetic-encrypted-refresh', '31000000-3000-4000-8000-000000000001', now() + interval '1 hour');
insert into public.calendar_oauth_states(nonce_hash, user_id, family_id, expires_at)
values (repeat('a', 64), '31000000-0000-4000-8000-000000000003', '31000000-1000-4000-8000-000000000001', now() + interval '10 minutes');

select ok(not has_column_privilege('authenticated', 'public.external_connections', 'access_token', 'select'), 'browser cannot read even its own access token');
select ok(not has_column_privilege('authenticated', 'public.external_connections', 'refresh_token', 'select'), 'browser cannot read its own refresh token');
select ok(not has_table_privilege('authenticated', 'public.external_connections', 'insert'), 'browser cannot create forged connections');
select ok(not has_table_privilege('authenticated', 'public.calendar_oauth_states', 'select'), 'OAuth nonces are server only');
select ok(not has_function_privilege('authenticated', 'public.apply_google_calendar_event(uuid,uuid,text,text,jsonb,boolean,bigint)', 'execute'), 'browser cannot invoke privileged synchronization');

set local role service_role;
with consumed as (delete from public.calendar_oauth_states where nonce_hash = repeat('a', 64)
  and user_id = '31000000-0000-4000-8000-000000000003' and family_id = '31000000-1000-4000-8000-000000000001'
  and expires_at > now() returning nonce_hash) select is((select count(*) from consumed), 1::bigint, 'OAuth nonce is consumed atomically for its bound user and family');
with consumed as (delete from public.calendar_oauth_states where nonce_hash = repeat('a', 64)
  and user_id = '31000000-0000-4000-8000-000000000003' and family_id = '31000000-1000-4000-8000-000000000001'
  and expires_at > now() returning nonce_hash) select is((select count(*) from consumed), 0::bigint, 'OAuth nonce replay has no consumable state');
select is(public.apply_google_calendar_event('31000000-2000-4000-8000-000000000001', '31000000-3000-4000-8000-000000000001', 'remote-event', 'etag-1',
  '{"title":"Private external appointment","description":"Not family availability","startsAt":"2026-11-01T10:00:00Z","endsAt":"2026-11-01T11:00:00Z","timezone":"UTC","allDay":false}'), 'applied', 'server imports private event');
select is(public.apply_google_calendar_event('31000000-2000-4000-8000-000000000001', '31000000-3000-4000-8000-000000000001', 'remote-event', 'etag-1',
  '{"title":"Private external appointment","startsAt":"2026-11-01T10:00:00Z","endsAt":"2026-11-01T11:00:00Z","timezone":"UTC","allDay":false}'), 'applied', 'repeated remote event is applied to the same local row');
select is((select count(*) from public.calendar_events), 1::bigint, 'remote identity never creates duplicate local events');
select set_config('tests.google_imported_event_id', (select id::text from public.calendar_events limit 1), true);

reset role;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.calendar_events), 0::bigint, 'family owner cannot read private Google appointment');
select is((select count(*) from public.calendar_external_event_links), 0::bigint, 'family owner cannot infer a private linked busy slot');
select is((select count(*) from public.external_connections), 0::bigint, 'family owner cannot read another member connection metadata');
select is((select count(*) from public.get_calendar_event_origins('31000000-1000-4000-8000-000000000001', array[current_setting('tests.google_imported_event_id')::uuid])), 0::bigint, 'origin lookup does not reveal a hidden appointment even with a known UUID');
reset role;
select is(private.can_manage_calendar_event((select id from public.calendar_events limit 1), '31000000-0000-4000-8000-000000000002'), false, 'family admin cannot mutate a guessed private imported event');

select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.calendar_events), 1::bigint, 'connected user sees its private appointment');
select is((select count(*) from public.external_connections), 1::bigint, 'connected user sees safe connection metadata');
select is((select origin from public.get_calendar_event_origins('31000000-1000-4000-8000-000000000001', array[(select id from public.calendar_events limit 1)])), 'google', 'authorized viewer sees the correct external origin');
select throws_ok($$select access_token from public.external_connections$$, '42501', null, 'owner cannot request token column explicitly');

reset role;
update public.calendar_events set title = 'Local edit preserved', version = version + 1;
set local role service_role;
select is(public.apply_google_calendar_event('31000000-2000-4000-8000-000000000001', '31000000-3000-4000-8000-000000000001', 'remote-event', 'etag-2',
  '{"title":"Competing remote edit","startsAt":"2026-11-01T10:00:00Z","endsAt":"2026-11-01T11:00:00Z","timezone":"UTC","allDay":false}'), 'conflict', 'remote pull does not overwrite a local version change');
select is((select title from public.calendar_events), 'Local edit preserved', 'conflicting local title survives');
select is(public.apply_google_calendar_event('31000000-2000-4000-8000-000000000001', '31000000-3000-4000-8000-000000000001', 'remote-event', 'etag-2',
  '{"title":"Remote chosen","startsAt":"2026-11-01T10:00:00Z","endsAt":"2026-11-01T11:00:00Z","timezone":"UTC","allDay":false}', true, 999), 'conflict', 'explicit resolution also rejects stale local versions');
select throws_ok($$select public.apply_google_calendar_event('31000000-2000-4000-8000-000000000001', '31000000-3000-4000-8000-000000000099', 'remote-event', 'etag-2', null)$$, '42501', null, 'expired or replaced worker cannot change events');

reset role;
select set_config('request.jwt.claims', '{"sub":"31000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.calendar_events), 0::bigint, 'other family cannot read imported appointment');
select is((select count(*) from public.external_connections), 0::bigint, 'other family cannot inspect the connection');

reset role;
insert into public.calendar_events(id, family_id, created_by, title, starts_at, ends_at, timezone)
values ('31000000-4000-4000-8000-000000000001', '31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', 'Original internal event', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', 'UTC');
insert into public.calendar_external_event_links(connection_id, remote_event_id, local_event_id, direction, remote_etag, local_version)
values ('31000000-2000-4000-8000-000000000001', 'exported-event', '31000000-4000-4000-8000-000000000001', 'exported', 'etag-exported', 1);
delete from public.external_connections where id = '31000000-2000-4000-8000-000000000001';
select is((select count(*) from public.calendar_events), 1::bigint, 'disconnect deletes imports but preserves original internal events');
select is((select title from public.calendar_events), 'Original internal event', 'original internal event survives disconnection');
select * from finish();
rollback;
