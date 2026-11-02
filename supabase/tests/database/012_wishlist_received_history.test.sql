begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('12000000-0000-4000-8000-000000000001', 'authenticated', 'received-owner@example.test', '{"name":"Destinataria"}', now(), now()),
  ('12000000-0000-4000-8000-000000000002', 'authenticated', 'received-buyer@example.test', '{"name":"Comprador"}', now(), now()),
  ('12000000-0000-4000-8000-000000000003', 'authenticated', 'received-outsider@example.test', '{"name":"Externo"}', now(), now());

insert into public.families (id, name, created_by)
values ('12000000-1000-4000-8000-000000000001', 'Received gifts', '12000000-0000-4000-8000-000000000001');
insert into public.family_members (family_id, user_id, role)
values
  ('12000000-1000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'owner'),
  ('12000000-1000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 'member');
insert into public.gift_items (id, family_id, owner_id, name)
values
  ('12000000-2000-4000-8000-000000000001', '12000000-1000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Regalo recibido'),
  ('12000000-2000-4000-8000-000000000002', '12000000-1000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Regalo activo');
insert into public.gift_purchases (item_id, purchased_by, quantity_purchased)
values ('12000000-2000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002', 1);
update public.gift_items set image_url = '12000000-1000-4000-8000-000000000001/12000000-0000-4000-8000-000000000001/received.webp'
where id = '12000000-2000-4000-8000-000000000001';
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('gift-images', '12000000-1000-4000-8000-000000000001/12000000-0000-4000-8000-000000000001/received.webp', '12000000-0000-4000-8000-000000000001', '{"size":100}');

select ok(not has_function_privilege('anon', 'public.mark_gift_item_received(uuid,bigint)', 'execute'), 'anonymous callers cannot receive gifts');
select ok(not has_function_privilege('anon', 'public.reveal_received_gift_buyers(uuid)', 'execute'), 'anonymous callers cannot reveal buyers');

select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from public.gift_purchases), 0, 'owner cannot read purchases before receipt');
select throws_ok($$select * from public.reveal_received_gift_buyers('12000000-2000-4000-8000-000000000001')$$, '23514', null, 'owner cannot reveal an active gift');
select throws_ok($$select public.mark_gift_item_received('12000000-2000-4000-8000-000000000001', 999)$$, 'PT409', null, 'stale receipt cannot overwrite a changed gift');
select is(public.mark_gift_item_received('12000000-2000-4000-8000-000000000001', 2), 3::bigint, 'owner marks gift received and advances version');
select is((select count(*)::integer from public.gift_items where id = '12000000-2000-4000-8000-000000000001' and status <> 'fulfilled'), 0, 'received gift leaves ordinary owner list');
select is((select count(*)::integer from public.gift_items where status = 'fulfilled'), 1, 'owner can load received history');
select is((select count(*)::integer from public.gift_purchases), 0, 'history does not automatically expose purchases');
select is((select buyer_id from public.reveal_received_gift_buyers('12000000-2000-4000-8000-000000000001')), '12000000-0000-4000-8000-000000000002'::uuid, 'explicit reveal returns the actual buyer');
select is((select quantity::integer from public.reveal_received_gift_buyers('12000000-2000-4000-8000-000000000001')), 1, 'explicit reveal preserves purchased quantity');
select is((select count(*)::integer from public.gift_purchases), 0, 'revealing does not weaken ordinary purchase RLS');
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 1, 'owner retains private historical image access');

reset role;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from public.gift_items where id = '12000000-2000-4000-8000-000000000001'), 0, 'received gift is hidden from other family members');
select is((select count(*)::integer from public.gift_purchases), 0, 'other members cannot load received purchase history');
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 0, 'other members cannot sign received gift images');
select throws_ok($$select public.mark_gift_item_received('12000000-2000-4000-8000-000000000001', 2)$$, '42501', null, 'buyer cannot receive someone else gift');
select throws_ok($$select * from public.reveal_received_gift_buyers('12000000-2000-4000-8000-000000000001')$$, '42501', null, 'buyer cannot reveal owner history');
select throws_ok($$select public.release_gift_item('12000000-2000-4000-8000-000000000001', 'purchased')$$, '23514', null, 'receipt preserves historical buyer against release');
select throws_ok($$select public.purchase_gift_item('12000000-2000-4000-8000-000000000001', 1::smallint)$$, '23514', null, 'received gifts cannot gain purchases');

reset role;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*)::integer from public.gift_items), 0, 'outsider cannot read received gifts');
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 0, 'outsider cannot sign received gift images');
select throws_ok($$select public.mark_gift_item_received('12000000-2000-4000-8000-000000000001', 2)$$, '42501', null, 'outsider cannot receive gifts');
select throws_ok($$select * from public.reveal_received_gift_buyers('12000000-2000-4000-8000-000000000001')$$, '42501', null, 'outsider cannot reveal buyers');
select throws_ok($$select public.reserve_gift_item('12000000-2000-4000-8000-000000000001', 1::smallint, 'considering')$$, '42501', 'Cannot coordinate this gift item', 'received reservation gives outsider only authorization failure');
select throws_ok($$select public.reserve_gift_item('12000000-2000-4000-8000-000000000002', 1::smallint, 'considering')$$, '42501', 'Cannot coordinate this gift item', 'active reservation gives outsider identical authorization failure');
select throws_ok($$select public.reserve_gift_item('12000000-2000-4000-8000-000000000003', 1::smallint, 'considering')$$, '42501', 'Cannot coordinate this gift item', 'missing reservation gives outsider identical authorization failure');
select throws_ok($$select public.purchase_gift_item('12000000-2000-4000-8000-000000000001', 1::smallint)$$, '42501', 'Cannot coordinate this gift item', 'received purchase gives outsider only authorization failure');
select throws_ok($$select public.purchase_gift_item('12000000-2000-4000-8000-000000000002', 1::smallint)$$, '42501', 'Cannot coordinate this gift item', 'active purchase gives outsider identical authorization failure');
select throws_ok($$select public.purchase_gift_item('12000000-2000-4000-8000-000000000003', 1::smallint)$$, '42501', 'Cannot coordinate this gift item', 'missing purchase gives outsider identical authorization failure');

reset role;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.mark_gift_item_received('12000000-2000-4000-8000-000000000001', 3)$$, '23514', null, 'received transition cannot be applied twice');

select * from finish();
rollback;
