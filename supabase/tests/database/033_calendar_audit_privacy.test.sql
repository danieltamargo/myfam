begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
select ('33000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'calendar-audit-' || n || '@example.test', '{"name":"Audit fixture"}', now(), now()
from generate_series(1, 3) as n;
insert into public.families(id,name,created_by) values
  ('33000000-1000-4000-8000-000000000001','Audit fixture','33000000-0000-4000-8000-000000000001');
insert into public.family_members(family_id,user_id,role) values
  ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','owner'),
  ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002','admin'),
  ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000003','member');

select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('tests.private_event', public.create_calendar_event('33000000-1000-4000-8000-000000000001','Private appointment',null,'2026-11-01T10:00Z','2026-11-01T11:00Z','UTC',false,'selected_members',array[]::uuid[])::text,true);
select set_config('tests.family_event', public.create_calendar_event('33000000-1000-4000-8000-000000000001','Family appointment',null,'2026-11-02T10:00Z','2026-11-02T11:00Z','UTC',false,'family',array[]::uuid[])::text,true);
select lives_ok($$select public.update_calendar_event(current_setting('tests.private_event')::uuid,1,'Private appointment edited',null,'2026-11-01T10:00Z','2026-11-01T11:00Z','UTC',false,'selected_members',array[]::uuid[])$$,'creator can update a private event');
select is((select count(*) from public.audit_logs),0::bigint,'ordinary member creator receives no additional audit access');
reset role;

select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid),0::bigint,'owner outside audience cannot infer live private UUID or metadata');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.family_event')::uuid),1::bigint,'owner retains family event creation audit');
reset role;
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid),0::bigint,'admin outside audience cannot infer live private UUID or metadata');
reset role;

insert into public.calendar_event_participants(event_id,family_id,user_id,response) values
  (current_setting('tests.private_event')::uuid,'33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002','pending');
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid),2::bigint,'admin in current audience can read live event audit');
reset role;
delete from public.calendar_event_participants where event_id=current_setting('tests.private_event')::uuid;
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.delete_calendar_event(current_setting('tests.private_event')::uuid,2)$$,'creator can delete private event');
select lives_ok($$select public.delete_calendar_event(current_setting('tests.family_event')::uuid,1)$$,'creator can delete family event');
reset role;

insert into public.audit_logs(family_id,user_id,action,module_name,resource_type,resource_id,metadata) values
 ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000003','calendar.event_deleted','calendar','calendar_event','33000000-2000-4000-8000-000000000001','{"title":"Historical private title"}'),
 ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','calendar.event_deleted','calendar','calendar_event','33000000-2000-4000-8000-000000000002','{"title":"Own historical title"}'),
 ('33000000-1000-4000-8000-000000000001','33000000-0000-4000-8000-000000000003','notes.note_created','notes','note','33000000-2000-4000-8000-000000000003','{}');
select is((select metadata->>'visibility' from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid and action='calendar.event_deleted'),'selected_members','private deletion snapshots actual visibility');
select is((select metadata->>'visibility' from public.audit_logs where resource_id=current_setting('tests.family_event')::uuid and action='calendar.event_deleted'),'family','family deletion snapshots actual visibility');

select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid),0::bigint,'owner cannot infer deleted private UUID including creation and update records');
select is((select count(*) from public.audit_logs where resource_id='33000000-2000-4000-8000-000000000001'),0::bigint,'historical deletion without visibility is hidden to nonactor');
select is((select count(*) from public.audit_logs where resource_id='33000000-2000-4000-8000-000000000002'),1::bigint,'owner actor retains own historical private audit');
select is((select metadata->>'title' from public.audit_logs where resource_id=current_setting('tests.family_event')::uuid and action='calendar.event_deleted'),'Family appointment','family deletion title remains available');
select is((select count(*) from public.audit_logs where module_name='notes'),1::bigint,'other modules retain existing audit access');
reset role;
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.private_event')::uuid),0::bigint,'former audience admin cannot infer deleted private event');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.family_event')::uuid and action='calendar.event_deleted'),1::bigint,'admin retains family deletion audit');
reset role;
select * from finish();
rollback;
