begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_table('public', 'game_rooms', 'game_rooms is preserved');
select has_table('public', 'room_participants', 'room_participants is preserved');
select has_table('public', 'game_sessions', 'game_sessions is preserved');
select has_table('public', 'game_moves', 'game_moves is preserved');
select has_table('public', 'game_stats', 'game_stats is preserved');
select has_table('public', 'game_achievements', 'game_achievements is preserved');

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_rooms'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'game_rooms has one restrictive deny policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'room_participants'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'room_participants has one restrictive deny policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_sessions'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'game_sessions has one restrictive deny policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_moves'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'game_moves has one restrictive deny policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_stats'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'game_stats has one restrictive deny policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_achievements'
      and policyname = 'games_disabled_all'
      and permissive = 'RESTRICTIVE'
      and 'authenticated' = any(roles)
      and qual = 'false'
      and with_check = 'false'
  ),
  1,
  'game_achievements has one restrictive deny policy'
);

select ok(not has_table_privilege('authenticated', 'public.game_rooms', 'select'), 'authenticated cannot select game_rooms');
select ok(not has_table_privilege('authenticated', 'public.room_participants', 'select'), 'authenticated cannot select room_participants');
select ok(not has_table_privilege('authenticated', 'public.game_sessions', 'select'), 'authenticated cannot select game_sessions');
select ok(not has_table_privilege('authenticated', 'public.game_moves', 'select'), 'authenticated cannot select game_moves');
select ok(not has_table_privilege('authenticated', 'public.game_stats', 'select'), 'authenticated cannot select game_stats');
select ok(not has_table_privilege('authenticated', 'public.game_achievements', 'select'), 'authenticated cannot select game_achievements');

select ok(not has_function_privilege('authenticated', 'public.add_bot_to_room(uuid, character varying)', 'execute'), 'authenticated cannot call add_bot_to_room');
select ok(not has_function_privilege('authenticated', 'public.assign_player_number()', 'execute'), 'authenticated cannot call assign_player_number');
select ok(not has_function_privilege('authenticated', 'public.auto_delete_empty_rooms()', 'execute'), 'authenticated cannot call auto_delete_empty_rooms');
select ok(not has_function_privilege('authenticated', 'public.generate_join_code()', 'execute'), 'authenticated cannot call generate_join_code');
select ok(not has_function_privilege('authenticated', 'public.get_game_leaderboard(uuid, game_type, integer)', 'execute'), 'authenticated cannot call get_game_leaderboard');
select ok(not has_function_privilege('authenticated', 'public.handle_player_leave()', 'execute'), 'authenticated cannot call handle_player_leave');
select ok(not has_function_privilege('authenticated', 'public.is_room_owner(uuid, uuid)', 'execute'), 'authenticated cannot call is_room_owner');
select ok(not has_function_privilege('authenticated', 'public.notify_game_event()', 'execute'), 'authenticated cannot call notify_game_event');
select ok(not has_function_privilege('authenticated', 'public.update_game_stats_after_session()', 'execute'), 'authenticated cannot call update_game_stats_after_session');

select * from finish();

rollback;
