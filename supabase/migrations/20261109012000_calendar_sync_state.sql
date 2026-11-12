begin;

alter table public.external_connections
  add column sync_cursor jsonb,
  add column sync_attempted_at timestamptz;

revoke all on public.external_connections from public, anon;
revoke select (sync_cursor, sync_attempted_at) on public.external_connections from authenticated;
grant select (sync_cursor, sync_attempted_at), update (sync_cursor, sync_attempted_at)
  on public.external_connections to service_role;

comment on column public.external_connections.sync_cursor is
  'Service-only provider cursor. Saved only after a complete successful synchronization.';

notify pgrst, 'reload schema';
commit;
