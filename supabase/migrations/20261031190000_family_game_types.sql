begin;
alter type public.game_type add value if not exists 'reaction';
alter type public.game_type add value if not exists 'color';
commit;
