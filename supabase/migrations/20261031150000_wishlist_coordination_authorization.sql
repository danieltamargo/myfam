begin;

create or replace function public.reserve_gift_item(
  p_item_id uuid, p_quantity smallint default 1, p_status text default 'considering'
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_row public.gift_items%rowtype;
  allocated_quantity integer;
  reservation_id uuid;
begin
  select * into item_row from public.gift_items where id = p_item_id for update;
  if actor_id is null or item_row.id is null or item_row.owner_id = actor_id
    or not private.is_family_member(item_row.family_id, actor_id) then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;
  if item_row.status <> 'active' then
    raise exception 'Only active gift items can be coordinated' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantity must be between 1 and 999' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('considering', 'reserved') then
    raise exception 'Invalid reservation status' using errcode = '22023';
  end if;
  if exists (select 1 from public.gift_purchases where item_id = p_item_id and purchased_by = actor_id) then
    raise exception 'Release the purchased state before reserving' using errcode = '23514';
  end if;
  select coalesce((select sum(quantity) from public.gift_reservations where item_id = p_item_id and reserved_by <> actor_id), 0)
    + coalesce((select sum(quantity_purchased) from public.gift_purchases where item_id = p_item_id), 0)
  into allocated_quantity;
  if allocated_quantity + p_quantity > item_row.desired_quantity then
    raise exception 'Requested quantity exceeds remaining quantity' using errcode = '23514';
  end if;
  insert into public.gift_reservations (item_id, reserved_by, quantity, status)
  values (p_item_id, actor_id, p_quantity, p_status)
  on conflict (item_id, reserved_by) do update set
    quantity = excluded.quantity, status = excluded.status, reserved_at = now()
  returning id into reservation_id;
  return reservation_id;
end;
$$;

create or replace function public.purchase_gift_item(p_item_id uuid, p_quantity smallint default 1)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_row public.gift_items%rowtype;
  allocated_quantity integer;
  purchase_id uuid;
begin
  select * into item_row from public.gift_items where id = p_item_id for update;
  if actor_id is null or item_row.id is null or item_row.owner_id = actor_id
    or not private.is_family_member(item_row.family_id, actor_id) then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;
  if item_row.status <> 'active' then
    raise exception 'Only active gift items can be coordinated' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantity must be between 1 and 999' using errcode = '22023';
  end if;
  delete from public.gift_reservations where item_id = p_item_id and reserved_by = actor_id;
  select coalesce((select sum(quantity) from public.gift_reservations where item_id = p_item_id), 0)
    + coalesce((select sum(quantity_purchased) from public.gift_purchases where item_id = p_item_id and purchased_by <> actor_id), 0)
  into allocated_quantity;
  if allocated_quantity + p_quantity > item_row.desired_quantity then
    raise exception 'Requested quantity exceeds remaining quantity' using errcode = '23514';
  end if;
  insert into public.gift_purchases (item_id, purchased_by, quantity_purchased)
  values (p_item_id, actor_id, p_quantity)
  on conflict (item_id, purchased_by) do update set
    quantity_purchased = excluded.quantity_purchased, purchased_at = now()
  returning id into purchase_id;
  return purchase_id;
end;
$$;

commit;
