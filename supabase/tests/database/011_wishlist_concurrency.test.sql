create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(8);

delete from public.families where id = '11000000-1000-4000-8000-000000000001';
delete from auth.users where id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003'
);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'race-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'race-bob@example.test', '{"name":"Bob"}', now(), now()),
  ('11000000-0000-4000-8000-000000000003', 'authenticated', 'race-carol@example.test', '{"name":"Carol"}', now(), now());

insert into public.families (id, name, created_by)
values (
  '11000000-1000-4000-8000-000000000001',
  'Concurrency family',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.family_members (family_id, user_id, role)
values
  ('11000000-1000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'owner'),
  ('11000000-1000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'member'),
  ('11000000-1000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000003', 'member');

insert into public.gift_items (id, family_id, owner_id, name, desired_quantity)
values (
  '11000000-2000-4000-8000-000000000001',
  '11000000-1000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Única unidad',
  1
);

select extensions.dblink_connect(
  'wishlist_bob',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'wishlist_carol',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_exec(
  'wishlist_bob',
  $$set request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}'$$
);
select extensions.dblink_exec(
  'wishlist_carol',
  $$set request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}'$$
);
select extensions.dblink_exec('wishlist_bob', 'set role authenticated');
select extensions.dblink_exec('wishlist_carol', 'set role authenticated');
select extensions.dblink_exec('wishlist_bob', 'begin');

select lives_ok(
  $$select * from extensions.dblink(
    'wishlist_bob',
    'select public.reserve_gift_item(''11000000-2000-4000-8000-000000000001'', 1::smallint, ''reserved'')'
  ) as result(id uuid)$$,
  'first reservation succeeds while holding the item lock'
);

select ok(
  extensions.dblink_send_query(
    'wishlist_carol',
    'select public.reserve_gift_item(''11000000-2000-4000-8000-000000000001'', 1::smallint, ''reserved'')'
  ) = 1,
  'competing reservation is dispatched'
);
select pg_sleep(0.1);
select is(extensions.dblink_is_busy('wishlist_carol'), 1, 'competing reservation waits on the item lock');
select extensions.dblink_exec('wishlist_bob', 'commit');

select throws_like(
  $$select * from extensions.dblink_get_result('wishlist_carol') as result(id uuid)$$,
  '%Requested quantity exceeds remaining quantity%',
  'competing request rechecks capacity after acquiring the lock'
);

select is(
  (
    select coalesce(sum(quantity), 0)::integer
    from public.gift_reservations
    where item_id = '11000000-2000-4000-8000-000000000001'
  ),
  1,
  'concurrent reservations never exceed desired quantity'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  false
);
set role authenticated;

select lives_ok(
  $$select public.purchase_gift_item('11000000-2000-4000-8000-000000000001', 1::smallint)$$,
  'purchase atomically converts the caller reservation'
);
select lives_ok(
  $$select public.release_gift_item('11000000-2000-4000-8000-000000000001', 'purchased')$$,
  'release removes the caller purchase'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.gift_reservations
    where item_id = '11000000-2000-4000-8000-000000000001'
  ) + (
    select count(*)::integer
    from public.gift_purchases
    where item_id = '11000000-2000-4000-8000-000000000001'
  ),
  0,
  'release leaves no coordination record for the caller'
);

select extensions.dblink_disconnect('wishlist_bob');
select extensions.dblink_disconnect('wishlist_carol');

select * from finish();

delete from public.families where id = '11000000-1000-4000-8000-000000000001';
delete from auth.users where id in (
  '11000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000003'
);
