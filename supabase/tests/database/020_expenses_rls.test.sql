begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'expenses-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'expenses-manager@example.test', '{"name":"Manager"}', now(), now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'expenses-contributor@example.test', '{"name":"Contributor"}', now(), now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'expenses-viewer@example.test', '{"name":"Viewer"}', now(), now()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'expenses-invited@example.test', '{"name":"Invited"}', now(), now()),
  ('20000000-0000-4000-8000-000000000006', 'authenticated', 'family-owner@example.test', '{"name":"Family owner"}', now(), now()),
  ('20000000-0000-4000-8000-000000000007', 'authenticated', 'expenses-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values (
  '20000000-1000-4000-8000-000000000001',
  'Expense family',
  '20000000-0000-4000-8000-000000000006'
);

insert into public.family_members (family_id, user_id, role)
values
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'owner'),
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'member'),
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'member'),
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'member'),
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'member'),
  ('20000000-1000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'member');

insert into public.expense_collections (
  id,
  family_id,
  created_by,
  name,
  currency
) values (
  '20000000-2000-4000-8000-000000000001',
  '20000000-1000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Casa',
  'EUR'
);

insert into public.expense_collection_members (
  collection_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at
) values
  ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner', 'active', '20000000-0000-4000-8000-000000000001', now()),
  ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'manager', 'active', '20000000-0000-4000-8000-000000000001', now()),
  ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'contributor', 'active', '20000000-0000-4000-8000-000000000001', now()),
  ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'viewer', 'active', '20000000-0000-4000-8000-000000000001', now()),
  ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'viewer', 'invited', '20000000-0000-4000-8000-000000000001', null);

insert into public.expense_categories (id, collection_id, name, color, icon)
values (
  '20000000-3000-4000-8000-000000000001',
  '20000000-2000-4000-8000-000000000001',
  'Vivienda',
  '#336699',
  'home'
);

insert into public.expenses (
  id,
  collection_id,
  category_id,
  created_by,
  paid_by,
  description,
  amount,
  occurred_on
) values
  (
    '20000000-4000-4000-8000-000000000001',
    '20000000-2000-4000-8000-000000000001',
    '20000000-3000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Alquiler',
    950,
    '2026-08-01'
  ),
  (
    '20000000-4000-4000-8000-000000000002',
    '20000000-2000-4000-8000-000000000001',
    '20000000-3000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    'Compra',
    40.25,
    '2026-08-02'
  );

select has_table('public', 'expense_collections', 'expense collections table exists');
select has_table('public', 'expense_collection_members', 'expense members table exists');
select has_table('public', 'expense_categories', 'expense categories table exists');
select has_table('public', 'expenses', 'expenses table exists');
select has_function('public', 'create_expense_collection', array['uuid', 'text', 'text', 'text'], 'collection creation RPC exists');
select has_function('public', 'invite_expense_collection_member', array['uuid', 'uuid', 'text'], 'invitation RPC exists');
select has_function('public', 'accept_expense_collection_invitation', array['uuid'], 'invitation acceptance RPC exists');
select has_function('public', 'change_expense_collection_role', array['uuid', 'uuid', 'text'], 'role change RPC exists');
select has_function('public', 'transfer_expense_collection_ownership', array['uuid', 'uuid'], 'ownership transfer RPC exists');
select has_function('public', 'revoke_expense_collection_member', array['uuid', 'uuid'], 'revocation RPC exists');
select has_function('public', 'leave_expense_collection', array['uuid'], 'leave RPC exists');
select has_function('public', 'get_expense_collection_invitations', array[]::text[], 'pending invitation RPC exists');
select is((select public from storage.buckets where id = 'expense-receipts'), false, 'expense receipt bucket is private');
select ok(not has_table_privilege('authenticated', 'public.expense_collection_members', 'insert'), 'membership cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.expense_collection_members', 'update'), 'membership cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.expense_collection_members', 'delete'), 'membership cannot be deleted directly');
select ok(not has_column_privilege('authenticated', 'public.expenses', 'version', 'update'), 'expense versions cannot be rewritten directly');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_collections), 1, 'collection owner reads collection');
select is((select count(*)::integer from public.expense_collection_members), 5, 'collection owner reads all participants');
select lives_ok(
  $$select public.invite_expense_collection_member('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'viewer')$$,
  'collection owner can invite a family member'
);
select lives_ok(
  $$select public.change_expense_collection_role('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'viewer')$$,
  'collection owner can change a non-owner role'
);
select throws_ok(
  $$select public.leave_expense_collection('20000000-2000-4000-8000-000000000001')$$,
  '42501'
);
select lives_ok(
  $$insert into public.expenses (collection_id, created_by, paid_by, description, amount, occurred_on) values ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'Luz', 63.80, '2026-08-03')$$,
  'owner can create an expense paid by an active member'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expenses), 3, 'manager reads every collection expense');
