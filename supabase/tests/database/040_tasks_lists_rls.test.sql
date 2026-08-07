begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000001', 'authenticated', 'tasks-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('40000000-0000-4000-8000-000000000002', 'authenticated', 'tasks-admin@example.test', '{"name":"Admin"}', now(), now()),
  ('40000000-0000-4000-8000-000000000003', 'authenticated', 'tasks-member@example.test', '{"name":"Member"}', now(), now()),
  ('40000000-0000-4000-8000-000000000004', 'authenticated', 'tasks-selected@example.test', '{"name":"Selected"}', now(), now()),
  ('40000000-0000-4000-8000-000000000005', 'authenticated', 'tasks-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('40000000-1000-4000-8000-000000000001', 'Tasks family', '40000000-0000-4000-8000-000000000001'),
  ('40000000-1000-4000-8000-000000000002', 'Other family', '40000000-0000-4000-8000-000000000005');

insert into public.family_members (family_id, user_id, role)
values
  ('40000000-1000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'owner'),
  ('40000000-1000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'admin'),
  ('40000000-1000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'member'),
  ('40000000-1000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'member'),
  ('40000000-1000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', 'owner');

insert into public.task_groups (id, family_id, created_by, name)
values (
  '40000000-2000-4000-8000-000000000001',
  '40000000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Casa'
);

insert into public.family_tasks (
  id, family_id, group_id, created_by, title, due_on, priority,
  recurrence_frequency, recurrence_interval, recurrence_until
)
values
  (
    '40000000-3000-4000-8000-000000000001',
    '40000000-1000-4000-8000-000000000001',
    '40000000-2000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Cierre de mes',
    '2026-01-31',
    'high',
    'monthly',
    1,
    '2026-03-31'
  ),
  (
    '40000000-3000-4000-8000-000000000002',
    '40000000-1000-4000-8000-000000000002',
    null,
    '40000000-0000-4000-8000-000000000005',
    'Tarea de otra familia',
    null,
    'normal',
    'none',
    1,
    null
  );

insert into public.task_assignees (task_id, family_id, user_id, assigned_by)
values (
  '40000000-3000-4000-8000-000000000001',
  '40000000-1000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000001'
);

insert into public.family_lists (id, family_id, created_by, title, visibility)
values
  (
    '40000000-4000-4000-8000-000000000001',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Compra familiar',
    'family'
  ),
  (
    '40000000-4000-4000-8000-000000000002',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Lista seleccionada',
    'selected_members'
  ),
  (
    '40000000-4000-4000-8000-000000000003',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Lista privada',
    'private'
  ),
  (
    '40000000-4000-4000-8000-000000000004',
    '40000000-1000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000005',
    'Lista de otra familia',
    'family'
  );

insert into public.family_list_members (list_id, family_id, user_id, role, added_by)
values
  (
    '40000000-4000-4000-8000-000000000001',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'owner',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-4000-4000-8000-000000000002',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'owner',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-4000-4000-8000-000000000002',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004',
    'editor',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-4000-4000-8000-000000000003',
    '40000000-1000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'owner',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-4000-4000-8000-000000000004',
    '40000000-1000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000005',
    'owner',
    '40000000-0000-4000-8000-000000000005'
  );

insert into public.family_list_items (
  id, list_id, created_by, title, quantity, unit, sort_order
)
values
  (
    '40000000-5000-4000-8000-000000000001',
    '40000000-4000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'Leche',
    2,
    'litros',
    1024
  ),
  (
    '40000000-5000-4000-8000-000000000002',
    '40000000-4000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    'Regalo',
    1,
    null,
    1024
  ),
  (
    '40000000-5000-4000-8000-000000000003',
    '40000000-4000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000001',
    'Secreto',
    1,
    null,
    1024
  );

select has_table('public', 'task_groups', 'task groups table exists');
select has_table('public', 'family_tasks', 'family tasks table exists');
select has_table('public', 'task_assignees', 'task assignees table exists');
select has_table('public', 'task_mentions', 'task mentions table exists');
select has_table('public', 'task_completions', 'task completion history table exists');
select has_table('public', 'family_lists', 'family lists table exists');
select has_table('public', 'family_list_members', 'explicit list membership table exists');
select has_table('public', 'family_list_items', 'family list items table exists');
select has_function('public', 'create_family_task', 'task creation RPC exists');
select has_function('public', 'update_family_task', 'task update RPC exists');
select has_function('public', 'set_family_task_status', array['uuid', 'bigint', 'text'], 'task status RPC exists');
select has_function('public', 'process_task_due_notifications', array['date', 'integer'], 'task due processor exists');
select has_function('public', 'create_family_list', 'list creation RPC exists');
select has_function('public', 'add_family_list_item', 'list item creation RPC exists');
select has_function('public', 'set_family_list_item_completed', array['uuid', 'bigint', 'boolean'], 'list completion RPC exists');
select ok(not has_table_privilege('authenticated', 'public.family_tasks', 'insert'), 'tasks cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.family_list_items', 'update'), 'list items cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert'), 'clients cannot insert task notifications directly');

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_tasks), 1, 'member sees tasks only in their family');
select is((select count(*)::integer from public.family_lists), 1, 'unselected member sees only the family list');
select is((select count(*)::integer from public.family_list_items), 1, 'items from hidden lists stay hidden');
select throws_ok(
  $$insert into public.family_tasks (family_id, created_by, title) values ('40000000-1000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003', 'Directa')$$,
  '42501',
  'permission denied for table family_tasks',
  'direct task insertion is blocked'
);
select is(
  public.set_family_task_status('40000000-3000-4000-8000-000000000001', 1, 'completed')::integer,
  2,
  'assignee completes the first recurring occurrence'
);
select is(
  (select due_on::text from public.family_tasks where id = '40000000-3000-4000-8000-000000000001'),
  '2026-02-28',
  'monthly task recurrence preserves month-end in February'
);
select is(
  public.set_family_task_status('40000000-3000-4000-8000-000000000001', 2, 'completed')::integer,
  3,
  'assignee completes the second recurring occurrence'
);
select is(
  (select due_on::text from public.family_tasks where id = '40000000-3000-4000-8000-000000000001'),
  '2026-03-31',
  'monthly task recurrence preserves month-end in March'
);
select is(
  (select count(*)::integer from public.task_completions where task_id = '40000000-3000-4000-8000-000000000001'),
  2,
  'recurring task keeps a completion history'
);
select throws_ok(
  $$select public.set_family_task_status('40000000-3000-4000-8000-000000000001', 2, 'completed')$$,
  '40001',
  'Family task changed concurrently',
  'stale task status mutation is rejected'
);
select throws_ok(
  $$select public.update_family_task(
    p_task_id => '40000000-3000-4000-8000-000000000001',
    p_version => 3,
    p_group_id => '40000000-2000-4000-8000-000000000001',
    p_title => 'Cambio indebido',
    p_description => null,
    p_due_on => '2026-03-31',
    p_priority => 'high',
    p_assignee_ids => array['40000000-0000-4000-8000-000000000003']::uuid[],
    p_mention_ids => array[]::uuid[],
    p_recurrence_frequency => 'monthly',
    p_recurrence_interval => 1,
    p_recurrence_until => '2026-03-31'
  )$$,
  '42501',
  'Family task permission denied',
  'assignee cannot rewrite task metadata or assignments'
);
select is(
  public.set_family_list_item_completed('40000000-5000-4000-8000-000000000001', 1, true)::integer,
  2,
  'family list item completion increments its optimistic version'
);
select is(
  (select completed_by from public.family_list_items where id = '40000000-5000-4000-8000-000000000001'),
  '40000000-0000-4000-8000-000000000003'::uuid,
  'list item records who completed it'
);
select throws_ok(
  $$select public.set_family_list_item_completed('40000000-5000-4000-8000-000000000001', 1, false)$$,
  '40001',
  'Family list item changed concurrently',
  'stale optimistic list mutation is rejected'
);
select throws_ok(
  $$select public.add_family_list_item('40000000-4000-4000-8000-000000000003', 'Sin acceso', 1, null)$$,
  '42501',
  'Family list permission denied',
  'member cannot mutate a private list'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.create_family_task(
    p_family_id => '40000000-1000-4000-8000-000000000001',
    p_group_id => '40000000-2000-4000-8000-000000000001',
    p_title => 'Preparar la merienda',
    p_description => 'Traer fruta',
    p_due_on => '2026-08-20',
    p_priority => 'normal',
    p_assignee_ids => array['40000000-0000-4000-8000-000000000003']::uuid[],
    p_mention_ids => array['40000000-0000-4000-8000-000000000004']::uuid[]
  )$$,
  'task creation atomically assigns, mentions and notifies family members'
);
select throws_ok(
  $$select public.create_family_task(
    p_family_id => '40000000-1000-4000-8000-000000000001',
    p_group_id => null,
    p_title => 'Usuario externo',
    p_description => null,
    p_due_on => null,
    p_priority => 'normal',
    p_assignee_ids => array['40000000-0000-4000-8000-000000000005']::uuid[],
    p_mention_ids => array[]::uuid[]
  )$$,
  '23503',
  'Every selected user must belong to the family',
  'task assignment rejects users from another family'
);
select lives_ok(
  $$select public.create_family_list(
    '40000000-1000-4000-8000-000000000001',
    'Escapada privada',
    null,
    'selected_members',
    array['40000000-0000-4000-8000-000000000004']::uuid[]
  )$$,
  'selected list and explicit membership are created atomically'
);
select throws_ok(
  $$select public.create_family_list(
    '40000000-1000-4000-8000-000000000001',
    'Con externo',
    null,
    'selected_members',
    array['40000000-0000-4000-8000-000000000005']::uuid[]
  )$$,
  '23503',
  'Every selected user must belong to the family',
  'selected list rejects users from another family'
);

reset role;
select is(
  (select count(*)::integer from public.notifications where user_id = '40000000-0000-4000-8000-000000000003' and type = 'task_assigned'),
  1,
  'assignment creates one trusted notification'
);
select is(
  (select count(*)::integer from public.notifications where user_id = '40000000-0000-4000-8000-000000000004' and type = 'task_mention'),
  1,
  'mention creates one trusted notification'
);
select matches(
  (
    select link from public.notifications
    where user_id = '40000000-0000-4000-8000-000000000003' and type = 'task_assigned'
    limit 1
  ),
  '^/family/40000000-1000-4000-8000-000000000001/tasks\?task=[0-9a-f-]{36}$',
  'assignment notification contains only a safe internal deep link'
);

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_lists), 1, 'family admin gets no implicit access to private or selected lists');
select lives_ok(
  $$select public.update_family_task(
    p_task_id => '40000000-3000-4000-8000-000000000001',
    p_version => 3,
    p_group_id => '40000000-2000-4000-8000-000000000001',
    p_title => 'Cierre de mes actualizado',
    p_description => null,
    p_due_on => '2026-03-31',
    p_priority => 'urgent',
    p_assignee_ids => array['40000000-0000-4000-8000-000000000003']::uuid[],
    p_mention_ids => array[]::uuid[],
    p_recurrence_frequency => 'monthly',
    p_recurrence_interval => 1,
    p_recurrence_until => '2026-03-31'
  )$$,
  'family admin can manage task metadata'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_lists), 3, 'selected member sees family and explicitly shared lists');
