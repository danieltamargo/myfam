begin;

create extension if not exists pgtap with schema extensions;

select plan(37);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('22000000-0000-4000-8000-000000000001', 'authenticated', 'splits-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('22000000-0000-4000-8000-000000000002', 'authenticated', 'splits-manager@example.test', '{"name":"Manager"}', now(), now()),
  ('22000000-0000-4000-8000-000000000003', 'authenticated', 'splits-contributor@example.test', '{"name":"Contributor"}', now(), now()),
  ('22000000-0000-4000-8000-000000000004', 'authenticated', 'splits-viewer@example.test', '{"name":"Viewer"}', now(), now()),
  ('22000000-0000-4000-8000-000000000005', 'authenticated', 'splits-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values ('22000000-1000-4000-8000-000000000001', 'Split family', '22000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role)
values
  ('22000000-1000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'owner'),
  ('22000000-1000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'member'),
  ('22000000-1000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000003', 'member'),
  ('22000000-1000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000004', 'member');

insert into public.expense_collections (id, family_id, created_by, name, currency)
values (
  '22000000-2000-4000-8000-000000000001',
  '22000000-1000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Repartos',
  'EUR'
);

insert into public.expense_collection_members (collection_id, user_id, role, status, invited_by, joined_at)
values
  ('22000000-2000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'owner', 'active', '22000000-0000-4000-8000-000000000001', now()),
  ('22000000-2000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'manager', 'active', '22000000-0000-4000-8000-000000000001', now()),
  ('22000000-2000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000003', 'contributor', 'active', '22000000-0000-4000-8000-000000000001', now()),
  ('22000000-2000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000004', 'viewer', 'active', '22000000-0000-4000-8000-000000000001', now());

select has_table('public', 'expense_splits', 'expense splits table exists');
select has_table('public', 'recurring_expense_rules', 'recurring rules table exists');
select has_table('public', 'recurring_expense_splits', 'recurring split templates table exists');
select has_function(
  'public',
  'create_expense_with_splits',
  array['uuid', 'uuid', 'uuid', 'text', 'numeric', 'date', 'text', 'text', 'jsonb'],
  'atomic expense creation RPC exists'
);
select has_function(
  'public',
  'update_expense_with_splits',
  array['uuid', 'uuid', 'bigint', 'uuid', 'uuid', 'text', 'numeric', 'date', 'text', 'text', 'jsonb'],
  'atomic expense update RPC exists'
);
select has_function(
  'public',
  'create_recurring_expense_rule',
  array['uuid', 'uuid', 'uuid', 'text', 'numeric', 'text', 'text', 'date', 'jsonb'],
  'recurring rule creation RPC exists'
);
select has_function(
  'public',
  'set_recurring_expense_rule_active',
  array['uuid', 'uuid', 'boolean'],
  'recurring rule state RPC exists'
);
select has_function('public', 'process_due_recurring_expenses', array['date'], 'idempotent processor exists');
select has_function('public', 'get_expense_balances', array['uuid', 'date', 'date'], 'balance RPC exists');
select ok(not has_table_privilege('authenticated', 'public.expense_splits', 'insert'), 'splits cannot be inserted outside atomic RPCs');
select ok(not has_table_privilege('authenticated', 'public.expense_splits', 'update'), 'splits cannot be updated outside atomic RPCs');
select ok(not has_table_privilege('authenticated', 'public.recurring_expense_rules', 'insert'), 'recurring rules cannot be inserted outside atomic RPCs');

select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.create_expense_with_splits(
    '22000000-2000-4000-8000-000000000001',
    null,
    '22000000-0000-4000-8000-000000000001',
    'Compra compartida',
    10.01,
    '2026-01-15',
    null,
    null,
    '[{"user_id":"22000000-0000-4000-8000-000000000001","amount":5.01},{"user_id":"22000000-0000-4000-8000-000000000003","amount":5.00}]'::jsonb
  )$$,
  'contributor can create an expense with a cent-safe split'
);
select is((select count(*)::integer from public.expense_splits), 2, 'atomic creation writes every split');
select is((select sum(amount) from public.expense_splits), 10.01::numeric, 'split sum equals the expense exactly');
select is(
  (select amount from public.expense_splits where user_id = '22000000-0000-4000-8000-000000000001'),
  5.01::numeric,
  'odd cents are assigned deterministically'
);
select throws_ok(
  $$select public.create_expense_with_splits(
    '22000000-2000-4000-8000-000000000001', null,
    '22000000-0000-4000-8000-000000000001', 'Descuadre', 10.01, '2026-01-16', null, null,
    '[{"user_id":"22000000-0000-4000-8000-000000000001","amount":5.00},{"user_id":"22000000-0000-4000-8000-000000000003","amount":5.00}]'::jsonb
  )$$,
  '22023',
  'Splits must be unique active participants and add up exactly to the amount',
  'an inexact split is rejected atomically'
);
select lives_ok(
  $$select public.create_recurring_expense_rule(
    '22000000-2000-4000-8000-000000000001', null,
    '22000000-0000-4000-8000-000000000001', 'Cuota mensual', 10.01, null,
    'monthly', '2026-01-31',
    '[{"user_id":"22000000-0000-4000-8000-000000000001","amount":5.01},{"user_id":"22000000-0000-4000-8000-000000000003","amount":5.00}]'::jsonb
  )$$,
  'contributor can create a recurring rule'
);
select is(
  (select frequency from public.recurring_expense_rules where description = 'Cuota mensual'),
  'monthly',
  'recurring frequency is stored'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_splits), 2, 'viewer can read expense splits');
select throws_ok(
  $$select public.create_expense_with_splits(
    '22000000-2000-4000-8000-000000000001', null,
    '22000000-0000-4000-8000-000000000004', 'No permitido', 1, '2026-01-17', null, null,
    '[{"user_id":"22000000-0000-4000-8000-000000000004","amount":1}]'::jsonb
  )$$,
  '42501',
  'Expense creation permission required',
  'viewer cannot create split expenses'
);
select throws_ok(
  $$select public.process_due_recurring_expenses('2026-03-31')$$,
  '42501',
  'permission denied for function process_due_recurring_expenses',
  'authenticated clients cannot execute the scheduled processor'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.update_expense_with_splits(
    '22000000-2000-4000-8000-000000000001',
    (select id from public.expenses where description = 'Compra compartida'),
    1,
    null,
    '22000000-0000-4000-8000-000000000001',
    'Compra compartida',
    10.01,
    '2026-01-15',
    null,
    null,
    '[{"user_id":"22000000-0000-4000-8000-000000000001","amount":6.00},{"user_id":"22000000-0000-4000-8000-000000000003","amount":4.01}]'::jsonb
  )$$,
  'manager can update another member expense and its splits atomically'
);
select is((select version::integer from public.expenses where description = 'Compra compartida'), 2, 'atomic update bumps the optimistic version');
select is(
  (select amount from public.expense_splits where user_id = '22000000-0000-4000-8000-000000000001'),
  6.00::numeric,
  'atomic update replaces the split amounts'
);

reset role;

select is(public.process_due_recurring_expenses('2026-03-31'), 3, 'processor creates every due monthly occurrence');
select is(
  (select array_agg(occurred_on order by occurred_on) from public.expenses where recurring_rule_id is not null),
  array['2026-01-31'::date, '2026-02-28'::date, '2026-03-31'::date],
  'month-end recurrence preserves the intended calendar day'
);
select is(public.process_due_recurring_expenses('2026-03-31'), 0, 'processing the same window twice is idempotent');
select is(
  (select sum(split.amount) from public.expense_splits as split join public.expenses as expense on expense.id = split.expense_id where expense.recurring_rule_id is not null),
  30.03::numeric,
  'generated occurrences copy exact split templates'
);
select is(
  (select next_run from public.recurring_expense_rules where description = 'Cuota mensual'),
  '2026-04-30'::date,
  'monthly schedule advances from March 31 to April 30'
);

select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select balance from public.get_expense_balances('22000000-2000-4000-8000-000000000001', '2026-01-01', '2026-03-31') where user_id = '22000000-0000-4000-8000-000000000001'),
  19.01::numeric,
  'balance reports what the payer advanced in the selected period'
);
select is(
  (select balance from public.get_expense_balances('22000000-2000-4000-8000-000000000001', '2026-01-01', '2026-03-31') where user_id = '22000000-0000-4000-8000-000000000003'),
  (-19.01)::numeric,
  'balance reports what another participant owes without creating a settlement'
);

reset role;
update public.expense_collection_members
set status = 'revoked', removed_at = now()
where collection_id = '22000000-2000-4000-8000-000000000001'
  and user_id = '22000000-0000-4000-8000-000000000003';

select is(public.process_due_recurring_expenses('2026-04-30'), 0, 'processor skips a rule whose participants changed');
select is(
  (select active from public.recurring_expense_rules where description = 'Cuota mensual'),
  false,
  'invalid recurring rule is deactivated safely'
);

select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.expense_splits), 0, 'outsider cannot read splits');
select is((select count(*)::integer from public.recurring_expense_rules), 0, 'outsider cannot read recurring rules');
select is(
  (select count(*)::integer from public.get_expense_balances('22000000-2000-4000-8000-000000000001', '2026-01-01', '2026-12-31')),
  0,
  'outsider receives no balance data'
);

select * from finish();

rollback;
