begin;

create function private.is_legacy_game_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.game_rooms where id = p_room_id and protocol_version = 0); $$;
revoke all on function private.is_legacy_game_room(uuid) from public, anon, authenticated;
grant execute on function private.is_legacy_game_room(uuid) to service_role;
grant execute on function private.is_secure_game_room(uuid) to service_role;

drop trigger trigger_auto_delete_empty_rooms_on_delete on public.room_participants;
create trigger trigger_auto_delete_empty_rooms_on_delete after delete on public.room_participants
for each row when (private.is_legacy_game_room(old.room_id))
execute function public.auto_delete_empty_rooms();

notify pgrst, 'reload schema';
commit;
