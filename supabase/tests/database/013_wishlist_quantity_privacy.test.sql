begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('13000000-0000-4000-8000-000000000001', 'authenticated', 'quantity-owner@example.test', '{"name":"Destinataria"}', now(), now()),
  ('13000000-0000-4000-8000-000000000002', 'authenticated', 'quantity-buyer@example.test', '{"name":"Comprador"}', now(), now());
insert into public.families (id, name, created_by)
values ('13000000-1000-4000-8000-000000000001', 'Private quantities', '13000000-0000-4000-8000-000000000001');
insert into public.family_members (family_id, user_id, role)
values
  ('13000000-1000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'owner'),
  ('13000000-1000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'member');
insert into public.gift_items (id, family_id, owner_id, name, desired_quantity)
values
  ('13000000-2000-4000-8000-000000000001', '13000000-1000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Sin coordinación', 3),
  ('13000000-2000-4000-8000-000000000002', '13000000-1000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'Con coordinación', 3);
insert into public.gift_purchases (item_id, purchased_by, quantity_purchased)
values ('13000000-2000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', 2);

select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$update public.gift_items set desired_quantity = 1 where id = '13000000-2000-4000-8000-000000000001'$$, 'owner reduction succeeds without coordination');
select lives_ok($$update public.gift_items set desired_quantity = 1 where id = '13000000-2000-4000-8000-000000000002'$$, 'same owner reduction succeeds with hidden purchases');
select is((select count(*)::integer from public.gift_items where desired_quantity = 1 and version = 2), 2, 'both edits return identical public quantity and version');
select is((select count(*)::integer from public.gift_purchases), 0, 'reduction does not reveal purchases');

reset role;
select set_config('request.jwt.claims', '{"sub":"13000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select quantity_purchased::integer from public.gift_purchases where item_id = '13000000-2000-4000-8000-000000000002'), 2, 'existing purchase is preserved despite smaller target');
select throws_ok($$select public.purchase_gift_item('13000000-2000-4000-8000-000000000002', 3::smallint)$$, '23514', null, 'additional allocation cannot exceed the reduced target');
select * from finish();
rollback;
