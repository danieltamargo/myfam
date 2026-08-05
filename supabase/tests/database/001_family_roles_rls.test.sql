begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

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

insert into public.family_invitations (id, family_id, invited_by, invited_user_id, status)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'pending'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'pending'
  );

select has_function(
  'private',
  'is_family_member',
  array['uuid', 'uuid'],
  'membership helper lives in private'
);
select has_function(
  'private',
  'has_family_role',
  array['uuid', 'uuid', 'text[]'],
  'role helper lives in private'
);
select hasnt_function(
  'public',
  'is_family_member',
  array['uuid', 'uuid'],
  'legacy public membership helper is absent'
);
select hasnt_function(
  'public',
  'has_family_role',
  array['uuid', 'uuid', 'text[]'],
  'legacy public role helper is absent'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'email', 'select'),
  'authenticated cannot select profile email'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'select'),
  'authenticated can select the public display name'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.public_profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'Bob can read a profile in his family'
);
select is(
  (select count(*)::integer from public.public_profiles where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'),
  0,
  'Bob cannot read a profile from another family'
);
select throws_ok(
  $$select email from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  '42501'
);
select is(
  private.is_family_member(
    'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
  ),
  false,
  'a caller cannot spoof another user id in a helper'
);
select throws_ok(
  $$insert into public.family_members (family_id, user_id, role) values ('fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'owner')$$,
  '42501'
);

delete from public.family_members
where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
update public.family_members
set role = 'member'
where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

reset role;

select is(
  (
    select role
    from public.family_members
    where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'owner',
  'an admin cannot delete an owner'
);
select is(
  (
    select count(*)::integer
    from public.family_members
    where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  1,
  'an admin cannot mutate an owner row'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.family_invitations),
  1,
  'a manager sees only invitations for the managed family'
);
select is(
  (
    select count(*)::integer
    from public.get_managed_family_invitations('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')
    where invited_email = 'carol@example.test'
  ),
  1,
  'authorized managers can resolve the invitation email'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $$update public.family_members set role = 'owner' where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'$$,
  '42501'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.invite_family_member('faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'bob@example.test')$$,
  '42501'
);
select lives_ok(
  $$select public.accept_family_invitation('11111111-1111-4111-8111-111111111111')$$,
  'the recipient can accept through the transactional RPC'
);

reset role;

select is(
  (
    select role
    from public.family_members
    where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
  ),
  'member',
  'acceptance creates a member with the fixed member role'
);
select is(
  (
    select status
    from public.family_invitations
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  'accepted',
  'acceptance updates the invitation in the same transaction'
);
select is(
  (
    select count(*)::integer
    from public.family_members
    where family_id = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and role = 'owner'
  ),
  1,
  'family A still has exactly one owner'
);
select has_index('public', 'families', 'idx_families_created_by', 'created_by foreign key is indexed');
select has_index(
  'public',
  'family_invitations',
  'idx_family_invitations_family_status',
  'invitation RLS lookup is indexed'
);

select * from finish();

rollback;
