-- Freeze the games module without deleting its schema or data.
-- Existing permissive policies must be removed because PostgreSQL combines them with OR.

do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array[
    'game_rooms',
    'room_participants',
    'game_sessions',
    'game_moves',
    'game_stats',
    'game_achievements'
  ]
  loop
    execute format('alter table public.%I enable row level security', target_table);

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        target_table
      );
    end loop;

    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      target_table
    );

    execute format(
      'create policy games_disabled_all on public.%I as restrictive for all to authenticated using (false) with check (false)',
      target_table
    );
  end loop;
end
$$;

-- RPC and trigger functions are executable by PUBLIC by default. Revoke every
-- game-specific entry point so SECURITY DEFINER cannot bypass the table freeze.
revoke execute on function public.add_bot_to_room(uuid, character varying)
  from public, anon, authenticated;
revoke execute on function public.assign_player_number()
  from public, anon, authenticated;
revoke execute on function public.auto_delete_empty_rooms()
  from public, anon, authenticated;
revoke execute on function public.generate_join_code()
  from public, anon, authenticated;
revoke execute on function public.get_game_leaderboard(uuid, public.game_type, integer)
  from public, anon, authenticated;
revoke execute on function public.handle_player_leave()
  from public, anon, authenticated;
revoke execute on function public.is_room_owner(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.notify_game_event()
  from public, anon, authenticated;
revoke execute on function public.update_game_stats_after_session()
  from public, anon, authenticated;
