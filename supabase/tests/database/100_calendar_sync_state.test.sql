begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public', 'external_connections', 'sync_cursor', 'provider cursors are persisted');
select has_column('public', 'external_connections', 'sync_attempted_at', 'attempt cooldown survives requests and restarts');
select ok(not has_column_privilege('authenticated', 'public.external_connections', 'sync_cursor', 'select'), 'browser cannot read provider delta tokens');
select ok(not has_column_privilege('anon', 'public.external_connections', 'sync_cursor', 'select'), 'anonymous clients cannot read provider cursors');
select ok(not has_column_privilege('authenticated', 'public.external_connections', 'sync_cursor', 'update'), 'browser cannot replace provider cursors');
select ok(not has_column_privilege('authenticated', 'public.external_connections', 'sync_attempted_at', 'update'), 'browser cannot reset the cooldown');
select ok(has_column_privilege('service_role', 'public.external_connections', 'sync_cursor', 'select,update'), 'service can read and save incremental progress');
select ok(has_column_privilege('service_role', 'public.external_connections', 'sync_attempted_at', 'select,update'), 'service can enforce the cooldown');
select ok(not has_function_privilege('authenticated', 'public.acquire_google_calendar_sync(uuid,uuid)', 'execute'), 'browser cannot bypass server synchronization locks');

select * from finish();
rollback;
