begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
select ('23000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'settlement-' || n || '@example.test', '{"name":"Settlement participant"}', now(), now()
from generate_series(1, 6) as n;
insert into public.families (id, name, created_by)
values ('23000000-1000-4000-8000-000000000001', 'Settlements', '23000000-0000-4000-8000-000000000001');
insert into public.family_members (family_id, user_id, role)
select '23000000-1000-4000-8000-000000000001',
  ('23000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 1 then 'owner' else 'member' end
from generate_series(1, 5) as n;
insert into public.expense_collections (id, family_id, created_by, name, currency)
values ('23000000-2000-4000-8000-000000000001', '23000000-1000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001', 'Private collection', 'EUR');
insert into public.expense_collection_members (collection_id, user_id, role, status, joined_at)
select '23000000-2000-4000-8000-000000000001',
  ('23000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case n when 1 then 'owner' when 2 then 'manager' when 3 then 'contributor' else 'viewer' end,
  'active', now()
from generate_series(1, 5) as n;

select ok(not has_table_privilege('authenticated', 'public.expense_settlements', 'insert'), 'ledger cannot be written directly');
select ok(not has_table_privilege('authenticated', 'public.expense_settlements', 'update'), 'ledger is append only');
select ok(not has_table_privilege('authenticated', 'public.expense_settlements', 'delete'), 'ledger cannot be deleted directly');
select ok(not has_table_privilege('authenticated', 'public.expenses', 'delete'), 'expense deletion cannot bypass collection serialization');

select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.create_expense_with_splits(
  '23000000-2000-4000-8000-000000000001', null, '23000000-0000-4000-8000-000000000001',
  'Cent split', 10.00, '2026-01-01', null, null,
  '[{"user_id":"23000000-0000-4000-8000-000000000001","amount":3.33},{"user_id":"23000000-0000-4000-8000-000000000003","amount":3.34},{"user_id":"23000000-0000-4000-8000-000000000005","amount":3.33}]'
);
select is((select sum(balance_cents) from public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001')), 0::numeric, 'global balances sum exactly to zero');
select is((select balance_cents from public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001') where user_id = '23000000-0000-4000-8000-000000000003'), -334::bigint, 'unequal split preserves cents');

reset role;
insert into public.expenses (id, collection_id, created_by, paid_by, description, amount, occurred_on)
values ('23000000-4000-4000-8000-000000000001','23000000-2000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Legacy without split',2,'2025-01-01');
set local role authenticated;
select throws_ok($$select public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001')$$, '22023', 'Expense splits are incomplete', 'legacy missing splits blocks suggestions without inventing debts');
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, '22023', 'Expense splits are incomplete', 'RPC refuses settlement while any historical split is missing');
reset role;
delete from public.expenses where id = '23000000-4000-4000-8000-000000000001';

reset role;
update public.expense_collection_members set status = 'revoked', removed_at = now()
where collection_id = '23000000-2000-4000-8000-000000000001' and user_id = '23000000-0000-4000-8000-000000000005';
select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001')$$, '42501', 'Collection access required', 'outsider cannot read private balances');
select is((select count(*) from public.expense_settlements), 0::bigint, 'outsider cannot read ledger');
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, '42501', 'Settlement permission required', 'outsider cannot write');
select throws_ok($$select public.delete_expense_with_lock('23000000-2000-4000-8000-000000000001','23000000-4000-4000-8000-000000000001',1)$$, '42501', 'Expense deletion permission required', 'outsider cannot invoke atomic expense deletion');

reset role;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, '42501', 'Settlement permission required', 'viewer cannot register payments');
select throws_ok($$select public.delete_expense_with_lock('23000000-2000-4000-8000-000000000001','23000000-4000-4000-8000-000000000001',1)$$, '42501', 'Expense deletion permission required', 'viewer cannot delete expenses');

reset role;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000005','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, '42501', 'Contributors can only record their own payments', 'contributor cannot attest another payer');
select throws_ok($$select public.delete_expense_with_lock('23000000-2000-4000-8000-000000000001',(select id from public.expenses where description = 'Cent split'),1)$$, '42501', 'Expense deletion permission required', 'contributor cannot delete another author expense');
select lives_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, 'contributor records own partial reimbursement');
select lives_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',100,'23000000-3000-4000-8000-000000000001')$$, 'duplicate request succeeds idempotently');
select is((select count(*) from public.expense_settlements), 1::bigint, 'retry never creates a duplicate ledger entry');
select is((select balance_cents from public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001') where user_id = '23000000-0000-4000-8000-000000000003'), -234::bigint, 'registered payment offsets debtor exactly');
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',101,'23000000-3000-4000-8000-000000000001')$$, 'PT409', 'Idempotency key already used for another settlement', 'same key with altered amount is rejected');
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',235,'23000000-3000-4000-8000-000000000002')$$, 'PT409', 'Balances changed; reload before recording the settlement', 'cannot overpay stale balance');

reset role;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',234,'23000000-3000-4000-8000-000000000002')$$, 'manager may register payment by another participant');
select lives_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000005','23000000-0000-4000-8000-000000000001',333,'23000000-3000-4000-8000-000000000003')$$, 'manager can reconcile historic revoked participant');
select is((select count(*) from public.get_expense_settlement_balances('23000000-2000-4000-8000-000000000001') where balance_cents <> 0), 0::bigint, 'every balance clears after settlements');
select is((select sum(amount_cents) from public.expense_settlements), 667::numeric, 'recording transfers does not double count expense amount');
select throws_ok($$select public.delete_expense_with_lock('23000000-2000-4000-8000-000000000001',(select id from public.expenses where description = 'Cent split'),999)$$, 'PT409', 'Stale expense version', 'atomic deletion rejects stale versions');
select lives_ok($$select public.delete_expense_with_lock('23000000-2000-4000-8000-000000000001',(select id from public.expenses where description = 'Cent split'),(select version from public.expenses where description = 'Cent split'))$$, 'manager can delete an expense with the current version');
select is((select count(*) from public.expense_settlements), 3::bigint, 'deleting an expense preserves the manual payment ledger');

reset role;
update public.expense_collections set archived_at = now() where id = '23000000-2000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.record_expense_settlement('23000000-2000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000001',1,'23000000-3000-4000-8000-000000000004')$$, '42501', 'Collection is archived', 'archived collection rejects new payments');

select * from finish();
rollback;
