begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
select ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'dual-calendar-' || n || '@example.test', '{"name":"Calendar boundary fixture"}', now(), now()
from generate_series(1, 5) as n;
insert into public.families(id, name, created_by) values
  ('32000000-1000-4000-8000-000000000001', 'Calendar A', '32000000-0000-4000-8000-000000000001'),
  ('32000000-1000-4000-8000-000000000002', 'Calendar B', '32000000-0000-4000-8000-000000000005');
insert into public.family_members(family_id, user_id, role) values
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'owner'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'admin'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'member'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'member'),
  ('32000000-1000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000005', 'owner'),
  ('32000000-1000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000003', 'member');
insert into public.external_connections(id, family_id, user_id, provider, access_token, refresh_token) values
  ('32000000-2000-4000-8000-000000000001', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'microsoft_calendar', 'synthetic-outlook-access', 'synthetic-outlook-refresh'),
  ('32000000-2000-4000-8000-000000000002', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'google_calendar', 'synthetic-google-access', 'synthetic-google-refresh'),
  ('32000000-2000-4000-8000-000000000003', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'github', 'synthetic-github-access', null);

select ok(not has_column_privilege('authenticated','public.external_connections','access_token','select'), 'browser cannot read Outlook or Google access tokens');
select ok(not has_column_privilege('authenticated','public.external_connections','refresh_token','select'), 'browser cannot read provider refresh tokens');
select ok(not has_column_privilege('authenticated','public.external_connections','sync_lease_id','select'), 'lease credentials are server only');
select ok(not has_table_privilege('authenticated','public.external_connections','insert'), 'browser cannot forge a provider connection');
select ok(not has_function_privilege('authenticated','public.acquire_google_calendar_sync(uuid,uuid)','execute'), 'shared lease RPC remains service only');
select ok(not has_function_privilege('authenticated','public.apply_google_calendar_event(uuid,uuid,text,text,jsonb,boolean,bigint)','execute'), 'shared import RPC remains service only');
select ok(not has_function_privilege('authenticated','public.record_google_calendar_export(uuid,uuid,text,text,uuid,bigint)','execute'), 'shared export RPC remains service only');

set local role service_role;
select set_config('tests.outlook_lease', public.acquire_google_calendar_sync('32000000-2000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003')::text, true);
select throws_ok($$select public.acquire_google_calendar_sync('32000000-2000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003')$$, 'PT409', null, 'concurrent Outlook synchronization is rejected without serialization retry');
select throws_ok($$select public.acquire_google_calendar_sync('32000000-2000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001')$$, 'PT409', null, 'family owner cannot acquire another user connection');
select throws_ok($$select public.acquire_google_calendar_sync('32000000-2000-4000-8000-000000000003','32000000-0000-4000-8000-000000000003')$$, 'PT409', null, 'GitHub connections are not calendar leases');
select set_config('tests.google_lease', public.acquire_google_calendar_sync('32000000-2000-4000-8000-000000000002','32000000-0000-4000-8000-000000000003')::text, true);
select is(public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'same-remote-id','outlook-etag-1',
  '{"title":"Private Outlook fixture","description":"Private details","startsAt":"2026-11-01T10:00Z","endsAt":"2026-11-01T11:00Z","timezone":"UTC","allDay":false,"visibility":"family"}'), 'applied', 'Outlook imports through the shared RPC');
select set_config('tests.outlook_event', (select local_event_id::text from public.calendar_external_event_links where connection_id='32000000-2000-4000-8000-000000000001'), true);
select is(public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'same-remote-id','outlook-etag-1',
  '{"title":"Private Outlook fixture","startsAt":"2026-11-01T10:00Z","endsAt":"2026-11-01T11:00Z","timezone":"UTC","allDay":false}'), 'applied', 'Outlook retries reuse the same local event');
