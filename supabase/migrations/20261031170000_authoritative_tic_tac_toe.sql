begin;

alter table public.game_rooms add column protocol_version smallint not null default 0;
alter table public.game_sessions
  add column version bigint not null default 1,
  add column turn_deadline timestamptz;

create function private.is_secure_game_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.game_rooms where id = p_room_id and protocol_version = 1); $$;
revoke all on function private.is_secure_game_room(uuid) from public, anon, authenticated;

drop trigger trigger_update_game_stats on public.game_sessions;
create trigger trigger_update_game_stats after update on public.game_sessions
for each row when (not private.is_secure_game_room(new.room_id))
execute function public.update_game_stats_after_session();
drop trigger trigger_notify_game_event on public.game_sessions;
create trigger trigger_notify_game_event after update on public.game_sessions
for each row when (not private.is_secure_game_room(new.room_id))
execute function public.notify_game_event();
drop trigger trigger_handle_player_leave on public.room_participants;
create trigger trigger_handle_player_leave after update on public.room_participants
for each row when (old.is_active and not new.is_active and not private.is_secure_game_room(new.room_id))
execute function public.handle_player_leave();

create function private.can_read_family_game(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_rooms as room
    join public.room_participants as participant on participant.room_id = room.id
    join public.family_members as member on member.family_id = room.family_id
      and member.user_id = participant.user_id
    where room.id = p_room_id and room.protocol_version = 1
      and room.game_type = 'tic_tac_toe' and participant.user_id = (select auth.uid())
  );
$$;
revoke all on function private.can_read_family_game(uuid) from public, anon;
grant execute on function private.can_read_family_game(uuid) to authenticated;

drop policy games_disabled_all on public.game_rooms;
drop policy games_disabled_all on public.room_participants;
drop policy games_disabled_all on public.game_sessions;
drop policy games_disabled_all on public.game_moves;
create policy family_game_rooms_read on public.game_rooms for select to authenticated
using (private.can_read_family_game(id));
create policy family_game_participants_read on public.room_participants for select to authenticated
using (private.can_read_family_game(room_id));
create policy family_game_sessions_read on public.game_sessions for select to authenticated
using (private.can_read_family_game(room_id));
create policy family_game_moves_read on public.game_moves for select to authenticated
using (exists(select 1 from public.game_sessions as session where session.id = session_id
  and private.can_read_family_game(session.room_id)));
grant select on public.game_rooms, public.room_participants, public.game_sessions, public.game_moves to authenticated;

create function private.lock_family_game(p_room_id uuid)
returns public.game_rooms language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms;
begin
  select * into room from public.game_rooms where id = p_room_id for update;
  if not private.can_read_family_game(p_room_id) or not exists (
    select 1 from public.room_participants where room_id = p_room_id
      and user_id = (select auth.uid()) and is_active
  ) then
    raise exception 'Game access denied' using errcode = '42501';
  end if;
  return room;
end;
$$;
revoke all on function private.lock_family_game(uuid) from public, anon, authenticated;

create function public.create_family_game(p_family_id uuid, p_opponent_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); room_id uuid;
begin
  perform 1 from public.families where id = p_family_id for update;
  if not private.is_family_member(p_family_id, actor_id) then
    raise exception 'Game access denied' using errcode = '42501';
  end if;
  if p_opponent_id is null or p_opponent_id = actor_id or not exists (
    select 1 from public.family_members where family_id = p_family_id and user_id = p_opponent_id
  ) then raise exception 'Choose another family member' using errcode = '22023'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100 then
    raise exception 'Room name must contain 1 to 100 characters' using errcode = '22023';
  end if;
  insert into public.game_rooms(family_id, created_by, name, game_type, max_players, protocol_version)
  values (p_family_id, actor_id, btrim(p_name), 'tic_tac_toe', 2, 1) returning id into room_id;
  insert into public.room_participants(room_id, user_id, player_number, is_ready)
  values (room_id, actor_id, 1, true), (room_id, p_opponent_id, 2, false);
  return room_id;
end;
$$;

