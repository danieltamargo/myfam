begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
select ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'resource-calendar-' || n || '@example.test', '{"name":"Resource tester"}', now(), now()
from generate_series(1, 5) as n;
insert into public.families(id, name, created_by) values
  ('32000000-1000-4000-8000-000000000001', 'Resource family', '32000000-0000-4000-8000-000000000002'),
  ('32000000-1000-4000-8000-000000000002', 'Other resource family', '32000000-0000-4000-8000-000000000005');
insert into public.family_members(family_id, user_id, role) values
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'member'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'owner'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'member'),
  ('32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'member'),
  ('32000000-1000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000005', 'owner');
insert into public.calendar_events(id, family_id, created_by, title, starts_at, ends_at, timezone, visibility) values
  ('32000000-2000-4000-8000-000000000001', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Owner private event', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', 'UTC', 'selected_members'),
  ('32000000-2000-4000-8000-000000000002', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'Selected event', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', 'UTC', 'selected_members'),
  ('32000000-2000-4000-8000-000000000003', '32000000-1000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000005', 'Other family event', '2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z', 'UTC', 'family');
insert into public.calendar_event_participants(event_id, family_id, user_id, response)
values ('32000000-2000-4000-8000-000000000002', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'accepted');
insert into public.gift_event_categories(id, family_id, name) values
  ('32000000-3000-4000-8000-000000000001', '32000000-1000-4000-8000-000000000001', 'Occasion A'),
  ('32000000-3000-4000-8000-000000000002', '32000000-1000-4000-8000-000000000002', 'Occasion B');
insert into public.expense_collections(id, family_id, created_by, name)
values ('32000000-4000-4000-8000-000000000001', '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Private event expenses');
insert into public.expense_collection_members(collection_id, user_id, role, status, joined_at) values
  ('32000000-4000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('32000000-4000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003', 'manager', 'active', now()),
  ('32000000-4000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'viewer', 'active', now());

create function pg_temp.save_wish(p_id uuid default null, p_version bigint default null, p_name text default 'Original wish',
  p_categories uuid[] default array['32000000-3000-4000-8000-000000000001'::uuid], p_change text default 'keep', p_event uuid default null)
returns uuid language sql as $$
  select public.save_wishlist_item(p_id, '32000000-1000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', p_version,
    p_name, null, '{}'::text[], 10, 'EUR', 0::smallint, 1::smallint, 'active', null, p_categories, p_change, p_event);
$$;

select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select set_config('tests.calendar_wish_id', pg_temp.save_wish(p_change => 'replace', p_event => '32000000-2000-4000-8000-000000000002')::text, true);
select is((select count(*) from public.gift_calendar_event_links), 1::bigint, 'owner can associate a visible same-family event');
select is((select count(*) from public.gift_item_events), 1::bigint, 'generic occasion and real event coexist');
reset role;
insert into public.gift_purchases(item_id, purchased_by, quantity_purchased)
values (current_setting('tests.calendar_wish_id')::uuid, '32000000-0000-4000-8000-000000000003', 1);
set local role authenticated;
select throws_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 1, 'Must roll back', array['32000000-3000-4000-8000-000000000002'::uuid])$$,
  '22023', null, 'foreign category aborts the entire edit');
select is((select name from public.gift_items), 'Original wish', 'invalid category preserves item fields');
select is((select version from public.gift_items), 1::bigint, 'invalid category preserves optimistic version');
select is((select event_category_id from public.gift_item_events), '32000000-3000-4000-8000-000000000001'::uuid, 'invalid category preserves old occasion');
select is((select event_id from public.gift_calendar_event_links), '32000000-2000-4000-8000-000000000002'::uuid, 'invalid category preserves real-event association');
select throws_ok($$select pg_temp.save_wish(p_categories => array['32000000-3000-4000-8000-000000000002'::uuid])$$, '22023', null, 'failed creation does not leave an orphan item');
select is((select count(*) from public.gift_items), 1::bigint, 'failed creation leaves exactly the original item');
select throws_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 999)$$, 'PT409', null, 'stale save returns HTTP conflict without transaction retry');
select throws_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 1, p_change => 'replace', p_event => '32000000-2000-4000-8000-000000000003')$$,
  '42501', null, 'wish cannot link another family event');
select lives_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'replace', '32000000-2000-4000-8000-000000000001')$$, 'collection owner can link own visible event');

reset role;
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.gift_items), 1::bigint, 'family member can still read the shared wish');
select is((select count(*) from public.gift_calendar_event_links), 0::bigint, 'shared wish does not reveal private event UUID');
select is((select count(*) from public.expense_collection_event_links), 0::bigint, 'collection viewer cannot infer a private event association');
select throws_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'clear', null)$$, '42501', null, 'viewer cannot change collection association');

reset role;
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.expense_collection_event_links), 0::bigint, 'family owner gets no private collection access');
select throws_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'clear', null)$$, '42501', null, 'family ownership does not permit private collection changes');
select throws_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 1)$$, '42501', null, 'family owner cannot edit another member wish');

reset role;
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.expense_collection_event_links), 0::bigint, 'collection manager does not see event outside its audience');
select lives_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'keep', null)$$, 'saving keep does not clear an opaque association');
select throws_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'replace', '32000000-2000-4000-8000-000000000001')$$, '42501', null, 'manager cannot explicitly select a private event outside its audience');
select throws_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'replace', '32000000-2000-4000-8000-000000000003')$$, '42501', null, 'manager cannot link a foreign family event');

reset role;
delete from public.calendar_event_participants where event_id = '32000000-2000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.gift_calendar_event_links), 0::bigint, 'wish owner loses event metadata after audience changes');
select lives_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 1, 'Edited without clearing hidden event')$$, 'owner can save unrelated fields while preserving opaque association');
select is((select count(*) from public.gift_purchases), 0::bigint, 'event association does not reveal buyer information');
reset role;
select is((select event_id from public.gift_calendar_event_links), '32000000-2000-4000-8000-000000000002'::uuid, 'opaque wish association remains stored after edit');
select is((select event_id from public.expense_collection_event_links), '32000000-2000-4000-8000-000000000001'::uuid, 'opaque collection association remains stored');

select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select lives_ok($$select public.mark_gift_item_received(current_setting('tests.calendar_wish_id')::uuid, 2)$$, 'owner receives updated wish');
select throws_ok($$select pg_temp.save_wish(current_setting('tests.calendar_wish_id')::uuid, 3)$$, '23514', null, 'received wish cannot be edited through atomic RPC');
select throws_ok($$update public.gift_items set status = 'active' where id = current_setting('tests.calendar_wish_id')::uuid$$, '23514', null, 'direct DML cannot reactivate a received wish');

reset role;
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.gift_calendar_event_links), 0::bigint, 'other family cannot read gift-event associations');
select is((select count(*) from public.expense_collection_event_links), 0::bigint, 'other family cannot read expense-event associations');
select throws_ok($$select public.set_expense_collection_event('32000000-4000-4000-8000-000000000001', 'clear', null)$$, '42501', null, 'other family cannot mutate collection association');

select * from finish();
rollback;
