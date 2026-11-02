begin;
select plan(20);
insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'authenticated', 'alice@example.test', '{"name":"Alice"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'authenticated', 'bob@example.test', '{"name":"Bob"}', now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'authenticated', 'carol@example.test', '{"name":"Carol"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Familia A', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Familia B', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3');

insert into public.family_members (family_id, user_id, role)
values
  ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner'),
  ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'admin'),
  ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'owner');


update public.family_members set role='member' where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated","aal":"aal1"}', true); set local role authenticated;
select throws_ok($q$select public.set_family_member_capabilities('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true,true)$q$, '42501');
select throws_ok($q$update public.family_members set can_manage_members=true where family_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$q$, '42501');
select throws_ok($q$select public.set_family_module_preference('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','notes',false)$q$, '42501');
select throws_ok($q$select public.invite_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','carol@example.test')$q$, '42501');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated","aal":"aal1"}', true); set local role authenticated;
select lives_ok($q$select public.set_family_member_capabilities('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true,false)$q$, 'owner delegates member management');
select throws_ok($q$select public.set_family_member_capabilities('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',true,true)$q$, '42501');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated","aal":"aal1"}', true); set local role authenticated;
select lives_ok($q$select public.invite_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','carol@example.test')$q$, 'delegate invites');
select lives_ok($q$select * from public.get_managed_family_invitations('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$q$, 'delegate reads managed invitations');
select throws_ok($q$select public.set_family_module_preference('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','notes',false)$q$, '42501');
select throws_ok($q$select public.set_family_member_capabilities('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',true,true)$q$, '42501');
select throws_ok($q$select public.remove_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$q$, '42501');
select throws_ok($q$select public.invite_family_member('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','alice@example.test')$q$, '42501');
update public.family_members set role='admin' where family_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
select is((select role from public.family_members where family_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'), 'member', 'delegate cannot elevate own role');
reset role;
insert into public.family_members(family_id, user_id, role) values ('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc3','admin');
set local role authenticated;
select throws_ok($q$select public.remove_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc3')$q$, '42501');
reset role;
update public.family_members set role='member' where family_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
set local role authenticated;
select lives_ok($q$select public.remove_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','cccccccc-cccc-4ccc-8ccc-ccccccccccc3')$q$, 'delegate removes ordinary member');
select is((select count(*)::integer from public.family_members where family_id='faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and role='owner'), 1, 'last owner preserved');
reset role; select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated","aal":"aal1"}', true); set local role authenticated;
select lives_ok($q$select public.set_family_member_capabilities('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',false,true)$q$, 'owner changes delegated capability');
reset role; select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated","aal":"aal1"}', true); set local role authenticated;
select lives_ok($q$select public.set_family_module_preference('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','notes',false)$q$, 'module delegate configures modules');
select throws_ok($q$select public.invite_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','carol@example.test')$q$, '42501');
select throws_ok($q$select public.set_family_module_preference('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','notes',false)$q$, '42501');
select * from finish(); rollback;
