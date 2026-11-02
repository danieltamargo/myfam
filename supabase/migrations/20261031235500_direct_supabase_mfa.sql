begin;

create function private.session_meets_mfa()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_role text := current_setting('role', true);
  caller_id uuid := (select auth.uid());
begin
  -- SET ROLE survives SECURITY DEFINER; current_user would always be the owner.
  if request_role = 'service_role' then return true; end if;
  if session_user in ('postgres', 'supabase_admin')
    and coalesce(request_role, 'none') not in ('authenticated', 'anon')
  then
    return true;
  end if;
  if caller_id is null then return false; end if;
  if (select auth.jwt()->>'aal') = 'aal2' then return true; end if;
  -- Missing aal has the same behavior as aal1, including legacy tokens.
  return not exists (
    select 1 from auth.mfa_factors as factor
    where factor.user_id = caller_id and factor.status = 'verified'
  );
end;
$$;

create function private.require_session_mfa()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.session_meets_mfa() then
    raise exception 'Verified second factor required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.session_meets_mfa(), private.require_session_mfa() from public, anon;
grant execute on function private.session_meets_mfa(), private.require_session_mfa() to authenticated, service_role;

do $policies$
declare table_name text;
begin
  foreach table_name in array array[
    'audit_logs', 'calendar_event_participants', 'calendar_event_reminders', 'calendar_events',
    'calendar_external_event_links', 'calendar_oauth_states', 'expense_categories',
    'expense_collection_event_links', 'expense_collection_members', 'expense_collections',
    'expense_settlements', 'expense_splits', 'expenses', 'external_connections', 'families',
    'family_document_members', 'family_documents', 'family_habit_members', 'family_habits',
    'family_invitations', 'family_list_items', 'family_list_members', 'family_lists',
    'family_members', 'family_modules', 'family_note_members', 'family_notes', 'family_recipes',
    'family_tasks', 'game_achievements', 'game_moves', 'game_rooms', 'game_sessions', 'game_stats',
    'gift_calendar_event_links', 'gift_comment_mentions', 'gift_event_categories',
    'gift_item_comments', 'gift_item_events', 'gift_items', 'gift_purchases', 'gift_reservations',
    'habit_completions', 'meal_plan_entries', 'notes', 'notifications', 'profiles',
    'recipe_ingredients', 'recurring_expense_rules', 'recurring_expense_splits',
    'room_participants', 'task_assignees', 'task_completions', 'task_due_deliveries',
    'task_groups', 'task_mentions'
  ] loop
    execute format(
      'create policy session_mfa_required on public.%I as restrictive for all to authenticated
       using ((select private.session_meets_mfa()))
       with check ((select private.session_meets_mfa()))', table_name
    );
  end loop;
end;
$policies$;

create policy session_mfa_required on storage.objects
  as restrictive for all to authenticated
  using ((select private.session_meets_mfa()))
  with check ((select private.session_meets_mfa()));

-- Exact project signatures preserve owners, grants, settings and existing bodies.
do $rpc_guards$
declare
  signature text;
  function_id regprocedure;
  definition text;
  original_body text;
  guarded_body text;
