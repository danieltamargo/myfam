begin;

create table private.family_game_secrets (
  session_id uuid primary key references public.game_sessions(id) on delete cascade,
  wordle_answer text,
  reaction_go_at timestamptz,
  color_answer text
);
alter table private.family_game_secrets enable row level security;
revoke all on private.family_game_secrets from public, anon, authenticated, service_role;

create function private.family_wordle_dictionary()
returns text[] language sql immutable set search_path = ''
as $$ select array['ABRIL','ACTOR','AGUAS','AUDIO','AVIÓN','ÁRBOL','BARCO','BOLSA','CALOR','CAMPO','CASAS','CIELO','CLASE','COCHE','COLOR','CORTO','DULCE','FELIZ','FLOTA','FRESA','FRUTA','GATOS','HIELO','HORNO','JUEGO','LÁPIZ','LECHE','LIBRO','LLAVE','LUCHA','LUCES','MANOS','MESAS','METRO','MONTE','NUBES','PERRO','PIANO','PLAYA','QUESO']::text[]; $$;
revoke all on function private.family_wordle_dictionary() from public, anon, authenticated, service_role;

create function private.score_family_wordle(p_answer text, p_guess text)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare letters text[] := regexp_split_to_array(p_answer, ''); statuses text[] := array['absent','absent','absent','absent','absent']; i integer; position integer; result jsonb := '[]';
begin
  for i in 1..5 loop
    if substring(p_guess from i for 1) = letters[i] then statuses[i] := 'correct'; letters[i] := null; end if;
  end loop;
  for i in 1..5 loop
    if statuses[i] <> 'correct' then
      position := array_position(letters, substring(p_guess from i for 1));
      if position is not null then statuses[i] := 'present'; letters[position] := null; end if;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('letter', substring(p_guess from i for 1), 'status', statuses[i]));
  end loop;
  return result;
end;
$$;
revoke all on function private.score_family_wordle(text, text) from public, anon, authenticated, service_role;

create function private.new_family_color_round()
returns jsonb language plpgsql volatile set search_path = ''
as $$
declare palette jsonb := '[{"id":"rojo","name":"Rojo","hex":"#DC2626"},{"id":"azul","name":"Azul","hex":"#2563EB"},{"id":"verde","name":"Verde","hex":"#16A34A"},{"id":"amarillo","name":"Amarillo","hex":"#EAB308"},{"id":"naranja","name":"Naranja","hex":"#EA580C"},{"id":"violeta","name":"Violeta","hex":"#9333EA"}]'; choices jsonb; answer jsonb;
begin
  select jsonb_agg(color) into choices from (select value as color from jsonb_array_elements(palette) order by random() limit 3) as selection;
  answer := choices->floor(random()*3)::integer;
  return jsonb_build_object('target', answer->'hex', 'choices', choices, 'answer', answer->>'id');
end;
$$;
revoke all on function private.new_family_color_round() from public, anon, authenticated, service_role;

create or replace function private.can_read_family_game(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_rooms as room
    join public.room_participants as participant on participant.room_id = room.id
    join public.family_members as member on member.family_id = room.family_id and member.user_id = participant.user_id
    where room.id = p_room_id and room.protocol_version = 1
      and room.game_type::text in ('tic_tac_toe','wordle','reaction','color')
      and participant.user_id = (select auth.uid())
  );
$$;

create function public.create_family_game(p_family_id uuid, p_opponent_id uuid, p_name text, p_game_type text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); room_id uuid;
begin
  perform 1 from public.families where id = p_family_id for update;
  if not private.is_family_member(p_family_id, actor_id) then raise exception 'Game access denied' using errcode = '42501'; end if;
  if p_opponent_id is null or p_opponent_id = actor_id or not exists (
    select 1 from public.family_members where family_id = p_family_id and user_id = p_opponent_id
  ) then raise exception 'Choose another family member' using errcode = '22023'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 100 or p_game_type is null
    or p_game_type not in ('tic_tac_toe','wordle','reaction','color') then
    raise exception 'Invalid game configuration' using errcode = '22023';
  end if;
  insert into public.game_rooms(family_id, created_by, name, game_type, max_players, protocol_version)
  values (p_family_id, actor_id, btrim(p_name), p_game_type::public.game_type, 2, 1) returning id into room_id;
  insert into public.room_participants(room_id, user_id, player_number, is_ready)
  values (room_id, actor_id, 1, true), (room_id, p_opponent_id, 2, false);
  return room_id;
