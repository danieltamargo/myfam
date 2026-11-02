begin;

do $migration$
declare definition text; rewritten text;
begin
  definition := pg_get_functiondef('public.delete_calendar_event(uuid,bigint)'::regprocedure);
  rewritten := replace(definition,
    $metadata$jsonb_build_object('title', event_row.title)$metadata$,
    $metadata$jsonb_build_object('title', event_row.title, 'visibility', event_row.visibility)$metadata$);
  if rewritten = definition then
    raise exception 'Expected calendar deletion audit payload is missing';
  end if;
  execute rewritten;
end;
$migration$;

-- Keep the existing family-role policy and restrict only these calendar records.
create policy calendar_event_audit_visibility on public.audit_logs
  as restrictive for select to authenticated
  using (
    module_name is distinct from 'calendar'
    or resource_type is distinct from 'calendar_event'
    or action not in ('calendar.event_created', 'calendar.event_updated', 'calendar.event_deleted')
    or user_id = (select auth.uid())
    or private.can_view_calendar_event(resource_id, (select auth.uid()))
    or (action = 'calendar.event_deleted' and metadata->>'visibility' = 'family')
  );

notify pgrst, 'reload schema';
commit;