select lives_ok(
  $$update public.expenses set notes = 'revisado' where id = '20000000-4000-4000-8000-000000000001'$$,
  'manager can update another member expense'
);
select lives_ok(
  $$select public.revoke_expense_collection_member('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006')$$,
  'manager can revoke an invited viewer'
);
select lives_ok(
  $$select public.invite_expense_collection_member('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'viewer')$$,
  'manager can re-invite a revoked or left viewer'
);

reset role;
update public.expense_collection_members
set status = 'invited', removed_at = null, joined_at = null
where collection_id = '20000000-2000-4000-8000-000000000001'
  and user_id = '20000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expenses), 3, 'contributor reads every collection expense');
select lives_ok(
  $$insert into public.expenses (collection_id, created_by, paid_by, description, amount, occurred_on) values ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Internet', 49.99, '2026-08-04')$$,
  'contributor can create their own expense'
);
select lives_ok(
  $$update public.expenses set notes = 'propio' where id = '20000000-4000-4000-8000-000000000002'$$,
  'contributor can update their own expense'
);
select is(
  (select notes from public.expenses where id = '20000000-4000-4000-8000-000000000001'),
  'revisado',
  'contributor cannot update an expense created by another member'
);
select is(
  (select version::integer from public.expenses where id = '20000000-4000-4000-8000-000000000002'),
  2,
  'successful updates increment the optimistic version'
);
select throws_ok(
  $$insert into public.expense_categories (collection_id, name) values ('20000000-2000-4000-8000-000000000001', 'Ocio')$$,
  '42501'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expenses), 4, 'viewer can read collection expenses');
select throws_ok(
  $$insert into public.expenses (collection_id, created_by, paid_by, description, amount, occurred_on) values ('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Prohibido', 1, '2026-08-04')$$,
  '42501'
);
select lives_ok(
  $$update public.expenses set notes = 'no permitido' where id = '20000000-4000-4000-8000-000000000001'$$,
  'viewer update is safely filtered by RLS'
);
select is(
  (select notes from public.expenses where id = '20000000-4000-4000-8000-000000000001'),
  'revisado',
  'viewer cannot mutate an expense'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_collections), 0, 'invited member cannot read collection data before accepting');
select is((select count(*)::integer from public.expenses), 0, 'invited member cannot read expenses before accepting');
select is((select count(*)::integer from public.expense_collection_members), 1, 'invited member sees only their invitation row');
select is((select count(*)::integer from public.get_expense_collection_invitations()), 1, 'invited member can read minimal invitation details');
select lives_ok(
  $$select public.accept_expense_collection_invitation('20000000-2000-4000-8000-000000000001')$$,
  'invited member can accept atomically'
);
select is((select count(*)::integer from public.expense_collections), 1, 'accepted member gains collection access immediately');
select lives_ok(
  $$select public.leave_expense_collection('20000000-2000-4000-8000-000000000001')$$,
  'non-owner can leave without deleting membership history'
);
select is((select count(*)::integer from public.expense_collections), 0, 'leaving removes collection access immediately');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_collections), 0, 'family owner has no implicit collection access');
select is((select count(*)::integer from public.expenses), 0, 'family owner has no implicit expense access');
select lives_ok(
  $$select public.create_expense_collection('20000000-1000-4000-8000-000000000001', 'Vacaciones', null, 'eur')$$,
  'family member can create a private collection'
);
select is((select count(*)::integer from public.expense_collections), 1, 'creator sees the new private collection');
select is(
  (select count(*)::integer from public.expense_collection_members where role = 'owner' and status = 'active'),
  1,
  'collection creation activates exactly one owner'
);
select is((select count(*)::integer from public.expense_categories), 7, 'new collection receives domestic default categories');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_collections), 0, 'non-family outsider cannot read collections');
select throws_ok(
  $$select public.create_expense_collection('20000000-1000-4000-8000-000000000001', 'Intrusión', null, 'EUR')$$,
  '42501'
);
select throws_ok(
  $$select public.accept_expense_collection_invitation('20000000-2000-4000-8000-000000000001')$$,
  'P0002'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.transfer_expense_collection_ownership('20000000-2000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002')$$,
  'owner can transfer collection ownership atomically'
);
select is(
  (select role from public.expense_collection_members where collection_id = '20000000-2000-4000-8000-000000000001' and user_id = '20000000-0000-4000-8000-000000000002'),
  'owner',
  'target member becomes owner'
);
select is(
  (select count(*)::integer from public.expense_collection_members where collection_id = '20000000-2000-4000-8000-000000000001' and role = 'owner' and status = 'active'),
  1,
  'ownership transfer preserves the single-owner invariant'
);

select * from finish();

rollback;
