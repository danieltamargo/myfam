begin;

create function private.can_read_gift_image(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  image_family_id uuid := private.storage_path_uuid(object_name, 1);
  image_owner_id uuid := private.storage_path_uuid(object_name, 2);
begin
  if actor_id is null or not private.is_family_member(image_family_id, actor_id) then
    return false;
  end if;
  if image_owner_id = actor_id then return true; end if;
  return not exists (
    select 1 from public.gift_items as item
    where item.family_id = image_family_id and item.owner_id = image_owner_id
      and item.status = 'fulfilled' and item.image_url = object_name
  );
end;
$$;

revoke all on function private.can_read_gift_image(text) from public, anon;
grant execute on function private.can_read_gift_image(text) to authenticated;

drop policy gift_images_select_family on storage.objects;
create policy gift_images_select_family
  on storage.objects for select
  to authenticated
  using (bucket_id = 'gift-images' and private.can_read_gift_image(name));

commit;
