begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
select ('98000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'birthday-' || n || '@example.test', '{"name":"Birthday fixture"}', now(), now()
from generate_series(1, 4) n;
insert into public.families(id, name, created_by) values
  ('98000000-1000-4000-8000-000000000001', 'Birthday family', '98000000-0000-4000-8000-000000000001'),
  ('98000000-1000-4000-8000-000000000002', 'Other birthday family', '98000000-0000-4000-8000-000000000004');
insert into public.family_members(family_id, user_id, role) values
  ('98000000-1000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001', 'owner'),
  ('98000000-1000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000002', 'admin'),
  ('98000000-1000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000003', 'member'),
  ('98000000-1000-4000-8000-000000000002', '98000000-0000-4000-8000-000000000004', 'owner');
insert into public.family_member_birthdays(family_id, user_id, month, day) values
  ('98000000-1000-4000-8000-000000000001', '98000000-0000-4000-8000-000000000001', 11, 1),
  ('98000000-1000-4000-8000-000000000002', '98000000-0000-4000-8000-000000000004', 11, 2);

select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.family_member_birthdays), 1::bigint, 'member sees only their family birthdays');
select lives_ok($$insert into public.family_member_birthdays(family_id,user_id,month,day) values
  ('98000000-1000-4000-8000-000000000001','98000000-0000-4000-8000-000000000003',2,29)$$,
  'member can register their own leap birthday');
select results_eq($$with changed as (update public.family_member_birthdays set day=5
  where user_id='98000000-0000-4000-8000-000000000001' returning user_id) select count(*)::integer from changed$$,
  array[0], 'member cannot edit another member birthday');
select results_eq($$with changed as (delete from public.family_member_birthdays
  where user_id='98000000-0000-4000-8000-000000000001' returning user_id) select count(*)::integer from changed$$,
  array[0], 'member cannot remove another member birthday');
select throws_ok($$insert into public.family_member_birthdays(family_id,user_id,month,day) values
  ('98000000-1000-4000-8000-000000000002','98000000-0000-4000-8000-000000000003',1,1)$$,
  '42501', null, 'member cannot insert birthdays into another family');
select throws_ok($$update public.family_member_birthdays set month=4,day=31
  where user_id='98000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'impossible month day combinations are rejected');
select lives_ok($$delete from public.family_member_birthdays
  where user_id='98000000-0000-4000-8000-000000000003'$$, 'member can remove their own birthday');

reset role;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$insert into public.family_member_birthdays(family_id,user_id,month,day) values
  ('98000000-1000-4000-8000-000000000001','98000000-0000-4000-8000-000000000003',5,3)$$,
  'admin can register birthdays for family members');
select results_eq($$with changed as (update public.family_member_birthdays set day=4
  where user_id='98000000-0000-4000-8000-000000000003' returning day) select day::integer from changed$$,
  array[4], 'admin can update birthdays in their own family');
select results_eq($$with changed as (update public.family_member_birthdays set day=4
  where family_id='98000000-1000-4000-8000-000000000002' returning day) select count(*)::integer from changed$$,
  array[0], 'admin cannot mutate birthdays in another family');
select throws_ok($$insert into public.family_member_birthdays(family_id,user_id,month,day) values
  ('98000000-1000-4000-8000-000000000001','98000000-0000-4000-8000-000000000004',5,3)$$,
  '23503', null, 'only actual family members can receive a birthday');

reset role;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('98000000-4000-4000-8000-000000000002','98000000-0000-4000-8000-000000000002','totp','verified',now(),now());
set local role authenticated;
select is((select count(*) from public.family_member_birthdays), 0::bigint, 'pending MFA session cannot read birthdays');
select throws_ok($$insert into public.family_member_birthdays(family_id,user_id,month,day) values
  ('98000000-1000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002',5,3)$$,
  '42501', null, 'pending MFA session cannot write birthdays');
reset role;
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.family_member_birthdays), 2::bigint, 'verified MFA restores authorized birthday reads');
reset role;
delete from public.family_members where family_id='98000000-1000-4000-8000-000000000001'
  and user_id='98000000-0000-4000-8000-000000000003';
select is((select count(*) from public.family_member_birthdays
  where user_id='98000000-0000-4000-8000-000000000003'), 0::bigint, 'removing membership removes its birthday');

select * from finish();
rollback;
