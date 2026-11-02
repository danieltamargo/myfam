begin;
-- Match Storage API's transaction context while exercising its RLS policies.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((
  select count(*) from pg_class as relation
  join pg_namespace as schema on schema.oid = relation.relnamespace
  where schema.nspname = 'public' and relation.relkind in ('r', 'p')
    and (not relation.relrowsecurity or not exists (
      select 1 from pg_policy as policy where policy.polrelid = relation.oid
        and policy.polname = 'session_mfa_required' and not policy.polpermissive
        and policy.polcmd = '*' and policy.polroles = array['authenticated'::regrole::oid]
    ))
), 0::bigint, 'every public data table has restrictive MFA for all operations; future gaps fail');
select ok(exists(
  select 1 from pg_policy where polrelid='storage.objects'::regclass
    and polname='session_mfa_required' and not polpermissive and polcmd='*'
), 'Storage uses the same restrictive MFA gate');
select ok((select reloptions @> array['security_invoker=true'] from pg_class
  where oid='public.public_profiles'::regclass), 'public profile view still invokes underlying RLS');
select is((
  select count(*) from pg_proc as routine join pg_namespace as schema on schema.oid=routine.pronamespace
  where schema.nspname='public' and routine.prokind='f' and routine.prosecdef
    and has_function_privilege('authenticated',routine.oid,'execute')
    and routine.proname <> 'get_my_mfa_recovery_state'
    and routine.prosrc not like '%private.require_session_mfa()%'
), 0::bigint, 'every authenticated public definer RPC has its own MFA guard; future RPC gaps fail');
select is(pg_get_function_result('public.get_my_mfa_recovery_state()'::regprocedure),
  'TABLE(required boolean, pending boolean, session_valid boolean, allowed boolean)',
  'recovery bootstrap returns only caller access state, never hashes or personal data');
select ok((select prosrc like '%auth.uid()%' and prosrc like '%s.user_id = caller.user_id%'
  from pg_proc where oid='public.get_my_mfa_recovery_state()'::regprocedure),
  'recovery bootstrap is explicitly scoped to the caller');
select is((
  select count(*) from pg_proc as routine join pg_namespace as schema on schema.oid=routine.pronamespace
  where schema.nspname='private' and routine.prokind='f' and routine.prosecdef
    and has_function_privilege('authenticated',routine.oid,'execute')
    and routine.proname not in ('safe_uuid','storage_path_uuid','session_meets_mfa','require_session_mfa')
    and routine.prosrc not like '%private.session_meets_mfa()%'
), 0::bigint, 'private data helpers also enforce MFA and pure casts remain excluded');
select is((
  select count(*) from pg_proc as routine join pg_namespace as schema on schema.oid=routine.pronamespace
  where schema.nspname='public' and routine.prokind='f' and routine.prosecdef
    and has_function_privilege('authenticated',routine.oid,'execute')
    and (has_function_privilege('anon',routine.oid,'execute')
      or not has_function_privilege('service_role',routine.oid,'execute')
      or pg_get_userbyid(routine.proowner) <> 'postgres'
      or not routine.proconfig @> array['search_path=""'])
), 0::bigint, 'public RPC owners, empty search paths and role grants are preserved');
select ok(not has_function_privilege('service_role','private.can_read_family_game(uuid)','execute'),
  'helper with no previous service grant receives no new grant');
select ok(not has_function_privilege('authenticated','public.acquire_google_calendar_sync(uuid,uuid)','execute'),
  'service-only calendar RPC stays unavailable to users');
select ok(not has_table_privilege('authenticated','private.family_game_secrets','select'),
  'game secrets remain inaccessible directly');
select ok(not has_column_privilege('authenticated','public.external_connections','access_token','select'),
  'MFA does not grant access to provider secrets');
select ok(not has_column_privilege('authenticated','public.profiles','email','select'),
  'private profile columns retain their original grants');
