begin;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at) values
('23000000-0000-4000-8000-000000000001','authenticated','game-owner@example.test','{"name":"Owner"}',now(),now()),
('23000000-0000-4000-8000-000000000002','authenticated','game-opponent@example.test','{"name":"Opponent"}',now(),now()),
('23000000-0000-4000-8000-000000000003','authenticated','game-uninvited@example.test','{"name":"Uninvited"}',now(),now()),
('23000000-0000-4000-8000-000000000004','authenticated','game-outsider@example.test','{"name":"Outsider"}',now(),now());
insert into public.families(id,name,created_by) values
('23000000-1000-4000-8000-000000000001','Games A','23000000-0000-4000-8000-000000000001'),
('23000000-1000-4000-8000-000000000002','Games B','23000000-0000-4000-8000-000000000004');
insert into public.family_members(family_id,user_id,role) values
('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','owner'),
('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','member'),
('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000003','member'),
('23000000-1000-4000-8000-000000000002','23000000-0000-4000-8000-000000000004','owner');
insert into public.game_rooms(id,family_id,created_by,name,game_type) values
('23000000-2000-4000-8000-000000000001','23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Legacy','wordle');

select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$insert into public.game_rooms(family_id,created_by,name,game_type,protocol_version) values ('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Forged','tic_tac_toe',1)$$,'42501');
select is((select count(*)::integer from public.game_rooms),0,'legacy rooms remain hidden');
select throws_ok($$select public.create_family_game('23000000-1000-4000-8000-000000000002','23000000-0000-4000-8000-000000000004','Wrong family')$$,'42501');
select throws_ok($$select public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000004','Foreign opponent')$$,'22023');
select set_config('test.game1',public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Game 1')::text,true);
select is((select count(*)::integer from public.room_participants where room_id=current_setting('test.game1')::uuid),2,'creation atomically invites exactly two people');
select throws_ok($$select public.start_family_game(current_setting('test.game1')::uuid)$$,'22023');
select throws_ok($$update public.room_participants set is_ready=true where room_id=current_setting('test.game1')::uuid$$,'42501');

reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from public.game_rooms where id=current_setting('test.game1')::uuid),0,'same-family uninvited member cannot read room');
select throws_ok($$select public.ready_family_game(current_setting('test.game1')::uuid)$$,'42501');

reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.ready_family_game(current_setting('test.game1')::uuid)$$,'invited opponent confirms ready');
select throws_ok($$select public.start_family_game(current_setting('test.game1')::uuid)$$,'42501');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.start_family_game(current_setting('test.game1')::uuid)$$,'creator starts ready game');
select throws_ok($$select public.start_family_game(current_setting('test.game1')::uuid)$$,'22023');
select throws_ok($$update public.game_sessions set winner_id='23000000-0000-4000-8000-000000000001' where room_id=current_setting('test.game1')::uuid$$,'42501');
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,1,3,0)$$,'22023');
select is(public.move_family_game(current_setting('test.game1')::uuid,1,0,0),2::bigint,'first legal move advances version');
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,1,0,1)$$,'PT409');
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,2,0,1)$$,'42501');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,2,0,0)$$,'22023');
select is(public.move_family_game(current_setting('test.game1')::uuid,2,1,0),3::bigint,'opponent moves');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.move_family_game(current_setting('test.game1')::uuid,3,0,1);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.move_family_game(current_setting('test.game1')::uuid,4,1,1);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is(public.move_family_game(current_setting('test.game1')::uuid,5,0,2),6::bigint,'winning move commits');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.game1')::uuid),'23000000-0000-4000-8000-000000000001'::uuid,'server decides winner');
select is((select status::text from public.game_rooms where id=current_setting('test.game1')::uuid),'finished','room finishes with session');
select is((select count(*)::integer from public.game_moves where session_id in(select id from public.game_sessions where room_id=current_setting('test.game1')::uuid)),5,'exact move history saved');
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,6,2,2)$$,'22023');
select set_config('test.game2',public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Game 2')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.game2')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.game2')::uuid);
select throws_ok($$select public.end_family_game(current_setting('test.game2')::uuid,'timeout')$$,'22023');
reset role;
update public.game_sessions set turn_deadline=clock_timestamp()-interval '1 second' where room_id=current_setting('test.game2')::uuid;
set local role authenticated;
select throws_ok($$select public.move_family_game(current_setting('test.game2')::uuid,1,0,0)$$,'22023');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.end_family_game(current_setting('test.game2')::uuid,'timeout')$$,'opponent claims verified timeout');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.game2')::uuid),'23000000-0000-4000-8000-000000000002'::uuid,'timeout awards opponent');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from public.game_sessions),0,'other family sees no sessions');
select is((select count(*)::integer from public.game_moves),0,'other family sees no move history');
select throws_ok($$select public.end_family_game(current_setting('test.game1')::uuid,'leave')$$,'42501');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select set_config('test.game3',public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Game 3')::text,true);
select lives_ok($$select public.end_family_game(current_setting('test.game3')::uuid,'leave')$$,'leaving a waiting room cancels it');
select is((select status::text from public.game_rooms where id=current_setting('test.game3')::uuid),'cancelled','cancelled room remains in participant history');

select set_config('test.game4',public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Game 4')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.game4')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.game4')::uuid);
select throws_ok($$select public.move_family_game(current_setting('test.game4')::uuid,null,0,0)$$,'PT409');
select lives_ok($$select public.end_family_game(current_setting('test.game4')::uuid,'leave')$$,'active abandonment finishes atomically');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.game4')::uuid),'23000000-0000-4000-8000-000000000002'::uuid,'abandonment awards the other player');

select set_config('test.game5',public.create_family_game('23000000-1000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Draw')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.ready_family_game(current_setting('test.game5')::uuid);
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.start_family_game(current_setting('test.game5')::uuid);
do $$
declare cell integer[]; move_number integer := 1;
begin
  foreach cell slice 1 in array array[[0,0],[0,1],[0,2],[1,1],[1,0],[1,2],[2,1],[2,0],[2,2]] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      case when move_number%2=1 then '23000000-0000-4000-8000-000000000001' else '23000000-0000-4000-8000-000000000002' end,
      'role','authenticated','aal','aal1')::text,true);
    perform public.move_family_game(current_setting('test.game5')::uuid,move_number,cell[1],cell[2]);
    move_number := move_number+1;
  end loop;
end $$;
select is((select is_draw from public.game_sessions where room_id=current_setting('test.game5')::uuid),true,'full board ends in draw');
select is((select winner_id from public.game_sessions where room_id=current_setting('test.game5')::uuid),null::uuid,'draw has no winning identity');
select is((select status from public.game_sessions where room_id=current_setting('test.game5')::uuid),'finished','draw session is finished');

reset role;
delete from public.family_members where family_id='23000000-1000-4000-8000-000000000001' and user_id='23000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*)::integer from public.game_rooms),0,'removed family member loses room snapshots');
select throws_ok($$select public.ready_family_game(current_setting('test.game1')::uuid)$$,'42501');
select throws_ok($$select public.end_family_game(current_setting('test.game1')::uuid,'leave')$$,'42501');
select throws_ok($$select public.move_family_game(current_setting('test.game1')::uuid,6,2,2)$$,'42501');

reset role;
set local role service_role;
select lives_ok($$delete from public.game_rooms where id=current_setting('test.game5')::uuid$$,'administrative room cleanup does not invoke legacy auto-delete');
reset role;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.delete_family('23000000-1000-4000-8000-000000000001')$$,'family deletion cascades through secure game history');
reset role;
select is((select count(*)::integer from public.game_rooms where family_id='23000000-1000-4000-8000-000000000001'),0,'family deletion leaves no game rooms');

select * from finish();
rollback;
