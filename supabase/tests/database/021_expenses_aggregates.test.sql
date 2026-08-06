begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('21000000-0000-4000-8000-000000000001', 'authenticated', 'analytics-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('21000000-0000-4000-8000-000000000002', 'authenticated', 'analytics-viewer@example.test', '{"name":"Viewer"}', now(), now()),
  ('21000000-0000-4000-8000-000000000003', 'authenticated', 'analytics-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values ('21000000-1000-4000-8000-000000000001', 'Analytics family', '21000000-0000-4000-8000-000000000001');

insert into public.family_members (family_id, user_id, role)
values
  ('21000000-1000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'owner'),
  ('21000000-1000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'member');

insert into public.expense_collections (id, family_id, created_by, name, currency)
values (
  '21000000-2000-4000-8000-000000000001',
  '21000000-1000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Panel',
  'EUR'
);

insert into public.expense_collection_members (collection_id, user_id, role, status, invited_by, joined_at)
values
  ('21000000-2000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'owner', 'active', '21000000-0000-4000-8000-000000000001', now()),
  ('21000000-2000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'viewer', 'active', '21000000-0000-4000-8000-000000000001', now());

insert into public.expense_categories (id, collection_id, name, color)
values
  ('21000000-3000-4000-8000-000000000001', '21000000-2000-4000-8000-000000000001', 'Prueba A', '#2563EB'),
  ('21000000-3000-4000-8000-000000000002', '21000000-2000-4000-8000-000000000001', 'Prueba B', '#16A34A');

insert into public.expenses (collection_id, category_id, created_by, paid_by, description, amount, occurred_on)
values
  ('21000000-2000-4000-8000-000000000001', '21000000-3000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Actual A', 100, '2026-08-01'),
  ('21000000-2000-4000-8000-000000000001', '21000000-3000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'Actual B', 50, '2026-08-02'),
  ('21000000-2000-4000-8000-000000000001', '21000000-3000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Anterior', 80, '2026-07-10'),
  ('21000000-2000-4000-8000-000000000001', null, '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Fuera', 999, '2026-09-01');

insert into public.expenses (collection_id, category_id, created_by, paid_by, description, amount, occurred_on)
select
  '21000000-2000-4000-8000-000000000001',
  '21000000-3000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Carga ' || sample,
  1,
  '2026-08-15'
from generate_series(1, 1001) as sample;

select has_function(
  'public',
  'get_expense_dashboard',
  array['uuid', 'date', 'date', 'date', 'date', 'uuid', 'uuid', 'text'],
  'expense dashboard RPC exists'
);
select has_index('public', 'expenses', 'expenses_collection_occurred_id_idx', 'cursor index exists');

select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') ->> 'current_total')::numeric,
  1151::numeric,
  'dashboard totals the selected period'
);
select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') ->> 'previous_total')::numeric,
  80::numeric,
  'dashboard totals the equivalent previous period'
);
select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31', '21000000-0000-4000-8000-000000000002') ->> 'current_total')::numeric,
  50::numeric,
  'payer filter scopes every aggregate'
);
select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31', null, '21000000-3000-4000-8000-000000000002') ->> 'current_total')::numeric,
  50::numeric,
  'category filter scopes every aggregate'
);
select is(
  jsonb_array_length(public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') -> 'series'),
  3,
  'daily series contains only populated buckets'
);
select is(
  jsonb_array_length(public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') -> 'by_category'),
  2,
  'category breakdown is returned'
);
select is((select count(*)::integer from public.expenses where occurred_on between '2026-08-01' and '2026-08-31'), 1003, 'dataset exercises more than one thousand expenses');
select performs_ok(
  $$select public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31')$$,
  1000,
  'dashboard remains responsive with more than one thousand expenses'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') ->> 'current_total')::numeric,
  1151::numeric,
  'viewer can query analytics through RLS'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"21000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (public.get_expense_dashboard('21000000-2000-4000-8000-000000000001', '2026-08-01', '2026-08-31', '2026-07-01', '2026-07-31') ->> 'current_total')::numeric,
  0::numeric,
  'outsider receives no aggregate data'
);

select * from finish();

rollback;