end;
$$;
revoke all on function public.create_family_game(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_family_game(uuid, uuid, text, text) to authenticated;

create or replace function public.create_family_game(p_family_id uuid, p_opponent_id uuid, p_name text)
returns uuid language sql security definer set search_path = ''
as $$ select public.create_family_game(p_family_id, p_opponent_id, p_name, 'tic_tac_toe'); $$;

create or replace function public.start_family_game(p_room_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session_id uuid; state jsonb; deadline timestamptz; dictionary text[]; answer text; colors jsonb;
begin
  room := private.lock_family_game(p_room_id);
  if room.created_by <> (select auth.uid()) then raise exception 'Only the creator can start' using errcode = '42501'; end if;
  if room.status <> 'waiting' or (
    select count(*) from public.room_participants as participant
    join public.family_members as member on member.family_id = room.family_id and member.user_id = participant.user_id
    where participant.room_id = p_room_id and participant.is_active and participant.is_ready
  ) <> 2 then raise exception 'Both players must be ready' using errcode = '22023'; end if;
  deadline := clock_timestamp() + interval '60 seconds';
  case room.game_type::text
    when 'tic_tac_toe' then state := '{"board":[[null,null,null],[null,null,null],[null,null,null]],"currentPlayer":1,"winner":null,"isDraw":false,"winningLine":null}';
    when 'wordle' then
      dictionary := private.family_wordle_dictionary();
      answer := dictionary[1+floor(random()*array_length(dictionary,1))::integer];
      state := jsonb_build_object('currentPlayer',1,'winner',null,'isDraw',false,'guesses','[]'::jsonb,'attempts',jsonb_build_object('1',0,'2',0),'maxGuesses',6);
    when 'reaction' then
      state := '{"currentPlayer":0,"winner":null,"isDraw":false}';
      deadline := clock_timestamp() + interval '15 seconds';
    when 'color' then
      colors := private.new_family_color_round();
      state := jsonb_build_object('currentPlayer',1,'winner',null,'isDraw',false,'round',1,'scores',jsonb_build_object('1',0,'2',0),'target',colors->'target','choices',colors->'choices');
    else raise exception 'Unsupported game' using errcode = '22023';
  end case;
  insert into public.game_sessions(room_id, game_type, game_state, turn_deadline)
  values (p_room_id, room.game_type, state, deadline) returning id into session_id;
  insert into private.family_game_secrets(session_id, wordle_answer, reaction_go_at, color_answer)
  values (session_id, answer, case when room.game_type::text='reaction' then clock_timestamp()+interval '2 seconds'+random()*interval '3 seconds' else null end, colors->>'answer');
  update public.game_rooms set status = 'in_progress', started_at = clock_timestamp() where id = p_room_id;
  return session_id;
end;
$$;

create function public.guess_family_wordle(p_room_id uuid, p_version bigint, p_guess text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session public.game_sessions; player integer; state jsonb; answer text; guess text := upper(btrim(p_guess)); attempts integer; winner integer; draw boolean;
begin
  room := private.lock_family_game(p_room_id);
  select * into session from public.game_sessions where room_id=p_room_id and status='active' for update;
  if room.game_type::text <> 'wordle' or room.status <> 'in_progress' or session.id is null then raise exception 'Game is not active' using errcode='22023'; end if;
  if p_version is null or session.version<>p_version then raise exception 'Game changed concurrently' using errcode='40001'; end if;
  if session.turn_deadline<=clock_timestamp() then raise exception 'Turn expired' using errcode='22023'; end if;
  select player_number into player from public.room_participants where room_id=p_room_id and user_id=(select auth.uid());
  state := session.game_state;
  if player<>(state->>'currentPlayer')::integer then raise exception 'Not your turn' using errcode='42501'; end if;
  if guess is null or not (guess=any(private.family_wordle_dictionary())) then raise exception 'Use a word from the 40-word dictionary' using errcode='22023'; end if;
  select wordle_answer into answer from private.family_game_secrets where session_id=session.id;
  attempts := (state->'attempts'->>player::text)::integer+1;
  if attempts>6 then raise exception 'No guesses remain' using errcode='22023'; end if;
  state := jsonb_set(state,array['attempts',player::text],to_jsonb(attempts));
  state := jsonb_set(state,'{guesses}',state->'guesses'||jsonb_build_array(jsonb_build_object('player',player,'word',guess,'result',private.score_family_wordle(answer,guess))));
  winner := case when guess=answer then player else null end;
  draw := winner is null and (state->'attempts'->>'1')::integer=6 and (state->'attempts'->>'2')::integer=6;
  state := state||jsonb_build_object('currentPlayer',3-player,'winner',winner,'isDraw',draw);
  insert into public.game_moves(session_id,player_id,player_number,move_number,move_data,state_after)
  values(session.id,(select auth.uid()),player,session.version::integer,jsonb_build_object('guess',guess),state);
  if winner is not null or draw then perform private.finish_family_game(p_room_id,session.id,state,winner,draw);
  else update public.game_sessions set game_state=state,version=version+1,turn_deadline=clock_timestamp()+interval '60 seconds' where id=session.id; end if;
  return session.version+1;
end;
$$;

create function public.read_family_game_signal(p_room_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare go_at timestamptz;
begin
  if not private.can_read_family_game(p_room_id) then raise exception 'Game access denied' using errcode='42501'; end if;
  select secret.reaction_go_at into go_at from public.game_sessions as session
  join private.family_game_secrets as secret on secret.session_id=session.id
  join public.game_rooms as room on room.id=session.room_id
  where session.room_id=p_room_id and session.status='active' and room.game_type::text='reaction';
  return go_at is not null and clock_timestamp()>=go_at;
end;
$$;

create function public.react_family_game(p_room_id uuid, p_version bigint)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session public.game_sessions; player integer; go_at timestamptz; pressed_at timestamptz; early boolean; winner integer; state jsonb;
begin
  room := private.lock_family_game(p_room_id);
  select * into session from public.game_sessions where room_id=p_room_id and status='active' for update;
  if room.game_type::text<>'reaction' or room.status<>'in_progress' or session.id is null then raise exception 'Game is not active' using errcode='22023'; end if;
  if p_version is null or session.version<>p_version then raise exception 'Game changed concurrently' using errcode='40001'; end if;
  pressed_at := clock_timestamp();
  if session.turn_deadline<=pressed_at then raise exception 'Round expired' using errcode='22023'; end if;
  select player_number into player from public.room_participants where room_id=p_room_id and user_id=(select auth.uid());
  select reaction_go_at into go_at from private.family_game_secrets where session_id=session.id;
  early := pressed_at<go_at;
  winner := case when early then 3-player else player end;
  state := session.game_state||jsonb_build_object('winner',winner,'endReason',case when early then 'false_start' else 'reaction' end,
    'reactionMs',case when early then null else greatest(0,floor(extract(epoch from pressed_at-go_at)*1000))::integer end);
  insert into public.game_moves(session_id,player_id,player_number,move_number,move_data,state_after)
  values(session.id,(select auth.uid()),player,session.version::integer,jsonb_build_object('falseStart',early),state);
  perform private.finish_family_game(p_room_id,session.id,state,winner,false);
  return session.version+1;
end;
$$;

create function public.choose_family_game_color(p_room_id uuid, p_version bigint, p_choice text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare room public.game_rooms; session public.game_sessions; player integer; state jsonb; answer text; correct boolean; round integer; colors jsonb; winner integer; draw boolean := false; score1 integer; score2 integer;
begin
  room := private.lock_family_game(p_room_id);
  select * into session from public.game_sessions where room_id=p_room_id and status='active' for update;
  if room.game_type::text<>'color' or room.status<>'in_progress' or session.id is null then raise exception 'Game is not active' using errcode='22023'; end if;
  if p_version is null or session.version<>p_version then raise exception 'Game changed concurrently' using errcode='40001'; end if;
  if session.turn_deadline<=clock_timestamp() then raise exception 'Turn expired' using errcode='22023'; end if;
  select player_number into player from public.room_participants where room_id=p_room_id and user_id=(select auth.uid());
  state := session.game_state;
  if player<>(state->>'currentPlayer')::integer then raise exception 'Not your turn' using errcode='42501'; end if;
  if p_choice is null or not exists(select 1 from jsonb_array_elements(state->'choices') as choice where choice->>'id'=p_choice) then raise exception 'Invalid color choice' using errcode='22023'; end if;
  select color_answer into answer from private.family_game_secrets where session_id=session.id;
  correct := p_choice=answer;
  state := jsonb_set(state,array['scores',player::text],to_jsonb((state->'scores'->>player::text)::integer+case when correct then 1 else 0 end));
  round := (state->>'round')::integer;
  if round=6 then
    score1 := (state->'scores'->>'1')::integer; score2 := (state->'scores'->>'2')::integer;
    winner := case when score1>score2 then 1 when score2>score1 then 2 else null end; draw := score1=score2;
  else
    colors := private.new_family_color_round();
    state := state||jsonb_build_object('round',round+1,'target',colors->'target','choices',colors->'choices');
    update private.family_game_secrets set color_answer=colors->>'answer' where session_id=session.id;
  end if;
  state := state||jsonb_build_object('currentPlayer',3-player,'winner',winner,'isDraw',draw,'lastAnswerCorrect',correct);
  insert into public.game_moves(session_id,player_id,player_number,move_number,move_data,state_after)
  values(session.id,(select auth.uid()),player,session.version::integer,jsonb_build_object('choice',p_choice,'correct',correct),state);
  if round=6 then perform private.finish_family_game(p_room_id,session.id,state,winner,draw);
  else update public.game_sessions set game_state=state,version=version+1,turn_deadline=clock_timestamp()+interval '60 seconds' where id=session.id; end if;
  return session.version+1;
end;
$$;

revoke all on function public.guess_family_wordle(uuid,bigint,text) from public, anon;
revoke all on function public.read_family_game_signal(uuid) from public, anon;
revoke all on function public.react_family_game(uuid,bigint) from public, anon;
revoke all on function public.choose_family_game_color(uuid,bigint,text) from public, anon;
grant execute on function public.guess_family_wordle(uuid,bigint,text) to authenticated;
grant execute on function public.read_family_game_signal(uuid) to authenticated;
grant execute on function public.react_family_game(uuid,bigint) to authenticated;
grant execute on function public.choose_family_game_color(uuid,bigint,text) to authenticated;

create or replace function public.move_family_game(p_room_id uuid, p_version bigint, p_row integer, p_col integer)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  room public.game_rooms; session public.game_sessions; player integer;
  state jsonb; board jsonb; symbol text; winner integer; draw boolean := false;
  winning_line jsonb := 'null'; r integer; c integer; line integer[];
begin
  room := private.lock_family_game(p_room_id);
  select * into session from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  if room.game_type::text <> 'tic_tac_toe' or room.status <> 'in_progress' or session.id is null then
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

create or replace function public.end_family_game(p_room_id uuid, p_reason text)
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
      if room.game_type::text = 'reaction' then
        state := session.game_state || jsonb_build_object('winner', null, 'isDraw', true, 'endReason', 'timeout');
        perform private.finish_family_game(p_room_id, session.id, state, null, true);
        return;
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

notify pgrst, 'reload schema';
commit;