create function public.ready_family_game(p_room_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms;
begin
  room := private.lock_family_game(p_room_id);
  if room.status <> 'waiting' then raise exception 'Room is not waiting' using errcode = '22023'; end if;
  update public.room_participants set is_ready = true
  where room_id = p_room_id and user_id = (select auth.uid());
end;
$$;

create function public.start_family_game(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session_id uuid;
begin
  room := private.lock_family_game(p_room_id);
  if room.created_by <> (select auth.uid()) then
    raise exception 'Only the creator can start' using errcode = '42501';
  end if;
  if room.status <> 'waiting' or (
    select count(*) from public.room_participants as participant
    join public.family_members as member on member.family_id = room.family_id and member.user_id = participant.user_id
    where participant.room_id = p_room_id and participant.is_active and participant.is_ready
  ) <> 2 then raise exception 'Both players must be ready' using errcode = '22023'; end if;
  insert into public.game_sessions(room_id, game_type, game_state, turn_deadline)
  values (p_room_id, 'tic_tac_toe', '{"board":[[null,null,null],[null,null,null],[null,null,null]],"currentPlayer":1,"winner":null,"isDraw":false,"winningLine":null}', clock_timestamp() + interval '60 seconds')
  returning id into session_id;
  update public.game_rooms set status = 'in_progress', started_at = clock_timestamp() where id = p_room_id;
  return session_id;
end;
$$;

create function private.finish_family_game(
  p_room_id uuid, p_session_id uuid, p_state jsonb, p_winner integer, p_draw boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare winning_user_id uuid;
begin
  select user_id into winning_user_id from public.room_participants
  where room_id = p_room_id and player_number = p_winner;
  update public.game_sessions set game_state = p_state, final_state = p_state,
    status = 'finished', finished_at = clock_timestamp(), turn_deadline = null,
    version = version + 1, is_draw = p_draw, winner_id = winning_user_id,
    duration_seconds = greatest(0, floor(extract(epoch from clock_timestamp() - started_at)))::integer
  where id = p_session_id;
  update public.game_rooms set status = 'finished', finished_at = clock_timestamp() where id = p_room_id;
end;
$$;
revoke all on function private.finish_family_game(uuid, uuid, jsonb, integer, boolean) from public, anon, authenticated;

create function public.move_family_game(p_room_id uuid, p_version bigint, p_row integer, p_col integer)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  room public.game_rooms; session public.game_sessions; player integer;
  state jsonb; board jsonb; symbol text; winner integer; draw boolean := false;
  winning_line jsonb := 'null'; r integer; c integer; line integer[];
begin
  room := private.lock_family_game(p_room_id);
  select * into session from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  if room.status <> 'in_progress' or session.id is null then
    raise exception 'Game is not active' using errcode = '22023';
  end if;
  if p_version is null or session.version <> p_version then
    raise exception 'Game changed concurrently' using errcode = '40001';
  end if;
  if session.turn_deadline <= clock_timestamp() then
    raise exception 'Turn expired; claim the timeout result' using errcode = '22023';
  end if;
  select player_number into player from public.room_participants
  where room_id = p_room_id and user_id = (select auth.uid());
  state := session.game_state;
  if player <> (state->>'currentPlayer')::integer then
    raise exception 'Not your turn' using errcode = '42501';
  end if;
  if p_row is null or p_col is null or p_row not between 0 and 2 or p_col not between 0 and 2 then
    raise exception 'Invalid cell' using errcode = '22023';
  end if;
  if state->'board'->p_row->>p_col is not null then
    raise exception 'Cell occupied' using errcode = '22023';
  end if;
  symbol := case player when 1 then 'X' else 'O' end;
  board := jsonb_set(state->'board', array[p_row::text,p_col::text], to_jsonb(symbol));
  foreach line slice 1 in array array[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]] loop
    if board->(line[1]/3)->>(line[1]%3) = symbol
      and board->(line[2]/3)->>(line[2]%3) = symbol
      and board->(line[3]/3)->>(line[3]%3) = symbol then
      winner := player;
      select jsonb_agg(jsonb_build_object('row', cell/3, 'col', cell%3)) into winning_line from unnest(line) as cell;
      exit;
    end if;
  end loop;
  if winner is null then
    draw := true;
    for r in 0..2 loop for c in 0..2 loop
      if board->r->>c is null then draw := false; end if;
    end loop; end loop;
  end if;
  state := jsonb_build_object('board', board, 'currentPlayer', 3-player,
    'winner', winner, 'isDraw', draw, 'winningLine', winning_line);
  insert into public.game_moves(session_id, player_id, player_number, move_number, move_data, state_after)
  values (session.id, (select auth.uid()), player, session.version::integer,
    jsonb_build_object('row',p_row,'col',p_col), state);
  if winner is not null or draw then
    perform private.finish_family_game(p_room_id, session.id, state, winner, draw);
  else
    update public.game_sessions set game_state = state, version = version + 1,
      turn_deadline = clock_timestamp() + interval '60 seconds' where id = session.id;
  end if;
  return session.version + 1;
end;
$$;

create function public.end_family_game(p_room_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session public.game_sessions; loser integer; state jsonb;
begin
  room := private.lock_family_game(p_room_id);
  if p_reason is null or p_reason not in ('leave','timeout') then
    raise exception 'Invalid ending reason' using errcode = '22023';
  end if;
  if room.status = 'waiting' and p_reason = 'leave' then
    update public.game_rooms set status = 'cancelled', finished_at = clock_timestamp() where id = p_room_id;
  elsif room.status = 'in_progress' then
    select * into session from public.game_sessions where room_id = p_room_id and status = 'active' for update;
    if p_reason = 'timeout' then
      if session.turn_deadline is null or session.turn_deadline > clock_timestamp() then
        raise exception 'Turn has not expired' using errcode = '22023';
      end if;
      loser := (session.game_state->>'currentPlayer')::integer;
    else
      select player_number into loser from public.room_participants
      where room_id = p_room_id and user_id = (select auth.uid());
    end if;
    state := session.game_state || jsonb_build_object('winner', 3-loser, 'isDraw', false, 'endReason', p_reason);
    perform private.finish_family_game(p_room_id, session.id, state, 3-loser, false);
  elsif p_reason = 'timeout' then
    raise exception 'Game is not active' using errcode = '22023';
  end if;
  if p_reason = 'leave' then
    update public.room_participants set is_active = false, left_at = clock_timestamp()
    where room_id = p_room_id and user_id = (select auth.uid());
  end if;
end;
$$;

revoke all on function public.create_family_game(uuid, uuid, text) from public, anon;
revoke all on function public.ready_family_game(uuid) from public, anon;
revoke all on function public.start_family_game(uuid) from public, anon;
revoke all on function public.move_family_game(uuid, bigint, integer, integer) from public, anon;
revoke all on function public.end_family_game(uuid, text) from public, anon;
grant execute on function public.create_family_game(uuid, uuid, text) to authenticated;
grant execute on function public.ready_family_game(uuid) to authenticated;
grant execute on function public.start_family_game(uuid) to authenticated;
grant execute on function public.move_family_game(uuid, bigint, integer, integer) to authenticated;
grant execute on function public.end_family_game(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
