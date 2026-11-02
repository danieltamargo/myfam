begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
 ('96000000-0000-4000-8000-000000000001', 'authenticated', 'list-owner@example.test', '{"name":"Owner"}', now(), now()),
 ('96000000-0000-4000-8000-000000000002', 'authenticated', 'list-member@example.test', '{"name":"Member"}', now(), now()),
 ('96000000-0000-4000-8000-000000000003', 'authenticated', 'list-outsider@example.test', '{"name":"Outsider"}', now(), now());
insert into public.families (id, name, created_by) values
 ('96000000-1000-4000-8000-000000000001', 'List tests', '96000000-0000-4000-8000-000000000001'),
 ('96000000-1000-4000-8000-000000000002', 'Other tests', '96000000-0000-4000-8000-000000000003');
insert into public.family_members (family_id, user_id, role) values
 ('96000000-1000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'owner'),
 ('96000000-1000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', 'member'),
 ('96000000-1000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000003', 'owner');
insert into public.family_lists (id, family_id, created_by, title, visibility, list_type, archived_at) values
 ('96000000-2000-4000-8000-000000000001', '96000000-1000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'Personal archive', 'private', 'shopping', now()),
 ('96000000-2000-4000-8000-000000000002', '96000000-1000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000003', 'Other archive', 'family', 'home', now());
insert into public.family_list_items (list_id, created_by, title, quantity, unit, sort_order, completed_at, completed_by) values
 ('96000000-2000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'Café', 2.5, 'kg', 1024, now(), '96000000-0000-4000-8000-000000000001'),
 ('96000000-2000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '  CAFE  ', 1, null, 2048, null, null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"96000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.family_lists), 0::bigint, 'Private and other-family archived history is hidden');
select throws_ok($$select public.create_typed_family_list('96000000-1000-4000-8000-000000000001', 'Rejected', null, 'private', '{}', 'shopping', '96000000-2000-4000-8000-000000000001')$$, '42501', 'Template is not available', 'Forged inaccessible source is rejected');

select set_config('request.jwt.claims', '{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.family_lists), 1::bigint, 'Owner can read archived private history');
select throws_ok($$select public.create_typed_family_list('96000000-1000-4000-8000-000000000001', 'Rejected', null, 'family', '{}', 'shopping', '96000000-2000-4000-8000-000000000001')$$, '42501', 'Restricted templates require a private destination', 'Private template cannot leak into a family copy');
select throws_ok($$select public.create_typed_family_list('96000000-1000-4000-8000-000000000001', 'Rejected', null, 'private', '{}', 'shopping', '96000000-2000-4000-8000-000000000002')$$, '42501', 'Template is not available', 'Other family source is rejected');
select lives_ok($$select public.create_typed_family_list('96000000-1000-4000-8000-000000000001', 'Private copy', null, 'private', '{}', 'shopping', '96000000-2000-4000-8000-000000000001')$$, 'Archived visible source can be copied');
select is((select count(*) from public.family_list_items where list_id = (select id from public.family_lists where title = 'Private copy')), 1::bigint, 'Template deduplicates accents and casing');
select is((select quantity from public.family_list_items where list_id = (select id from public.family_lists where title = 'Private copy')), 2.5::numeric, 'Template preserves quantity');
select is((select unit from public.family_list_items where list_id = (select id from public.family_lists where title = 'Private copy')), 'kg', 'Template preserves unit');
select ok((select completed_at is null and completed_by is null from public.family_list_items where list_id = (select id from public.family_lists where title = 'Private copy')), 'Copy starts pending');
select lives_ok($$select public.set_family_list_type(id, version, 'home') from public.family_lists where title = 'Private copy'$$, 'Editable type can change');
select is((select list_type from public.family_lists where title = 'Private copy'), 'home', 'Changed type persists');
select throws_ok($$select public.set_family_list_type(id, 1, 'other') from public.family_lists where title = 'Private copy'$$, 'PT409', 'List changed', 'Stale version is a non-retried conflict');
select throws_ok($$select public.set_family_list_type(id, version, 'invalid') from public.family_lists where title = 'Private copy'$$, '22023', 'Invalid list type or archived list', 'Invalid type is rejected');
select set_config('request.jwt.claims', '{"sub":"96000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.family_lists), 0::bigint, 'Copied restricted history stays private');
select throws_ok($$select public.set_family_list_type('96000000-2000-4000-8000-000000000001', 1, 'home')$$, '42501', 'List permission denied', 'Private source type cannot be probed');
select throws_ok($$select public.set_family_list_type('96000000-2000-4000-8000-000000000002', 1, 'home')$$, '42501', 'List permission denied', 'Other family type cannot be probed');
select throws_ok($$select public.set_family_list_type('96000000-2000-4000-8000-000000000099', 1, 'home')$$, '42501', 'List permission denied', 'Missing list has the same response as inaccessible lists');
select * from finish();
rollback;
