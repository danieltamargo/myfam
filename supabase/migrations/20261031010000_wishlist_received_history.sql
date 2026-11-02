begin;

drop policy gift_items_select_family on public.gift_items;
create policy gift_items_select_family
  on public.gift_items for select
  to authenticated
  using (
    private.is_family_member(family_id, (select auth.uid()))
    and (status <> 'fulfilled' or owner_id = (select auth.uid()))
  );

create function public.mark_gift_item_received(p_item_id uuid, p_version bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_row public.gift_items%rowtype;
  next_version bigint;
begin
  select * into item_row from public.gift_items where id = p_item_id for update;
  if actor_id is null or item_row.id is null or item_row.owner_id <> actor_id
    or not private.is_family_member(item_row.family_id, actor_id) then
    raise exception 'Cannot receive this gift item' using errcode = '42501';
  end if;
  if p_version is null or item_row.version <> p_version then
    raise exception 'Gift item changed concurrently' using errcode = '40001';
  end if;
  if item_row.status <> 'active' then
    raise exception 'Only active gift items can be received' using errcode = '23514';
  end if;
  update public.gift_items set status = 'fulfilled', updated_at = now()
  where id = p_item_id returning version into next_version;
  return next_version;
end;
$$;

create function public.reveal_received_gift_buyers(p_item_id uuid)
returns table (buyer_id uuid, display_name text, quantity smallint, purchased_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_row public.gift_items%rowtype;
begin
  select * into item_row from public.gift_items where id = p_item_id for share;
  if actor_id is null or item_row.id is null or item_row.owner_id <> actor_id
    or not private.is_family_member(item_row.family_id, actor_id) then
    raise exception 'Cannot reveal this gift item' using errcode = '42501';
  end if;
  if item_row.status <> 'fulfilled' then
    raise exception 'Only received gift items can be revealed' using errcode = '23514';
  end if;
  return query
    select purchase.purchased_by,
      coalesce(nullif(btrim(profile.display_name), ''), 'Usuario'),
      purchase.quantity_purchased, purchase.purchased_at
    from public.gift_purchases as purchase
    join public.profiles as profile on profile.id = purchase.purchased_by
    where purchase.item_id = p_item_id
    order by purchase.purchased_at, purchase.id;
end;
$$;

create or replace function public.release_gift_item(
  p_item_id uuid,
  p_coordination_type text default 'all'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_row public.gift_items%rowtype;
begin
  select * into item_row from public.gift_items where id = p_item_id for update;
  if actor_id is null or item_row.id is null or item_row.owner_id = actor_id
    or not private.is_family_member(item_row.family_id, actor_id) then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;
  if item_row.status = 'fulfilled' then
    raise exception 'Received gift coordination is preserved' using errcode = '23514';
  end if;
  if p_coordination_type is null or p_coordination_type not in ('considering', 'reserved', 'purchased', 'all') then
    raise exception 'Invalid coordination type' using errcode = '22023';
  end if;
  if p_coordination_type in ('considering', 'reserved', 'all') then
    delete from public.gift_reservations
    where item_id = p_item_id and reserved_by = actor_id
      and (p_coordination_type = 'all' or status = p_coordination_type);
  end if;
  if p_coordination_type in ('purchased', 'all') then
    delete from public.gift_purchases where item_id = p_item_id and purchased_by = actor_id;
  end if;
end;
$$;

revoke all on function public.mark_gift_item_received(uuid, bigint) from public, anon;
revoke all on function public.reveal_received_gift_buyers(uuid) from public, anon;
grant execute on function public.mark_gift_item_received(uuid, bigint) to authenticated;
grant execute on function public.reveal_received_gift_buyers(uuid) to authenticated;

commit;