begin
  foreach signature in array array[
    'public.accept_expense_collection_invitation(uuid)',
    'public.accept_family_invitation(uuid)',
    'public.add_family_list_item(uuid,text,numeric,text)',
    'public.archive_family_habit(uuid)',
    'public.begin_family_document_upload(uuid,text,text,text,bigint,text,text,uuid[],timestamptz)',
    'public.cancel_family_document_upload(uuid)',
    'public.change_expense_collection_role(uuid,uuid,text)',
    'public.choose_family_game_color(uuid,bigint,text)',
    'public.complete_family_document_delete(uuid)',
    'public.complete_family_document_upload(uuid)',
    'public.copy_recipe_ingredients_to_list(uuid,uuid)',
    'public.create_calendar_event(uuid,text,text,timestamptz,timestamptz,text,boolean,text,uuid[],text,integer,timestamptz,integer,uuid,integer)',
    'public.create_expense_collection(uuid,text,text,text)',
    'public.create_expense_with_splits(uuid,uuid,uuid,text,numeric,date,text,text,jsonb)',
    'public.create_family(text)',
    'public.create_family_game(uuid,uuid,text,text)',
    'public.create_family_habit(uuid,text,text,text,uuid[],date)',
    'public.create_family_list(uuid,text,text,text,uuid[])',
    'public.create_family_note(uuid,text,text,text,uuid[])',
    'public.create_family_recipe(uuid,text,text,text,integer,jsonb)',
    'public.create_family_task(uuid,uuid,text,text,date,text,uuid[],uuid[],text,integer,date)',
    'public.create_recurring_expense_rule(uuid,uuid,uuid,text,numeric,text,text,date,jsonb)',
    'public.create_task_group(uuid,text)',
    'public.delete_calendar_event(uuid,bigint)',
    'public.delete_expense_with_lock(uuid,uuid,bigint)',
    'public.delete_family(uuid)',
    'public.delete_family_list_item(uuid,bigint)',
    'public.end_family_game(uuid,text)',
    'public.get_calendar_event_origins(uuid,uuid[])',
    'public.get_managed_family_invitations(uuid)',
    'public.get_unread_notification_count(uuid)',
    'public.guess_family_wordle(uuid,bigint,text)',
    'public.invite_expense_collection_member(uuid,uuid,text)',
    'public.invite_family_member(uuid,text)',
    'public.leave_expense_collection(uuid)',
    'public.mark_gift_item_received(uuid,bigint)',
    'public.move_family_game(uuid,bigint,integer,integer)',
    'public.prepare_family_document_delete(uuid,bigint)',
    'public.prepare_family_document_download(uuid)',
    'public.purchase_gift_item(uuid,smallint)',
    'public.react_family_game(uuid,bigint)',
    'public.read_family_game_signal(uuid)',
    'public.ready_family_game(uuid)',
    'public.record_expense_settlement(uuid,uuid,uuid,bigint,uuid)',
    'public.reject_family_invitation(uuid)',
    'public.release_gift_item(uuid,text)',
    'public.remove_family_meal(uuid)',
    'public.remove_family_member(uuid,uuid)',
    'public.reserve_gift_item(uuid,smallint,text)',
    'public.restore_family_document_delete(uuid)',
    'public.reveal_received_gift_buyers(uuid)',
    'public.revoke_expense_collection_member(uuid,uuid)',
    'public.save_wishlist_item(uuid,uuid,uuid,bigint,text,text,text[],numeric,text,smallint,smallint,text,text,uuid[],text,uuid)',
    'public.schedule_family_meal(uuid,uuid,date,text,text)',
    'public.set_expense_collection_event(uuid,text,uuid)',
    'public.set_family_habit_completion(uuid,date,boolean)',
    'public.set_family_list_item_completed(uuid,bigint,boolean)',
    'public.set_family_member_capabilities(uuid,uuid,boolean,boolean)',
    'public.set_family_module_preference(uuid,text,boolean)',
    'public.set_family_note_archived(uuid,bigint,boolean)',
    'public.set_family_task_status(uuid,bigint,text)',
    'public.set_recurring_expense_rule_active(uuid,uuid,boolean)',
    'public.start_family_game(uuid)',
    'public.transfer_expense_collection_ownership(uuid,uuid)',
    'public.transfer_family_ownership(uuid,uuid)',
    'public.update_calendar_event(uuid,bigint,text,text,timestamptz,timestamptz,text,boolean,text,uuid[],text,integer,timestamptz,integer,uuid,integer)',
    'public.update_expense_with_splits(uuid,uuid,bigint,uuid,uuid,text,numeric,date,text,text,jsonb)',
    'public.update_family_document_access(uuid,bigint,text,text,uuid[],timestamptz)',
    'public.update_family_note(uuid,bigint,text,text,text,uuid[])',
    'public.update_family_task(uuid,bigint,uuid,text,text,date,text,uuid[],uuid[],text,integer,date)',
    'private.validate_expense_participants()'
  ] loop
    function_id := signature::regprocedure;
    select pg_get_functiondef(function_id), prosrc into definition, original_body
    from pg_proc where oid = function_id and prosecdef
      and prolang = (select oid from pg_language where lanname = 'plpgsql');
    if definition is null or original_body like '%private.require_session_mfa()%'
      or strpos(definition, original_body) = 0
    then
      raise exception 'Unexpected MFA RPC definition: %', signature;
    end if;
    -- The outer block runs before any original DECLARE initializers.
    guarded_body := E'\nbegin\n  perform private.require_session_mfa();\n' || original_body || E'\nend;\n';
    execute replace(definition, original_body, guarded_body);
  end loop;