select is((select provolatile::text from pg_proc where oid='private.session_meets_mfa()'::regprocedure),
  's', 'MFA lookup is stable for statement initplans');
select ok((select pg_get_expr(polqual,polrelid) like '%SELECT private.session_meets_mfa()%'
  and pg_get_expr(polwithcheck,polrelid) like '%SELECT private.session_meets_mfa()%'
  from pg_policy where polrelid='public.families'::regclass and polname='session_mfa_required'),
  'RLS wraps the MFA lookup in an uncorrelated SELECT for read and write initplans');

insert into auth.users(id,role,email,raw_user_meta_data,created_at,updated_at)
select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'authenticated','direct-mfa-'||n||'@example.test','{"name":"MFA fixture"}',now(),now()
from generate_series(1,3) n;
insert into public.families(id,name,created_by) values
  ('95000000-1000-4000-8000-000000000001','MFA fixture','95000000-0000-4000-8000-000000000001');
insert into public.family_members(family_id,user_id,role) values
  ('95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','owner'),
  ('95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002','member');
insert into public.expense_collections(id,family_id,created_by,name,currency) values
  ('95000000-5000-4000-8000-000000000001','95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','MFA expense fixture','EUR');
insert into public.expense_collection_members(collection_id,user_id,role,status,invited_by,joined_at) values
  ('95000000-5000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','owner','active','95000000-0000-4000-8000-000000000001',now());
insert into public.gift_items(id,family_id,owner_id,name,desired_quantity) values
  ('95000000-2000-4000-8000-000000000001','95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','MFA fixture gift',1);
insert into public.notifications(user_id,type,title) values
  ('95000000-0000-4000-8000-000000000001','gift_status','Synthetic notification');
insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','95000000-1000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/95000000-3000-4000-8000-000000000001.png','{"size":100}');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('95000000-4000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','totp','verified',now(),now());

select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),true,'AAL1 without own verified factors remains allowed despite another user factor');
select is((select count(*) from public.families where id='95000000-1000-4000-8000-000000000001'),1::bigint,'AAL1 without factors retains direct table reads');
select is((select count(*) from public.get_my_profile()),1::bigint,'AAL1 without factors retains definer RPC reads');
select results_eq($$with changed as (update public.gift_items set description='Allowed AAL1' where id='95000000-2000-4000-8000-000000000001' returning id) select count(*)::integer from changed$$,
  array[1],'AAL1 without factors retains direct mutations');
select set_config('tests.mfa_note',public.create_family_note('95000000-1000-4000-8000-000000000001','Private fixture','Private','private',array[]::uuid[])::text,true);
select is((select count(*) from storage.objects where name='95000000-1000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/95000000-3000-4000-8000-000000000001.png'),1::bigint,'AAL1 without factors retains authorized Storage reads');
reset role;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('95000000-4000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','totp','unverified',now(),now());
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),true,'missing aal with only an unverified factor remains compatible');
select is((select count(*) from public.get_my_profile()),1::bigint,'legacy token with unverified factor retains RPC access');
reset role;
update auth.mfa_factors set status='verified' where id='95000000-4000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),false,'missing aal is rejected once a factor is verified');
reset role;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(current_user::text,'authenticated','fixture really uses SET ROLE authenticated');
select is(private.session_meets_mfa(),false,'SECURITY DEFINER ownership does not bypass a verified factor');
select is((select count(*) from public.families where id='95000000-1000-4000-8000-000000000001'),0::bigint,'verified AAL1 cannot read family rows directly');
select is((select count(*) from public.gift_items where id='95000000-2000-4000-8000-000000000001'),0::bigint,'verified AAL1 cannot read wishlist rows directly');
select is((select count(*) from public.public_profiles where id='95000000-0000-4000-8000-000000000001'),0::bigint,'security-invoker view does not bypass MFA');
select is((select count(*) from public.notifications where user_id='95000000-0000-4000-8000-000000000001'),0::bigint,'direct notification table reads require MFA');
select is((select count(*) from storage.objects where bucket_id='gift-images'),0::bigint,'verified AAL1 cannot read Storage objects');
select results_eq($$with changed as (update public.gift_items set description='Forbidden' where id='95000000-2000-4000-8000-000000000001' returning id) select count(*)::integer from changed$$,
  array[0],'verified AAL1 cannot update rows directly');
