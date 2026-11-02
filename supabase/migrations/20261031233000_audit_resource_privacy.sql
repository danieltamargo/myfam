begin;

create policy notes_audit_visibility on public.audit_logs
  as restrictive for select to authenticated
  using (
    module_name is distinct from 'notes'
    or resource_type is distinct from 'family_note'
    or action not in ('notes.note_created', 'notes.note_updated', 'notes.archive_changed')
    or user_id = (select auth.uid())
    or private.can_view_family_note(resource_id, (select auth.uid()))
  );

create policy documents_audit_visibility on public.audit_logs
  as restrictive for select to authenticated
  using (
    module_name is distinct from 'documents'
    or resource_type is distinct from 'family_document'
    or action not in ('documents.uploaded', 'documents.access_changed', 'documents.downloaded', 'documents.deleted')
    or user_id = (select auth.uid())
    or private.can_read_family_document_metadata(resource_id, (select auth.uid()))
  );

create policy habits_audit_visibility on public.audit_logs
  as restrictive for select to authenticated
  using (
    module_name is distinct from 'habits'
    or resource_type is distinct from 'family_habit'
    or action not in ('habits.habit_created', 'habits.completion_changed', 'habits.habit_archived')
    or user_id = (select auth.uid())
    or private.can_view_family_habit(resource_id, (select auth.uid()))
  );

create policy lists_audit_visibility on public.audit_logs
  as restrictive for select to authenticated
  using (
    module_name is distinct from 'lists'
    or not coalesce((
      (resource_type = 'family_list' and action = 'lists.list_created')
      or (resource_type = 'family_list_item' and action in ('lists.item_added', 'lists.item_completion_changed', 'lists.item_deleted'))
    ), false)
    or user_id = (select auth.uid())
    or (resource_type = 'family_list' and private.can_view_family_list(resource_id, (select auth.uid())))
    or (resource_type = 'family_list_item' and exists (
      select 1 from public.family_list_items as item
      where item.id = audit_logs.resource_id
        and private.can_view_family_list(item.list_id, (select auth.uid()))
    ))
  );

notify pgrst, 'reload schema';
commit;