end;
$rpc_guards$;

create or replace function public.get_my_profile()
returns table(id uuid, display_name text, avatar_url text, email text, active_family_id uuid,
  created_at timestamp without time zone, updated_at timestamp without time zone)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_session_mfa();
  return query select profile.id, profile.display_name, profile.avatar_url, profile.email,
    profile.active_family_id, profile.created_at, profile.updated_at
  from public.profiles as profile where profile.id = (select auth.uid());
end;
$$;

create or replace function public.get_expense_collection_invitations()
returns table(collection_id uuid, family_id uuid, collection_name text, description text,
  currency text, role text, invited_by uuid)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_session_mfa();
  return query select collection.id, collection.family_id, collection.name, collection.description,
    collection.currency, member.role, member.invited_by
  from public.expense_collection_members as member
  join public.expense_collections as collection on collection.id = member.collection_id
  where member.user_id = (select auth.uid()) and member.status = 'invited'
  order by collection.created_at desc;
end;
$$;

create or replace function public.create_family_game(p_family_id uuid, p_opponent_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_session_mfa();
  return public.create_family_game(p_family_id, p_opponent_id, p_name, 'tic_tac_toe');
end;
$$;

do $helper_guards$
declare
  signature text;
  function_id regprocedure;
  definition text;
  original_body text;
  expression_body text;
begin
  foreach signature in array array[
    'private.can_change_family_task_status(uuid,uuid)',
    'private.can_download_family_document(uuid,uuid)',
    'private.can_edit_family_list(uuid,uuid)',
    'private.can_edit_family_note(uuid,uuid)',
    'private.can_manage_calendar_event(uuid,uuid)',
    'private.can_manage_family_document(uuid,uuid)',
    'private.can_manage_family_habit(uuid,uuid)',
    'private.can_manage_family_recipe(uuid,uuid)',
    'private.can_manage_family_task(uuid,uuid)',
    'private.can_read_family_document_metadata(uuid,uuid)',
    'private.can_read_family_game(uuid)',
    'private.can_view_calendar_event(uuid,uuid)',
    'private.can_view_family_habit(uuid,uuid)',
    'private.can_view_family_list(uuid,uuid)',
    'private.can_view_family_note(uuid,uuid)',
    'private.can_view_family_recipe(uuid,uuid)',
    'private.can_view_profile(uuid,uuid)',
    'private.has_expense_collection_role(uuid,uuid,text[])',
    'private.has_family_capability(uuid,text)',
    'private.has_family_role(uuid,uuid,text[])',
    'private.is_active_expense_member(uuid,uuid)',
    'private.is_family_member(uuid,uuid)'
  ] loop
    function_id := signature::regprocedure;
    select pg_get_functiondef(function_id), prosrc into definition, original_body
    from pg_proc where oid = function_id and prosecdef and prorettype = 'boolean'::regtype
      and prolang = (select oid from pg_language where lanname = 'sql');
    if definition is null or original_body !~* '^\s*select\M'
      or original_body like '%private.session_meets_mfa()%'
    then
      raise exception 'Unexpected MFA helper definition: %', signature;
    end if;
    expression_body := regexp_replace(original_body, ';\s*$', '');
    execute replace(definition, original_body,
      E'\nselect case when (select private.session_meets_mfa()) then (\n'
      || expression_body || E'\n) else false end;\n');
  end loop;

  function_id := 'private.can_read_gift_image(text)'::regprocedure;
  select pg_get_functiondef(function_id), prosrc into definition, original_body
  from pg_proc where oid = function_id;
  execute replace(definition, original_body,
    E'\nbegin\n  if not (select private.session_meets_mfa()) then return false; end if;\n'
    || original_body || E'\nend;\n');
end;
$helper_guards$;

notify pgrst, 'reload schema';
commit;
