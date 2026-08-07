begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
	('70000000-0000-4000-8000-000000000001', 'authenticated', 'modules-owner@example.test', '{"name":"Owner"}', now(), now()),
	('70000000-0000-4000-8000-000000000002', 'authenticated', 'modules-admin@example.test', '{"name":"Admin"}', now(), now()),
	('70000000-0000-4000-8000-000000000003', 'authenticated', 'modules-member@example.test', '{"name":"Member"}', now(), now()),
	('70000000-0000-4000-8000-000000000004', 'authenticated', 'modules-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
	('70000000-1000-4000-8000-000000000001', 'Modules family', '70000000-0000-4000-8000-000000000001'),
	('70000000-1000-4000-8000-000000000002', 'Other modules family', '70000000-0000-4000-8000-000000000004');

insert into public.family_members (family_id, user_id, role)
values
	('70000000-1000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'owner'),
	('70000000-1000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'admin'),
	('70000000-1000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', 'member'),
	('70000000-1000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', 'owner');

insert into public.family_modules (family_id, module_name, enabled, enabled_by, enabled_at)
values
	('70000000-1000-4000-8000-000000000001', 'notes', false, null, null),
	('70000000-1000-4000-8000-000000000001', 'calendar', true, '70000000-0000-4000-8000-000000000001', now()),
	('70000000-1000-4000-8000-000000000001', 'games', true, '70000000-0000-4000-8000-000000000001', now()),
	('70000000-1000-4000-8000-000000000002', 'notes', true, '70000000-0000-4000-8000-000000000004', now());

select has_table('public', 'family_modules', 'family module preference table exists');
select col_not_null('public', 'family_modules', 'family_id', 'every preference belongs to a family');
select col_not_null('public', 'family_modules', 'enabled', 'preference state is explicit');
select has_function(
	'public',
	'set_family_module_preference',
	array['uuid', 'text', 'boolean'],
	'preference mutation RPC exists'
);
select throws_ok(
	$$insert into public.family_modules (family_id, module_name, enabled) values ('70000000-1000-4000-8000-000000000001', 'events', true)$$,
	'23514',
	null,
	'legacy events module name is rejected after catalog migration'
);

select set_config(
	'request.jwt.claims',
	'{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
	true
);
set local role authenticated;

select is((select count(*)::integer from public.family_modules), 3, 'owner sees only preferences from their family');
select lives_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000001', 'notes', true)$$,
	'owner can enable an available module'
);
select is(
	(select enabled from public.family_modules where family_id = '70000000-1000-4000-8000-000000000001' and module_name = 'notes'),
	true,
	'owner preference is persisted'
);
select throws_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000001', 'wishlist', false)$$,
	'22023',
	'Only available modules have a family preference',
	'core Wishlist cannot be disabled through the preference API'
);
select throws_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000001', 'games', true)$$,
	'22023',
	'Only available modules have a family preference',
	'globally disabled Games cannot be enabled through the preference API'
);
select throws_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000002', 'notes', false)$$,
	'42501',
	'Owner or admin role required',
	'owner cannot mutate another family preference'
);
select throws_ok(
	$$insert into public.family_modules (family_id, module_name, enabled) values ('70000000-1000-4000-8000-000000000001', 'wishlist', false)$$,
	'42501',
	'new row violates row-level security policy for table "family_modules"',
	'RLS also blocks direct writes for core modules'
);

reset role;
select set_config(
	'request.jwt.claims',
	'{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
	true
);
set local role authenticated;

select lives_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000001', 'calendar', false)$$,
	'admin can disable an available module'
);
select is(
	(select enabled from public.family_modules where family_id = '70000000-1000-4000-8000-000000000001' and module_name = 'calendar'),
	false,
	'admin preference is persisted'
);

reset role;
select set_config(
	'request.jwt.claims',
	'{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
	true
);
set local role authenticated;

select is((select count(*)::integer from public.family_modules), 3, 'member can read family preferences');
select throws_ok(
	$$select public.set_family_module_preference('70000000-1000-4000-8000-000000000001', 'notes', false)$$,
	'42501',
	'Owner or admin role required',
	'member cannot change a family preference'
);

reset role;
select set_config(
	'request.jwt.claims',
	'{"sub":"70000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
	true
);
set local role authenticated;

select is((select count(*)::integer from public.family_modules), 1, 'member of another family sees only its own preference rows');
select is(
	(select count(*)::integer from public.family_modules where family_id = '70000000-1000-4000-8000-000000000001'),
	0,
	'preferences never leak across families'
);

reset role;
select * from finish();
rollback;