select results_eq($$with removed as (delete from public.gift_items where id='95000000-2000-4000-8000-000000000001' returning id) select count(*)::integer from removed$$,
  array[0],'verified AAL1 cannot delete rows directly');
select throws_ok($$insert into public.gift_items(family_id,owner_id,name,desired_quantity) values ('95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Forbidden',1)$$,
  '42501',null,'verified AAL1 cannot insert rows directly');
select results_eq($$with removed as (delete from storage.objects where name='95000000-1000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/95000000-3000-4000-8000-000000000001.png' returning id) select count(*)::integer from removed$$,
  array[0],'verified AAL1 cannot delete Storage objects');
select throws_ok($$insert into public.expenses(collection_id,created_by,paid_by,description,amount,occurred_on) values ('95000000-5000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000001','Forbidden',1,current_date)$$,
  '42501','Verified second factor required','BEFORE INSERT cannot reveal an inactive expense creator');
select throws_ok($$insert into public.expenses(collection_id,created_by,paid_by,description,amount,occurred_on) values ('95000000-5000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000003','Forbidden',1,current_date)$$,
  '42501','Verified second factor required','BEFORE INSERT cannot reveal an inactive expense payer');
select throws_ok($$insert into public.expenses(collection_id,created_by,paid_by,description,amount,occurred_on) values ('95000000-5000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Forbidden',1,current_date)$$,
  '42501','Verified second factor required','active expense participants yield the identical MFA error');
select is(private.is_family_member('95000000-1000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001'),false,'private data helper cannot reveal real membership');
select is(private.is_family_member('95000000-1000-4000-8000-000000000099','95000000-0000-4000-8000-000000000001'),false,'private helper gives the same answer for absent membership');
select is(private.can_read_gift_image('95000000-1000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/95000000-3000-4000-8000-000000000001.png'),false,'PLpgSQL image helper also fails closed');
select throws_ok($$select public.get_my_profile()$$,'42501','Verified second factor required','profile definer read requires verified session');
select throws_ok($$select public.get_expense_collection_invitations()$$,'42501','Verified second factor required','SQL-origin invitation RPC cannot bypass MFA');
select throws_ok($$select public.get_unread_notification_count('95000000-0000-4000-8000-000000000001')$$,'42501','Verified second factor required','notification count RPC cannot bypass MFA');
select throws_ok($$select public.create_family_note('95000000-1000-4000-8000-000000000001','Forbidden','Private','private',array[]::uuid[])$$,
  '42501','Verified second factor required','mutation RPC checks MFA before accessing resources');
select throws_ok($$select public.create_family_game(null,null,'Forbidden')$$,
  '42501','Verified second factor required','legacy SQL game overload cannot bypass MFA');
select throws_ok($$select public.record_expense_settlement(null,null,null,1,null)$$,
  '42501','Verified second factor required','financial RPC checks MFA before input or balance errors');
select throws_ok($$select public.get_calendar_event_origins(null,array[]::uuid[])$$,
  '42501','Verified second factor required','calendar definer read checks MFA before resource lookup');
select throws_ok($$select public.reserve_gift_item(null,1::smallint,'reserved')$$,
  '42501','Verified second factor required','wishlist coordination checks MFA before resource lookup');
reset role;