select is((select count(*)::integer from public.family_lists where visibility = 'private'), 0, 'selected membership does not expose private lists');
select lives_ok(
  $$select public.add_family_list_item('40000000-4000-4000-8000-000000000002', 'Pan', 2, 'barras')$$,
  'selected editor can add an ordered list item'
);
select is(
  (
    select sort_order::integer from public.family_list_items
    where list_id = '40000000-4000-4000-8000-000000000002' and title = 'Pan'
  ),
  2048,
  'new list item receives the next stable order value'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_tasks), 1, 'outsider sees only tasks from their own family');
select is((select count(*)::integer from public.family_tasks where family_id = '40000000-1000-4000-8000-000000000001'), 0, 'tasks never cross family boundaries');
select is((select count(*)::integer from public.family_lists where family_id = '40000000-1000-4000-8000-000000000001'), 0, 'lists never cross family boundaries');
select throws_ok(
  $$select public.process_task_due_notifications('2026-03-31', 20)$$,
  '42501',
  'permission denied for function process_task_due_notifications',
  'authenticated users cannot process due notifications'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(public.process_task_due_notifications('2026-03-31', 20), 1, 'service role processes a due task once');
select is(public.process_task_due_notifications('2026-03-31', 20), 0, 'due task processing is idempotent');
select is(
  (
    select link from public.notifications
    where user_id = '40000000-0000-4000-8000-000000000003' and type = 'task_due'
    order by created_at desc
    limit 1
  ),
  '/family/40000000-1000-4000-8000-000000000001/tasks?task=40000000-3000-4000-8000-000000000001',
  'due notification contains only a safe internal deep link'
);

select * from finish();
rollback;
