begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,role,email,raw_user_meta_data,created_at,updated_at)
values ('97000000-0000-4000-8000-000000000001','authenticated','recovery-fixture@example.test','{}',now(),now()),
  ('97000000-0000-4000-8000-000000000002','authenticated','recovery-other@example.test','{}',now(),now());
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.replace_my_mfa_recovery_codes(array[repeat('a',64)])$$,'42501',null,'AAL1 cannot generate recovery codes');
select throws_ok($$select public.begin_mfa_recovery('97000000-0000-4000-8000-000000000001',repeat('a',64),'97000000-3000-4000-8000-000000000001')$$,'42501',null,'clients cannot consume codes');
select throws_ok($$select * from private.mfa_recovery_codes$$,'42501',null,'clients cannot read hashes');
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.replace_my_mfa_recovery_codes(array[repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64)])$$,'AAL2 can create own recovery batch');
reset role;
select is((select count(*) from private.mfa_recovery_codes where user_id='97000000-0000-4000-8000-000000000001'),8::bigint,'only hashes are stored');
set local role service_role;
select is(public.begin_mfa_recovery('97000000-0000-4000-8000-000000000002',repeat('a',64),'97000000-3000-4000-8000-000000000001'),false,'code from another account is rejected');
select is(public.begin_mfa_recovery('97000000-0000-4000-8000-000000000001',repeat('9',64),'97000000-3000-4000-8000-000000000001'),false,'invalid hash is rejected');
select is(public.begin_mfa_recovery('97000000-0000-4000-8000-000000000001',repeat('a',64),'97000000-3000-4000-8000-000000000001'),true,'valid hash starts recovery');
select is(public.begin_mfa_recovery('97000000-0000-4000-8000-000000000001',repeat('a',64),'97000000-3000-4000-8000-000000000002'),false,'consumed code cannot start another job');
reset role;
select is((select count(*) from private.mfa_recovery_codes where user_id='97000000-0000-4000-8000-000000000001'),0::bigint,'consumption revokes the whole batch');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('97000000-2000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour',clock_timestamp()),
 ('97000000-2000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()),
 ('97000000-2000-4000-8000-000000000003','97000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp());
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-2000-4000-8000-000000000002"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),false,'pending recovery denies AAL2 before a session is bound');
select throws_ok($$select public.complete_my_mfa_recovery()$$,'42501',null,'pending recovery cannot be completed');
reset role;
set local role service_role;
select throws_ok($$select public.bind_mfa_recovery_session('97000000-0000-4000-8000-000000000001','97000000-3000-4000-8000-000000000002','97000000-2000-4000-8000-000000000002')$$,'42501',null,'different job cannot bind');
select throws_ok($$select public.bind_mfa_recovery_session('97000000-0000-4000-8000-000000000001','97000000-3000-4000-8000-000000000001','97000000-2000-4000-8000-000000000001')$$,'42501',null,'old session cannot be bound');
select lives_ok($$select public.bind_mfa_recovery_session('97000000-0000-4000-8000-000000000001','97000000-3000-4000-8000-000000000001','97000000-2000-4000-8000-000000000002')$$,'server binds the fresh recovery session');
reset role;
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"97000000-2000-4000-8000-000000000002"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),false,'bound AAL1 cannot access data even with no verified factors');
select throws_ok($$select public.complete_my_mfa_recovery()$$,'42501',null,'bound session must verify the new factor');
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-2000-4000-8000-000000000003"}',true);
select is(private.session_meets_mfa(),false,'unbound fresh AAL2 cannot access data');
select throws_ok($$select public.complete_my_mfa_recovery()$$,'42501',null,'unbound AAL2 cannot finish recovery');
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-2000-4000-8000-000000000002"}',true);
select lives_ok($$select public.complete_my_mfa_recovery()$$,'bound real AAL2 completes recovery');
select is(private.session_meets_mfa(),true,'bound AAL2 can access data after completion');
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-2000-4000-8000-000000000001"}',true);
select is(private.session_meets_mfa(),false,'old AAL2 remains blocked after completion');
reset role;
delete from auth.sessions where id='97000000-2000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"97000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"97000000-2000-4000-8000-000000000002"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),false,'revoked recovery JWT remains blocked after completion');
reset role;
select is((select count(*) from private.mfa_recovery_audit where user_id='97000000-0000-4000-8000-000000000001' and event='recovery_completed'),1::bigint,'completion is audited exactly once');
select * from finish();
rollback;