update auth.mfa_factors set factor_type='phone',phone='+15555550195' where id='95000000-4000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),false,'verified phone factor also requires AAL2');
reset role;
update auth.mfa_factors set factor_type='webauthn',phone=null where id='95000000-4000-4000-8000-000000000001';
set local role authenticated;
select is(private.session_meets_mfa(),false,'verified WebAuthn factor also requires AAL2');
reset role;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),true,'verified AAL2 is allowed');
select is((select count(*) from public.families where id='95000000-1000-4000-8000-000000000001'),1::bigint,'AAL2 restores authorized table reads');
select is((select count(*) from public.public_profiles where id='95000000-0000-4000-8000-000000000001'),1::bigint,'AAL2 restores security-invoker view reads');
select is((select count(*) from public.get_my_profile()),1::bigint,'AAL2 restores definer RPC reads');
select is((select count(*) from storage.objects where name='95000000-1000-4000-8000-000000000001/95000000-0000-4000-8000-000000000001/95000000-3000-4000-8000-000000000001.png'),1::bigint,'AAL2 restores authorized Storage reads');
select results_eq($$with changed as (update public.gift_items set description='Allowed AAL2' where id='95000000-2000-4000-8000-000000000001' returning id) select count(*)::integer from changed$$,
  array[1],'AAL2 restores authorized direct mutations');
select lives_ok($$select public.update_family_note(current_setting('tests.mfa_note')::uuid,1,'Allowed AAL2','Private','private',array[]::uuid[])$$,
  'AAL2 restores authorized RPC mutations');
reset role;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.family_notes where id=current_setting('tests.mfa_note')::uuid),0::bigint,'AAL2 does not expand private resource audiences');
select throws_ok($$select public.update_family_note(current_setting('tests.mfa_note')::uuid,2,'Forbidden','Private','private',array[]::uuid[])$$,
  '42501',null,'AAL2 does not grant another author mutation rights');
reset role;
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*) from public.families where id='95000000-1000-4000-8000-000000000001'),0::bigint,'AAL2 outsider still has no family access');
reset role;

select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role service_role;
select is(private.session_meets_mfa(),true,'actual service role bypass is preserved even with fixture AAL1 claims');
select is((select count(*) from public.get_my_profile()),1::bigint,'service role retains legitimate definer execution');
reset role;
select is(private.session_meets_mfa(),true,'trusted SQL job session without SET ROLE retains internal execution');
set local role authenticated;
select is(private.session_meets_mfa(),false,'SET ROLE authenticated in the same trusted session never inherits the job bypass');
reset role;
delete from auth.mfa_factors where user_id='95000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(private.session_meets_mfa(),true,'removing verified factors restores the original no-MFA account policy');
select is((select count(*) from public.get_my_profile()),1::bigint,'missing-aal account without factors remains compatible after factor removal');
reset role;
set local role anon;
select throws_ok($$select private.session_meets_mfa()$$,'42501',null,'anonymous clients receive no direct factor-status helper access');
reset role;
select is((
  select count(*) from pg_proc where oid in (
    'public.handle_new_user()'::regprocedure, 'public.sync_profile_email()'::regprocedure
  ) and prosecdef and proconfig @> array['search_path=""']
    and strpos(prosrc,'private.session_meets_mfa()') = 0
    and strpos(prosrc,'private.require_session_mfa()') = 0
),2::bigint,'Auth bootstrap functions retain their definer context without the user MFA gate');
select ok(exists(
  select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='on_auth_user_created' and tgfoid='public.handle_new_user()'::regprocedure
    and not tgisinternal and (tgtype & 2)=0 and (tgtype & 4)=4
),'Auth user creation retains its AFTER INSERT bootstrap trigger');
select ok(exists(
  select 1 from pg_trigger where tgrelid='auth.users'::regclass
    and tgname='on_auth_user_email_updated' and tgfoid='public.sync_profile_email()'::regprocedure
    and not tgisinternal and (tgtype & 2)=0 and (tgtype & 16)=16
),'Auth email synchronization retains its AFTER UPDATE trigger');
select * from finish();
rollback;
