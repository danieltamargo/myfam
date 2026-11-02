begin;

-- Recreate only repository-owned RPCs, keeping their current bodies, grants,
-- ownership and search_path settings. Native serialization errors remain 40001.
do $migration$
declare
  signature text;
  function_oid regprocedure;
  definition text;
  rewritten text;
begin
  foreach signature in array array[
    'public.acquire_google_calendar_sync(uuid,uuid)',
    'public.choose_family_game_color(uuid,bigint,text)',
    'public.delete_calendar_event(uuid,bigint)',
    'public.delete_expense_with_lock(uuid,uuid,bigint)',
    'public.delete_family_list_item(uuid,bigint)',
    'public.guess_family_wordle(uuid,bigint,text)',
    'public.mark_gift_item_received(uuid,bigint)',
    'public.move_family_game(uuid,bigint,integer,integer)',
    'public.prepare_family_document_delete(uuid,bigint)',
    'public.react_family_game(uuid,bigint)',
    'public.record_expense_settlement(uuid,uuid,uuid,bigint,uuid)',
    'public.set_family_list_item_completed(uuid,bigint,boolean)',
    'public.set_family_note_archived(uuid,bigint,boolean)',
    'public.set_family_task_status(uuid,bigint,text)',
    'public.update_calendar_event(uuid,bigint,text,text,timestamp with time zone,timestamp with time zone,text,boolean,text,uuid[],text,integer,timestamp with time zone,integer,uuid,integer)',
    'public.update_expense_with_splits(uuid,uuid,bigint,uuid,uuid,text,numeric,date,text,text,jsonb)',
    'public.update_family_document_access(uuid,bigint,text,text,uuid[],timestamp with time zone)',
    'public.update_family_note(uuid,bigint,text,text,text,uuid[])',
    'public.update_family_task(uuid,bigint,uuid,text,text,date,text,uuid[],uuid[],text,integer,date)'
  ] loop
    function_oid := to_regprocedure(signature);
    if function_oid is null then
      raise exception 'Expected repository RPC is missing: %', signature;
    end if;
    definition := pg_get_functiondef(function_oid);
    rewritten := regexp_replace(
      definition,
      '(errcode[[:space:]]*=[[:space:]]*)''40001''',
      $replacement$\1'PT409'$replacement$,
      'gi'
    );
    if rewritten = definition then
      raise exception 'Expected intentional conflict raise is missing: %', signature;
    end if;
    execute rewritten;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
