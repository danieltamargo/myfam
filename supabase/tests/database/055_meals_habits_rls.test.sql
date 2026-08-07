begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('55000000-0000-4000-8000-000000000001', 'authenticated', 'meals-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('55000000-0000-4000-8000-000000000002', 'authenticated', 'meals-admin@example.test', '{"name":"Admin"}', now(), now()),
  ('55000000-0000-4000-8000-000000000003', 'authenticated', 'meals-member@example.test', '{"name":"Member"}', now(), now()),
  ('55000000-0000-4000-8000-000000000004', 'authenticated', 'meals-selected@example.test', '{"name":"Selected"}', now(), now()),
  ('55000000-0000-4000-8000-000000000005', 'authenticated', 'meals-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('55000000-1000-4000-8000-000000000001', 'Meals family', '55000000-0000-4000-8000-000000000001'),
  ('55000000-1000-4000-8000-000000000002', 'Other family', '55000000-0000-4000-8000-000000000005');

insert into public.family_members (family_id, user_id, role)
values
  ('55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'owner'),
  ('55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000002', 'admin'),
  ('55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000003', 'member'),
  ('55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000004', 'member'),
  ('55000000-1000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', 'owner');

insert into public.family_recipes (id, family_id, created_by, title, servings)
values
  ('55000000-2000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'Sopa familiar', 4),
  ('55000000-2000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', 'Receta externa', 2);

insert into public.recipe_ingredients (recipe_id, family_id, name, quantity, unit, sort_order)
values
  ('55000000-2000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', 'Patatas', 2, 'kg', 1000),
  ('55000000-2000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', 'Sal', null, null, 2000),
  ('55000000-2000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000002', 'Secreto externo', 1, null, 1000);

insert into public.meal_plan_entries (id, family_id, recipe_id, created_by, planned_on, meal_type)
values
  ('55000000-3000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', '55000000-2000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', current_date, 'lunch'),
  ('55000000-3000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000002', '55000000-2000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', current_date, 'dinner');

insert into public.family_lists (id, family_id, created_by, title, visibility)
values
  ('55000000-4000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'Compra familiar', 'family'),
  ('55000000-4000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', 'Compra externa', 'family');

insert into public.family_list_members (list_id, family_id, user_id, role, added_by)
values
  ('55000000-4000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'owner', '55000000-0000-4000-8000-000000000001'),
  ('55000000-4000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', 'owner', '55000000-0000-4000-8000-000000000005');

insert into public.family_habits (id, family_id, created_by, title, visibility, start_on)
values
  ('55000000-5000-4000-8000-000000000001', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'Hábito privado', 'private', current_date - 7),
  ('55000000-5000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'Hábito compartido', 'selected_members', current_date - 7),
  ('55000000-5000-4000-8000-000000000003', '55000000-1000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000005', 'Hábito externo', 'private', current_date - 7);

insert into public.family_habit_members (habit_id, family_id, user_id, added_by)
values ('55000000-5000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000004', '55000000-0000-4000-8000-000000000001');

insert into public.habit_completions (habit_id, family_id, completed_on, completed_by)
values ('55000000-5000-4000-8000-000000000002', '55000000-1000-4000-8000-000000000001', current_date - 1, '55000000-0000-4000-8000-000000000001');

select has_table('public', 'family_recipes', 'family recipes table exists');
select has_table('public', 'recipe_ingredients', 'recipe ingredients table exists');
select has_table('public', 'meal_plan_entries', 'meal plan table exists');
select has_table('public', 'family_habits', 'private habits table exists');
select has_table('public', 'family_habit_members', 'explicit habit readership table exists');
select has_table('public', 'habit_completions', 'daily habit completion table exists');
select has_index('public', 'meal_plan_entries', 'meal_plan_family_date_idx', 'meal plan date lookup is indexed');
select has_index('public', 'family_habit_members', 'family_habit_members_user_idx', 'habit reader lookup is indexed');
select has_function('public', 'create_family_recipe', 'recipe creation RPC exists');
select has_function('public', 'schedule_family_meal', array['uuid', 'uuid', 'date', 'text', 'text'], 'meal schedule RPC exists');
select has_function('public', 'copy_recipe_ingredients_to_list', array['uuid', 'uuid'], 'recipe to list RPC exists');
select has_function('public', 'create_family_habit', 'habit creation RPC exists');
select has_function('public', 'set_family_habit_completion', array['uuid', 'date', 'boolean'], 'habit completion RPC exists');
select ok(not has_table_privilege('authenticated', 'public.family_recipes', 'insert'), 'recipes cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.meal_plan_entries', 'update'), 'meal plan cannot be changed directly');
select ok(not has_table_privilege('authenticated', 'public.family_habits', 'insert'), 'habits cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.habit_completions', 'delete'), 'habit completions cannot be deleted directly');

select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_recipes), 1, 'member sees recipes only in their family');
select is((select count(*)::integer from public.meal_plan_entries), 1, 'member sees only their family meal plan');
select is((select count(*)::integer from public.family_habits), 0, 'unselected member sees no private or selected habits');
select is((select count(*)::integer from public.habit_completions), 0, 'hidden habit completion does not leak');
select lives_ok(
  $$select public.schedule_family_meal(
    '55000000-1000-4000-8000-000000000001',
    '55000000-2000-4000-8000-000000000001',
    current_date + 1,
    'dinner',
    'Preparar antes'
  )$$,
  'family member can schedule a family recipe'
);
select throws_ok(
  $$select public.schedule_family_meal(
    '55000000-1000-4000-8000-000000000001',
    '55000000-2000-4000-8000-000000000001',
    current_date + 367,
    'lunch',
    null
  )$$,
  '22023',
  'Meal date outside allowed range',
  'meal schedule rejects dates beyond its bounded horizon'
);
select is(
  public.copy_recipe_ingredients_to_list('55000000-2000-4000-8000-000000000001', '55000000-4000-4000-8000-000000000001'),
  2,
  'recipe ingredients copy atomically to an editable family list'
);
select is(
  (select count(*)::integer from public.family_list_items where list_id = '55000000-4000-4000-8000-000000000001'),
  2,
  'ingredient copy creates the expected list items'
);
select throws_ok(
  $$insert into public.family_habits (family_id, created_by, title) values ('55000000-1000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000003', 'Directo')$$,
  '42501',
  'permission denied for table family_habits',
  'direct habit insertion is blocked'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_habits), 1, 'selected reader sees the explicitly shared habit');
select is((select count(*)::integer from public.habit_completions), 1, 'selected reader sees shared daily completion');
select throws_ok(
  $$select public.set_family_habit_completion('55000000-5000-4000-8000-000000000002', current_date, true)$$,
  '42501',
  'Habit author permission required',
  'selected reader cannot record completion for the author'
);
select throws_ok(
  $$select public.archive_family_habit('55000000-5000-4000-8000-000000000002')$$,
  '42501',
  'Habit author permission required',
  'selected reader cannot archive the habit'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_habits), 0, 'family admin gets no implicit access to private habits');

reset role;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_habits), 2, 'habit author sees private and shared habits');
select lives_ok(
  $$select public.create_family_recipe(
    '55000000-1000-4000-8000-000000000001',
    'Tortilla',
    'Rápida',
    'Mezclar y cocinar',
    3,
    '[{"name":"Huevos","quantity":4,"unit":null},{"name":"Patata","quantity":1,"unit":"kg"}]'::jsonb
  )$$,
  'recipe and ingredients are created atomically'
);
select is(
  (
    select count(*)::integer
    from public.recipe_ingredients as ingredient
    join public.family_recipes as recipe on recipe.id = ingredient.recipe_id
    where recipe.title = 'Tortilla'
  ),
  2,
  'atomic recipe creation persists every ingredient'
);
select throws_ok(
  $$select public.create_family_recipe(
    '55000000-1000-4000-8000-000000000001', 'Vacía', null, null, 2, null
  )$$,
  '22023',
  'Recipe requires between 1 and 50 ingredients',
  'recipe creation rejects a null ingredient payload cleanly'
);
select lives_ok(
  $$select public.create_family_habit(
    '55000000-1000-4000-8000-000000000001',
    'Compartido nuevo',
    null,
    'selected_members',
    array['55000000-0000-4000-8000-000000000004']::uuid[],
    current_date
  )$$,
  'habit and explicit readership are created atomically'
);
select throws_ok(
  $$select public.create_family_habit(
    '55000000-1000-4000-8000-000000000001',
    'Privado incoherente',
    null,
    'private',
    array['55000000-0000-4000-8000-000000000004']::uuid[],
    current_date
  )$$,
  '22023',
  'Private habits cannot have selected members',
  'private habit rejects an explicit audience'
);
select is(
  public.set_family_habit_completion('55000000-5000-4000-8000-000000000001', current_date, true),
  true,
  'habit author records today once'
);
select is(
  public.set_family_habit_completion('55000000-5000-4000-8000-000000000001', current_date, true),
  true,
  'repeating the same completion is idempotent'
);
select is(
  (select count(*)::integer from public.habit_completions where habit_id = '55000000-5000-4000-8000-000000000001' and completed_on = current_date),
  1,
  'daily completion remains unique'
);
select throws_ok(
  $$select public.set_family_habit_completion('55000000-5000-4000-8000-000000000001', current_date + 1, true)$$,
  '22023',
  'Completion date outside allowed range',
  'future completion is rejected'
);
select throws_ok(
  $$select public.set_family_habit_completion('55000000-5000-4000-8000-000000000001', current_date - 8, true)$$,
  '22023',
  'Completion date outside allowed range',
  'completion before habit start is rejected'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_recipes where family_id = '55000000-1000-4000-8000-000000000001'), 0, 'recipes never cross family boundaries');
select is((select count(*)::integer from public.family_habits where family_id = '55000000-1000-4000-8000-000000000001'), 0, 'habits never cross family boundaries');
select throws_ok(
  $$select public.schedule_family_meal(
    '55000000-1000-4000-8000-000000000001',
    '55000000-2000-4000-8000-000000000001',
    current_date,
    'snack',
    null
  )$$,
  '42501',
  'Family membership required',
  'outsider cannot schedule a meal in another family'
);
select throws_ok(
  $$select public.copy_recipe_ingredients_to_list('55000000-2000-4000-8000-000000000001', '55000000-4000-4000-8000-000000000002')$$,
  '42501',
  'List edit permission required',
  'cross-family copy is denied without exposing recipe details'
);

select * from finish();
rollback;
