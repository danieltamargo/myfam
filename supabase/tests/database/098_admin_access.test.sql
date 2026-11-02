begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_function_privilege('anon','public.admin_auth_events(integer,integer)','execute'), 'anonymous cannot read Auth audit');
select ok(not has_function_privilege('authenticated','public.admin_auth_events(integer,integer)','execute'), 'authenticated users cannot read global Auth audit');
select ok(not has_function_privilege('authenticated','public.admin_record_user_operation(uuid,uuid,text,text,uuid)','execute'), 'authenticated users cannot forge admin operations');
select ok(has_function_privilege('service_role','public.admin_auth_events(integer,integer)','execute'), 'service can read sanitized Auth audit');
select is(pg_get_function_result('public.admin_auth_events(integer,integer)'::regprocedure),
  'TABLE(id uuid, created_at timestamp with time zone, actor_id text, action text)', 'Auth audit exposes only sanitized columns');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.admin_auth_events(integer,integer)'::regprocedure), 'Auth audit uses empty search path');

insert into auth.users(id,role,email,raw_user_meta_data,created_at,updated_at) values
 ('98000000-0000-4000-8000-000000000001','authenticated','admin-fixture@example.test','{}',now(),now());
insert into public.families(id,name,created_by) values
 ('98000000-1000-4000-8000-000000000001','Admin fixture','98000000-0000-4000-8000-000000000001');
insert into public.family_members(family_id,user_id,role) values
 ('98000000-1000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','owner');

select set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.families where id='98000000-1000-4000-8000-000000000001'),1::bigint,'active AAL2 account can access its family');
reset role;
update auth.users set banned_until=now()+interval '1 year' where id='98000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),false,'an unexpired AAL2 JWT is rejected immediately when its account is banned');
select is((select count(*) from public.families where id='98000000-1000-4000-8000-000000000001'),0::bigint,'ban blocks direct table reads');
select is((select count(*) from public.public_profiles where id='98000000-0000-4000-8000-000000000001'),0::bigint,'ban blocks security-invoker views');
select throws_ok($$select public.get_my_profile()$$,'42501',null,'ban blocks protected definer RPC reads');
select throws_ok($$select public.create_family('Forbidden')$$,'42501',null,'ban blocks definer mutations');
select results_eq($$with changed as (update public.families set name='Forbidden' where id='98000000-1000-4000-8000-000000000001' returning id) select count(*)::integer from changed$$,array[0],'ban blocks direct mutations');
select throws_ok($$select public.admin_auth_events(26,0)$$,'42501',null,'a direct RPC call cannot read global Auth audit');
reset role;
update auth.users set banned_until=now()-interval '1 second' where id='98000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),true,'expired ban restores existing account access');
reset role;
insert into private.mfa_recovery_state(user_id,started_at,required,pending)
values ('98000000-0000-4000-8000-000000000001',now(),true,true);
set local role authenticated;
select is(private.session_meets_mfa(),false,'an expired ban never bypasses a pending recovery');
select throws_ok($$select public.get_my_profile()$$,'42501',null,'admin caller guard also rejects pending recovery');
reset role;
update private.mfa_recovery_state set pending=false where user_id='98000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),false,'recovery still rejects old JWTs without a fresh allowed Auth session');
reset role;
delete from private.mfa_recovery_state where user_id='98000000-0000-4000-8000-000000000001';

insert into auth.audit_log_entries(id,payload,created_at) values
 ('98000000-2000-4000-8000-000000000001','{"actor_id":"98000000-0000-4000-8000-000000000001","action":"login","token":"synthetic-secret","ip":"192.0.2.1","actor_username":"private@example.test"}',now()+interval '1 minute'),
 ('98000000-2000-4000-8000-000000000002','{"actor_id":"private@example.test","action":"unsafe-token=synthetic-secret"}',now()+interval '2 minutes');
set local role service_role;
select results_eq($$select actor_id,action from public.admin_auth_events(2,0)$$,
 $$values (null::text,'auth_event'::text),('98000000-0000-4000-8000-000000000001'::text,'login'::text)$$,'Auth event fields discard arbitrary identity, payload and action strings');
select ok((select count(*) from public.admin_auth_events(10000,-2)) between 2 and 26,'limit and negative offset are bounded');
select lives_ok($$select public.admin_record_user_operation('98000000-0000-4000-8000-000000000001',null,'user_invited','pending','98000000-3000-4000-8000-000000000001')$$,'service can record an initial audit intent');
select throws_ok($$select public.admin_record_user_operation('98000000-0000-4000-8000-000000000001',null,'unsafe','pending','98000000-3000-4000-8000-000000000001')$$,'22023',null,'audit rejects unexpected action names');
reset role;
select is((select count(*) from public.audit_logs where user_id='98000000-0000-4000-8000-000000000001' and action='user_invited_pending' and metadata='{"operation_id":"98000000-3000-4000-8000-000000000001","status":"pending"}'::jsonb),1::bigint,'admin audit stores only operation ID and status');
select * from finish();
rollback;
