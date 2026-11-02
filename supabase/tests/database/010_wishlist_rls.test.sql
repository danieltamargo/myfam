begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'wishlist-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'wishlist-bob@example.test', '{"name":"Bob"}', now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'wishlist-carol@example.test', '{"name":"Carol"}', now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'wishlist-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('10000000-1000-4000-8000-000000000001', 'Wishlist family', '10000000-0000-4000-8000-000000000001'),
  ('10000000-1000-4000-8000-000000000002', 'Other family', '10000000-0000-4000-8000-000000000004');

insert into public.family_members (family_id, user_id, role)
values
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member'),
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'member'),
  ('10000000-1000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'owner');

insert into public.gift_items (
  id,
  family_id,
  owner_id,
  name,
  price,
  desired_quantity,
  currency
)
values (
  '10000000-2000-4000-8000-000000000001',
  '10000000-1000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Regalo secreto',
  25.50,
  4,
  'EUR'
);

insert into public.gift_reservations (id, item_id, reserved_by, status, quantity)
values (
  '10000000-3000-4000-8000-000000000001',
  '10000000-2000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'reserved',
  1
);

insert into public.gift_purchases (id, item_id, purchased_by, quantity_purchased)
values (
  '10000000-4000-4000-8000-000000000001',
  '10000000-2000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  1
);

insert into public.gift_item_comments (id, item_id, author_id, content)
values (
  '10000000-5000-4000-8000-000000000001',
  '10000000-2000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'Coordinación secreta'
);

insert into public.gift_comment_mentions (id, comment_id, mentioned_user_id)
values (
  '10000000-6000-4000-8000-000000000001',
  '10000000-5000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'gift-images',
  '10000000-1000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/secret.webp',
  '10000000-0000-4000-8000-000000000002', '{"size":100}'
);

select has_column('public', 'gift_items', 'desired_quantity', 'gift items have desired quantity');
select has_column('public', 'gift_items', 'currency', 'gift items have currency');
select has_column('public', 'gift_items', 'status', 'gift items have lifecycle status');
select has_column('public', 'gift_items', 'version', 'gift items have optimistic version');
select col_type_is('public', 'gift_items', 'desired_quantity', 'smallint', 'desired quantity uses smallint');
select col_default_is('public', 'gift_items', 'currency', 'EUR', 'currency defaults to EUR');
select has_function('public', 'reserve_gift_item', array['uuid', 'smallint', 'text'], 'reservation RPC exists');
select has_function('public', 'purchase_gift_item', array['uuid', 'smallint'], 'purchase RPC exists');
select has_function('public', 'release_gift_item', array['uuid', 'text'], 'release RPC exists');
select ok(not has_table_privilege('authenticated', 'public.gift_reservations', 'insert'), 'reservations cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.gift_purchases', 'insert'), 'purchases cannot be inserted directly');
select ok(not has_function_privilege('authenticated', 'public.get_item_purchased_quantity(uuid)', 'execute'), 'legacy purchase aggregate is private');
select is((select public from storage.buckets where id = 'gift-images'), false, 'gift image bucket is private');

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.gift_items), 1, 'item owner sees the wishlist item');
select is((select count(*)::integer from public.gift_reservations), 0, 'item owner cannot see reservations');
select is((select count(*)::integer from public.gift_purchases), 0, 'item owner cannot see purchases');
select is((select count(*)::integer from public.gift_item_comments), 0, 'item owner cannot see coordination comments');
select is((select count(*)::integer from public.gift_comment_mentions), 0, 'item owner cannot see coordination mentions');
select throws_ok(
  $$select public.reserve_gift_item('10000000-2000-4000-8000-000000000001', 1::smallint, 'reserved')$$,
  '42501'
);
select lives_ok(
  $$update public.gift_items set desired_quantity = 1 where id = '10000000-2000-4000-8000-000000000001'$$,
  'owner can reduce desired quantity independently of hidden coordination'
);
update public.gift_items set desired_quantity = 4 where id = '10000000-2000-4000-8000-000000000001';
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 1, 'item owner can read family image objects');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('gift-images', '10000000-1000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/owner.webp', '10000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'direct upload cannot bypass antivirus'
);
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata) values ('gift-images', '10000000-1000-4000-8000-000000000001/10000000-0000-4000-8000-000000000001/owner.webp', '10000000-0000-4000-8000-000000000001', '{"size":100}');
set local role authenticated;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('gift-images', '10000000-1000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002/forged.webp', '10000000-0000-4000-8000-000000000001')$$,
  '42501'
);
select throws_ok(
  $$insert into public.gift_items (family_id, owner_id, name, price) values ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Precio inválido', -1)$$,
  '23514'
);
select throws_ok(
  $$insert into public.gift_items (family_id, owner_id, name, currency) values ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Moneda inválida', 'eu')$$,
  '23514'
);
select throws_ok(
  $$insert into public.gift_items (family_id, owner_id, name, image_url) values ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'URL inválida', 'https://evil.example/image.webp')$$,
  '23514'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.gift_reservations), 1, 'coordinator sees reservations');
select is((select count(*)::integer from public.gift_purchases), 1, 'coordinator sees purchases');
select is((select count(*)::integer from public.gift_item_comments), 1, 'coordinator sees comments');
select is((select count(*)::integer from public.gift_comment_mentions), 1, 'coordinator sees mentions');
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 2, 'coordinator can read family image objects');
select lives_ok(
  $$select public.reserve_gift_item('10000000-2000-4000-8000-000000000001', 2::smallint, 'considering')$$,
  'coordinator can update a reservation through the RPC'
);
select ok(
  not has_column_privilege('authenticated', 'public.gift_items', 'version', 'update'),
  'clients cannot rewrite optimistic versions'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is((select count(*)::integer from public.gift_items), 0, 'member of another family cannot see item');
select is((select count(*)::integer from public.gift_reservations), 0, 'member of another family cannot see reservations');
select is((select count(*)::integer from public.gift_purchases), 0, 'member of another family cannot see purchases');
select is((select count(*)::integer from public.gift_item_comments), 0, 'member of another family cannot see comments');
select is((select count(*)::integer from storage.objects where bucket_id = 'gift-images'), 0, 'member of another family cannot read image objects');
select throws_ok(
  $$select public.purchase_gift_item('10000000-2000-4000-8000-000000000001', 1::smallint)$$,
  '42501'
);

select * from finish();

rollback;
