begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

set local role service_role;
select throws_ok(
  $$select public.acquire_google_calendar_sync(
    '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000002'
  )$$,
  'PT409',
  'Connection unavailable or synchronizing',
  'an unavailable sync lease is a non-retryable business conflict'
);

reset role;
select * from finish();
rollback;
