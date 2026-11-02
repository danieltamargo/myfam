begin;
select no_plan();
insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at) values
('24000000-0000-4000-8000-000000000001','authenticated','game-owner@example.test','{"name":"Owner"}',now(),now()),
('24000000-0000-4000-8000-000000000002','authenticated','game-opponent@example.test','{"name":"Opponent"}',now(),now()),
('24000000-0000-4000-8000-000000000003','authenticated','game-uninvited@example.test','{"name":"Uninvited"}',now(),now()),
('24000000-0000-4000-8000-000000000004','authenticated','game-outsider@example.test','{"name":"Outsider"}',now(),now());
insert into public.families(id,name,created_by) values
('24000000-1000-4000-8000-000000000001','Games A','24000000-0000-4000-8000-000000000001'),
('24000000-1000-4000-8000-000000000002','Games B','24000000-0000-4000-8000-000000000004');
insert into public.family_members(family_id,user_id,role) values
('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','owner'),
('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','member'),
('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000003','member'),
('24000000-1000-4000-8000-000000000002','24000000-0000-4000-8000-000000000004','owner');

select is(array_length(private.family_wordle_dictionary(),1),40,'Spanish Wordle has exactly 40 accepted words');
select is((select string_agg(letter->>'status',',' order by ordinal) from jsonb_array_elements(private.score_family_wordle('PERRO','RRRRR')) with ordinality as scored(letter,ordinal)),'absent,absent,correct,correct,absent','correct letters consume repeated answer letters first');
select is((select string_agg(letter->>'status',',' order by ordinal) from jsonb_array_elements(private.score_family_wordle('PERRO','ROJOS')) with ordinality as scored(letter,ordinal)),'present,present,absent,absent,absent','present letters consume remaining answer letters only once');
select ok(not has_table_privilege('authenticated','private.family_game_secrets','select'),'players cannot read the secret table');
select ok(not has_table_privilege('service_role','private.family_game_secrets','select'),'browser-adjacent service credentials do not read secrets by default');
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Legacy type','connect_four')$$,'22023');
select set_config('test.wordle',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Wordle','wordle')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.wordle')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.start_family_game(current_setting('test.wordle')::uuid)$$,'Wordle starts transactionally');
select ok((select not(game_state ? 'targetWord') and not(game_state ? 'answer') from public.game_sessions where room_id=current_setting('test.wordle')::uuid),'public Wordle state contains no answer');
select throws_ok($$select * from private.family_game_secrets$$,'42501');
select throws_ok($$select public.move_family_game(current_setting('test.wordle')::uuid,1,0,0)$$,'22023');
select throws_ok($$select public.guess_family_wordle(current_setting('test.wordle')::uuid,1,'ABCDE')$$,'22023');
reset role;
update private.family_game_secrets set wordle_answer='PERRO' where session_id in(select id from public.game_sessions where room_id=current_setting('test.wordle')::uuid);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.guess_family_wordle(current_setting('test.wordle')::uuid,1,'PERRO')$$,'42501');
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.guess_family_wordle(current_setting('test.wordle')::uuid,1,' perro '),2::bigint,'server normalizes a valid guess and finishes on a hit');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.wordle')::uuid),'24000000-0000-4000-8000-000000000001'::uuid,'server determines Wordle winner');
select set_config('test.draw',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Wordle draw','wordle')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.draw')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.draw')::uuid);
reset role;
update private.family_game_secrets set wordle_answer='PERRO' where session_id in(select id from public.game_sessions where room_id=current_setting('test.draw')::uuid);
set local role authenticated;
do $$ declare i integer; begin
  for i in 1..12 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',case when i%2=1 then '24000000-0000-4000-8000-000000000001' else '24000000-0000-4000-8000-000000000002' end,'role','authenticated','aal','aal1')::text,true);
    perform public.guess_family_wordle(current_setting('test.draw')::uuid,i,'ABRIL');
  end loop;
end $$;
select is((select is_draw from public.game_sessions where room_id=current_setting('test.draw')::uuid),true,'twelve misses exhaust six guesses per player');
select is((select jsonb_array_length(game_state->'guesses') from public.game_sessions where room_id=current_setting('test.draw')::uuid),12,'all twelve guesses persist for reconnect');
select is((select game_state->'attempts' from public.game_sessions where room_id=current_setting('test.draw')::uuid),'{"1":6,"2":6}'::jsonb,'each player receives exactly six guesses');
select throws_ok($$select public.guess_family_wordle(current_setting('test.draw')::uuid,13,'PERRO')$$,'22023');

reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select set_config('test.reaction',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','False start','reaction')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.reaction')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.reaction')::uuid);
reset role;
update private.family_game_secrets set reaction_go_at=clock_timestamp()+interval '1 hour' where session_id in(select id from public.game_sessions where room_id=current_setting('test.reaction')::uuid);
set local role authenticated;
select is(public.read_family_game_signal(current_setting('test.reaction')::uuid),false,'signal does not reveal the future activation time');
select ok((select not(game_state ? 'go_at') from public.game_sessions where room_id=current_setting('test.reaction')::uuid),'reaction time stays private before the signal');
select is(public.react_family_game(current_setting('test.reaction')::uuid,1),2::bigint,'false start produces one authoritative result');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.reaction')::uuid),'24000000-0000-4000-8000-000000000002'::uuid,'false starter loses');
select throws_ok($$select public.react_family_game(current_setting('test.reaction')::uuid,1)$$,'22023');
select set_config('test.fast',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Reaction','reaction')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.fast')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.fast')::uuid);
reset role;
update private.family_game_secrets set reaction_go_at=clock_timestamp()-interval '1 second' where session_id in(select id from public.game_sessions where room_id=current_setting('test.fast')::uuid);
set local role authenticated;
select is(public.read_family_game_signal(current_setting('test.fast')::uuid),true,'signal activates based on server clock');
select is(public.react_family_game(current_setting('test.fast')::uuid,1),2::bigint,'press after signal wins');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.fast')::uuid),'24000000-0000-4000-8000-000000000001'::uuid,'reaction winner comes from authenticated actor');
select ok((select (game_state->>'reactionMs')::integer>=1000 from public.game_sessions where room_id=current_setting('test.fast')::uuid),'server measures elapsed milliseconds');

select set_config('test.color',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Color','color')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.color')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.start_family_game(current_setting('test.color')::uuid)$$,'color starts with server-selected choices');
select throws_ok($$select public.choose_family_game_color(current_setting('test.color')::uuid,1,'forged')$$,'22023');
select throws_ok($$select public.choose_family_game_color(current_setting('test.color')::uuid,999,'rojo')$$,'PT409');
do $$ declare i integer; choice text; begin
  for i in 1..6 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',case when i%2=1 then '24000000-0000-4000-8000-000000000001' else '24000000-0000-4000-8000-000000000002' end,'role','authenticated','aal','aal1')::text,true);
    select option->>'id' into choice from public.game_sessions as session,
      lateral jsonb_array_elements(session.game_state->'choices') as option
      where session.room_id=current_setting('test.color')::uuid
      and ((option->>'hex'=session.game_state->>'target')=(i%2=1)) limit 1;
    perform public.choose_family_game_color(current_setting('test.color')::uuid,i,choice);
  end loop;
end $$;
select is((select game_state->'scores' from public.game_sessions where room_id=current_setting('test.color')::uuid),'{"1":3,"2":0}'::jsonb,'color score is computed on six server-validated choices');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.color')::uuid),'24000000-0000-4000-8000-000000000001'::uuid,'color winner follows server score');

reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from public.game_sessions),0,'outsider cannot read any new game snapshots');
select throws_ok($$select public.read_family_game_signal(current_setting('test.reaction')::uuid)$$,'42501');
select throws_ok($$select public.guess_family_wordle(current_setting('test.wordle')::uuid,1,'PERRO')$$,'42501');
select throws_ok($$select public.react_family_game(current_setting('test.reaction')::uuid,1)$$,'42501');
select throws_ok($$select public.choose_family_game_color(current_setting('test.color')::uuid,1,'rojo')$$,'42501');

reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select set_config('test.reaction_draw',public.create_family_game('24000000-1000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','Reaction draw','reaction')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.reaction_draw')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.reaction_draw')::uuid);
select throws_ok($$select public.end_family_game(current_setting('test.reaction_draw')::uuid,'timeout')$$,'22023');
reset role;
update public.game_sessions set turn_deadline=clock_timestamp()-interval '1 second' where room_id=current_setting('test.reaction_draw')::uuid;
set local role authenticated;
select lives_ok($$select public.end_family_game(current_setting('test.reaction_draw')::uuid,'timeout')$$,'unanswered reaction round closes on server timeout');
select is((select is_draw from public.game_sessions where room_id=current_setting('test.reaction_draw')::uuid),true,'reaction timeout is a draw, never an invented player 3');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.reaction_draw')::uuid),null::uuid,'timed-out reaction has no winning user');
select set_config('test.secret_session',(select id::text from public.game_sessions where room_id=current_setting('test.wordle')::uuid),true);
reset role;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.delete_family('24000000-1000-4000-8000-000000000001')$$,'deleting the family safely cascades through private game secrets');
reset role;
select is((select count(*)::integer from private.family_game_secrets where session_id=current_setting('test.secret_session')::uuid),0,'secret answer is deleted with its family session');

select * from finish();
rollback;
