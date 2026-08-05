begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'authenticated', 'dora@example.test', '{"name":"Dora"}', now(), now()),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5', 'authenticated', 'eli@example.test', '{"name":"Eli"}', now(), now());

insert into public.notifications (id, user_id, type, title, message, link, read)
values
  (
    '31111111-1111-4111-8111-111111111111',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    'comment',
    'Primera',
    'Mensaje',
    '/dashboard',
    false
  ),
  (
    '32222222-2222-4222-8222-222222222222',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
    'mention',
    'Segunda',
    'Mensaje',
    '/dashboard',
    false
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
    'comment',
    'Ajena',
    'Mensaje',
    '/dashboard',
    false
  );

select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'insert'),
  'authenticated cannot insert notifications'
);
select ok(
  not has_column_privilege('authenticated', 'public.notifications', 'title', 'update'),
  'authenticated cannot rewrite notification content'
);
select ok(
  has_column_privilege('authenticated', 'public.notifications', 'read', 'update'),
  'authenticated can update only the read flag'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.notifications),
  2,
  'a user sees only their notifications'
);
select throws_ok(
  $$insert into public.notifications (user_id, type, title) values ('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'comment', 'Forged')$$,
  '42501'
);
select throws_ok(
  $$update public.notifications set title = 'Forged' where id = '31111111-1111-4111-8111-111111111111'$$,
  '42501'
);
select lives_ok(
  $$update public.notifications set read = true where id = '31111111-1111-4111-8111-111111111111'$$,
  'a user can mark an own notification as read'
);
update public.notifications
set read = true
where id = '33333333-3333-4333-8333-333333333333';

reset role;

select is(
  (select read from public.notifications where id = '31111111-1111-4111-8111-111111111111'),
  true,
  'the own read flag changed'
);
select is(
  (select read from public.notifications where id = '33333333-3333-4333-8333-333333333333'),
  false,
  'another user notification was not changed'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;

select is(
  public.get_unread_notification_count('dddddddd-dddd-4ddd-8ddd-ddddddddddd4'),
  1,
  'the count RPC returns only the caller unread count'
);
select throws_ok(
  $$select public.get_unread_notification_count('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5')$$,
  '42501'
);
select throws_ok(
  $$select private.create_notification('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'comment', 'Denied')$$,
  '42501'
);

reset role;
set local role service_role;

select throws_ok(
  $$select private.create_notification('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'arbitrary', 'Invalid')$$,
  '22023'
);
select throws_ok(
  $$select private.create_notification('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'comment', 'Invalid link', null, 'https://evil.example')$$,
  '22023'
);
select lives_ok(
  $$select private.create_notification('dddddddd-dddd-4ddd-8ddd-ddddddddddd4', 'comment', 'Válida', 'Mensaje', '/dashboard')$$,
  'the internal creator accepts a validated notification'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.notifications
    where user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'
  ),
  3,
  'the validated internal notification was created once'
);

select * from finish();

rollback;