select is((select version from public.calendar_events where id=current_setting('tests.outlook_event')::uuid), 1::bigint, 'unchanged remote etag does not increment local version');
select is((select visibility from public.calendar_events where id=current_setting('tests.outlook_event')::uuid), 'selected_members', 'provider payload cannot make an import public to the family');
select is(public.apply_google_calendar_event('32000000-2000-4000-8000-000000000002',current_setting('tests.google_lease')::uuid,'same-remote-id','google-etag-1',
  '{"title":"Private Google fixture","startsAt":"2026-11-02T10:00Z","endsAt":"2026-11-02T11:00Z","timezone":"UTC","allDay":false}'), 'applied', 'legacy Google interface remains compatible');
select set_config('tests.google_event', (select local_event_id::text from public.calendar_external_event_links where connection_id='32000000-2000-4000-8000-000000000002'), true);
select is((select count(*) from public.calendar_events), 2::bigint, 'equal remote ids from different providers remain distinct');

reset role;
insert into public.calendar_events(id,family_id,created_by,title,starts_at,ends_at,timezone,visibility) values
  ('32000000-4000-4000-8000-000000000001','32000000-1000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003','Private internal fixture','2026-11-03T10:00Z','2026-11-03T11:00Z','UTC','selected_members'),
  ('32000000-4000-4000-8000-000000000002','32000000-1000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003','Shared internal fixture','2026-11-04T10:00Z','2026-11-04T11:00Z','UTC','family'),
  ('32000000-4000-4000-8000-000000000003','32000000-1000-4000-8000-000000000002','32000000-0000-4000-8000-000000000003','Own other family fixture','2026-11-05T10:00Z','2026-11-05T11:00Z','UTC','family'),
  ('32000000-4000-4000-8000-000000000004','32000000-1000-4000-8000-000000000001','32000000-0000-4000-8000-000000000004','Another author fixture','2026-11-06T10:00Z','2026-11-06T11:00Z','UTC','family');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.calendar_events where id in(current_setting('tests.outlook_event')::uuid,current_setting('tests.google_event')::uuid,'32000000-4000-4000-8000-000000000001')), 0::bigint, 'family owner sees no private appointments or internal private event');
select is((select count(*) from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array[current_setting('tests.outlook_event')::uuid,current_setting('tests.google_event')::uuid,'32000000-4000-4000-8000-000000000001'::uuid])), 0::bigint, 'origin lookup reveals no hidden UUIDs to family owner');
select is((select count(*) from public.external_connections), 0::bigint, 'family owner cannot inspect provider metadata');
select throws_ok($$select public.delete_calendar_event('32000000-4000-4000-8000-000000000001',1)$$, 'P0002', 'Calendar event not found', 'owner cannot delete or distinguish an internal private UUID');
select throws_ok($$select public.delete_calendar_event('32000000-4000-4000-8000-000000000099',1)$$, 'P0002', 'Calendar event not found', 'missing UUID produces the same result as hidden UUID');

reset role;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(private.can_manage_calendar_event('32000000-4000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002'), false, 'admin outside audience has no mutation authority');
select throws_ok($$select public.update_calendar_event('32000000-4000-4000-8000-000000000001',1,'Forbidden change',null,'2026-11-03T10:00Z','2026-11-03T11:00Z','UTC',false,'family',array[]::uuid[])$$, 'P0002', 'Calendar event not found', 'admin cannot expose a guessed internal private event by updating it');
select throws_ok($$select public.delete_calendar_event(current_setting('tests.outlook_event')::uuid,1)$$, 'P0002', 'Calendar event not found', 'admin cannot delete an imported private event');
select is(private.can_manage_calendar_event('32000000-4000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002'), true, 'admin retains management of visible family events');

reset role;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array[current_setting('tests.outlook_event')::uuid,current_setting('tests.google_event')::uuid])),0::bigint,'ordinary family member cannot infer private provider events');

