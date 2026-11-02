begin;

drop trigger trigger_update_game_stats on public.game_sessions;
create trigger trigger_update_game_stats after update on public.game_sessions
for each row when (old.finished_at is null and new.finished_at is not null and not private.is_secure_game_room(new.room_id))
execute function public.update_game_stats_after_session();

drop trigger trigger_auto_delete_empty_rooms on public.room_participants;
create trigger trigger_auto_delete_empty_rooms after update on public.room_participants
for each row when (old.is_active and not new.is_active and not private.is_secure_game_room(new.room_id))
execute function public.auto_delete_empty_rooms();

drop trigger trigger_auto_delete_empty_rooms_on_delete on public.room_participants;
create trigger trigger_auto_delete_empty_rooms_on_delete after delete on public.room_participants
for each row when (not private.is_secure_game_room(old.room_id))
execute function public.auto_delete_empty_rooms();

notify pgrst, 'reload schema';
commit;
