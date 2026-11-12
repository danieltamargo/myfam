begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, created_at, updated_at)
select ('99000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'expense-event-' || n || '@example.test', now(), now()
from generate_series(1, 4) as n;
insert into public.families(id, name, created_by) values
  ('99000000-1000-4000-8000-000000000001', 'Expense events', '99000000-0000-4000-8000-000000000001'),
  ('99000000-1000-4000-8000-000000000002', 'Other family', '99000000-0000-4000-8000-000000000004');
insert into public.family_members(family_id, user_id, role) values
  ('99000000-1000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'owner'),
  ('99000000-1000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002', 'member'),
  ('99000000-1000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000003', 'member'),
  ('99000000-1000-4000-8000-000000000002', '99000000-0000-4000-8000-000000000004', 'owner');
insert into public.expense_collections(id, family_id, name, created_by) values
  ('99000000-2000-4000-8000-000000000001', '99000000-1000-4000-8000-000000000001', 'Collection', '99000000-0000-4000-8000-000000000001');
insert into public.expense_collection_members(collection_id, user_id, role, status, joined_at) values
  ('99000000-2000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('99000000-2000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002', 'manager', 'active', now()),
  ('99000000-2000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000003', 'viewer', 'active', now());
insert into public.calendar_events(id, family_id, created_by, title, starts_at, ends_at, timezone, visibility) values
  ('99000000-3000-4000-8000-000000000001', '99000000-1000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'Private event', '2026-11-09T10:00:00Z', '2026-11-09T11:00:00Z', 'UTC', 'selected_members'),
  ('99000000-3000-4000-8000-000000000002', '99000000-1000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'Family event', '2026-11-09T10:00:00Z', '2026-11-09T11:00:00Z', 'UTC', 'family'),
  ('99000000-3000-4000-8000-000000000003', '99000000-1000-4000-8000-000000000002', '99000000-0000-4000-8000-000000000004', 'Other event', '2026-11-09T10:00:00Z', '2026-11-09T11:00:00Z', 'UTC', 'family');

create function pg_temp.save_expense(p_id uuid default null, p_version bigint default null,
  p_change text default 'keep', p_event uuid default null, p_description text default 'Original')
returns uuid language sql as $$
  select public.save_expense_with_event('99000000-2000-4000-8000-000000000001', p_id, p_version,
    null, '99000000-0000-4000-8000-000000000001', p_description, 20, '2026-11-09', null, null,
    '[{"user_id":"99000000-0000-4000-8000-000000000001","amount":20}]'::jsonb, p_change, p_event);
$$;

select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select set_config('tests.expense_event_id', pg_temp.save_expense(p_change => 'replace', p_event => '99000000-3000-4000-8000-000000000001')::text, true);
select is((select count(*) from public.expense_event_links), 1::bigint, 'expense links a visible event');
select is((select sum(amount) from public.expense_splits), 20::numeric, 'split is committed with the event');
select throws_ok($$select pg_temp.save_expense(p_change => 'replace', p_event => '99000000-3000-4000-8000-000000000003')$$,
  '42501', null, 'another family event cannot be associated');
select is((select count(*) from public.expenses), 1::bigint, 'invalid association rolls back the entire creation');
select throws_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid, 999, 'clear')$$,
  'PT409', null, 'stale version cannot clear the event');
select is((select count(*) from public.expense_event_links), 1::bigint, 'stale update preserves the link');
select throws_ok($$insert into public.expense_event_links(expense_id, collection_id, family_id, event_id)
  values (current_setting('tests.expense_event_id')::uuid, '99000000-2000-4000-8000-000000000001',
  '99000000-1000-4000-8000-000000000001', '99000000-3000-4000-8000-000000000002')$$,
  '42501', null, 'direct writes cannot bypass the transaction');

reset role;
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.expenses), 1::bigint, 'manager can read the expense');
select is((select count(*) from public.expense_event_links), 0::bigint, 'manager cannot infer the private event UUID');
select lives_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid,
  (select version from public.expenses limit 1), p_description => 'Edited without event access')$$,
  'manager can edit without changing an invisible link');
select throws_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid,
  (select version from public.expenses limit 1), 'replace', '99000000-3000-4000-8000-000000000001', 'Must roll back')$$,
  '42501', null, 'manager cannot explicitly select a hidden event');
select is((select description from public.expenses limit 1), 'Edited without event access', 'failed association preserves expense fields');

reset role;
select is((select count(*) from public.expense_event_links), 1::bigint, 'editing with keep preserved the hidden association');
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid,
  (select version from public.expenses limit 1), 'clear')$$, '42501', null, 'viewer cannot modify event associations');

reset role;
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.expense_event_links), 0::bigint, 'other family cannot see associations');
select throws_ok($$select pg_temp.save_expense()$$, '42501', null, 'other family cannot create an expense');

reset role;
select set_config('request.jwt.claims', '{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid,
  (select version from public.expenses limit 1), 'replace', '99000000-3000-4000-8000-000000000002')$$, 'owner can move expense to a different event');
select is((select event_id from public.expense_event_links), '99000000-3000-4000-8000-000000000002'::uuid, 'new event association is stored');
select lives_ok($$select pg_temp.save_expense(current_setting('tests.expense_event_id')::uuid,
  (select version from public.expenses limit 1), 'clear')$$, 'owner can make expense generic');
select is((select count(*) from public.expense_event_links), 0::bigint, 'generic expense has no event link');
select lives_ok($$select pg_temp.save_expense()$$, 'legacy expense form creates a generic expense');

select * from finish();
rollback;