reset role;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select origin from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array[current_setting('tests.outlook_event')::uuid])), 'outlook', 'visible Microsoft import reports Outlook origin');
select is((select origin from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array[current_setting('tests.google_event')::uuid])), 'google', 'visible Google import keeps Google origin');
select is((select origin from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array['32000000-4000-4000-8000-000000000002'::uuid])), 'internal', 'unconnected own event remains internal');
select throws_ok($$select access_token from public.external_connections where provider='microsoft_calendar'$$,'42501',null,'even connection owner cannot read Outlook tokens');

reset role;
set local role service_role;
select throws_ok($$select public.record_google_calendar_export('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'wrong-family','etag','32000000-4000-4000-8000-000000000003',1)$$,'42501',null,'same user cannot export a different family event through this connection');
select throws_ok($$select public.record_google_calendar_export('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'wrong-author','etag','32000000-4000-4000-8000-000000000004',1)$$,'42501',null,'connection cannot export another author event');
select lives_ok($$select public.record_google_calendar_export('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'own-export','etag','32000000-4000-4000-8000-000000000002',1)$$,'shared export interface supports Outlook for an own family event');

reset role;
update public.external_connections set sync_lease_id='32000000-3000-4000-8000-000000000003', sync_lease_until=now()+interval '1 hour'
where id='32000000-2000-4000-8000-000000000003';
set local role service_role;
select throws_ok($$select public.record_google_calendar_export('32000000-2000-4000-8000-000000000003','32000000-3000-4000-8000-000000000003','forged-provider','etag','32000000-4000-4000-8000-000000000002',1)$$,'42501',null,'a live GitHub lease still cannot register calendar exports');
reset role;
set local role authenticated;
select is((select origin from public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array['32000000-4000-4000-8000-000000000002'::uuid])), 'internal', 'exporting an internal event does not relabel its origin as Outlook');
reset role;
update public.calendar_events set title='Local edit retained', version=version+1 where id=current_setting('tests.outlook_event')::uuid;
set local role service_role;
select is(public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'same-remote-id','outlook-etag-2',
  '{"title":"Remote competing edit","startsAt":"2026-11-01T10:00Z","endsAt":"2026-11-01T11:00Z","timezone":"UTC","allDay":false}'),'conflict','Outlook pull preserves a concurrent local edit');
select is((select title from public.calendar_events where id=current_setting('tests.outlook_event')::uuid),'Local edit retained','conflict does not overwrite local private data');
select is(public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'same-remote-id','outlook-etag-2',
  '{"title":"Remote chosen","startsAt":"2026-11-01T10:00Z","endsAt":"2026-11-01T11:00Z","timezone":"UTC","allDay":false}',true,999),'conflict','Outlook forced resolution also checks current version');
select throws_ok($$select public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.google_lease')::uuid,'forged','etag',null)$$,'42501',null,'Google lease cannot authorize a Microsoft connection');

reset role;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.get_calendar_event_origins('32000000-1000-4000-8000-000000000001',array[current_setting('tests.outlook_event')::uuid])$$,'42501',null,'other family cannot query provider origin');
select is((select count(*) from public.external_connections),0::bigint,'other family cannot read connection metadata');

reset role;
delete from public.family_members where family_id='32000000-1000-4000-8000-000000000001' and user_id='32000000-0000-4000-8000-000000000003';
set local role service_role;
select throws_ok($$select public.apply_google_calendar_event('32000000-2000-4000-8000-000000000001',current_setting('tests.outlook_lease')::uuid,'same-remote-id','etag-3',null)$$,'42501',null,'removing family membership stops an in-flight Outlook import');
delete from public.external_connections where id='32000000-2000-4000-8000-000000000001';
select is((select count(*) from public.calendar_events where id=current_setting('tests.outlook_event')::uuid),0::bigint,'Outlook disconnect removes imported local copies');
select is((select count(*) from public.calendar_events where id=current_setting('tests.google_event')::uuid),1::bigint,'Outlook disconnect preserves the independent Google import');
select is((select count(*) from public.calendar_events where id='32000000-4000-4000-8000-000000000002'),1::bigint,'Outlook disconnect preserves an exported original internal event');

reset role;
select * from finish();
rollback;
