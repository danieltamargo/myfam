begin;

-- Wishlist item data has explicit business invariants. Existing arbitrary image
-- URLs are cleared before the path-only constraint is installed.
alter table public.gift_items
  add column desired_quantity smallint not null default 1,
  add column currency text not null default 'EUR',
  add column status text not null default 'active',
  add column version bigint not null default 1;

alter table public.gift_items
  add constraint gift_items_desired_quantity_check
    check (desired_quantity between 1 and 999),
  add constraint gift_items_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  add constraint gift_items_price_nonnegative_check
    check (price is null or price >= 0),
  add constraint gift_items_status_check
    check (status in ('active', 'fulfilled', 'archived')),
  add constraint gift_items_version_check
    check (version > 0);

update public.gift_items
set image_url = null
where image_url is not null
  and (
    image_url not like family_id::text || '/' || owner_id::text || '/%'
    or image_url like '%..%'
    or image_url like E'%\\%'
  );

alter table public.gift_items
  add constraint gift_items_image_path_check
    check (
      image_url is null
      or (
        image_url like family_id::text || '/' || owner_id::text || '/%'
        and image_url not like '%..%'
        and image_url not like E'%\\%'
      )
    );

comment on column public.gift_items.image_url is
  'Private gift-images object path in the form family_id/owner_id/file; never a public URL';

alter table public.gift_reservations
  add column quantity smallint not null default 1;

alter table public.gift_reservations
  add constraint gift_reservations_quantity_check
    check (quantity between 1 and 999);

alter table public.gift_purchases
  alter column quantity_purchased set not null,
  alter column quantity_purchased set default 1,
  alter column quantity_purchased type smallint using quantity_purchased::smallint;

alter table public.gift_purchases
  drop constraint if exists valid_purchase_quantity,
  add constraint gift_purchases_quantity_check
    check (quantity_purchased between 1 and 999);

create index if not exists idx_gift_items_family_owner_status
  on public.gift_items(family_id, owner_id, status);
create index if not exists idx_gift_reservations_item_user_quantity
  on public.gift_reservations(item_id, reserved_by) include (quantity, status);
create index if not exists idx_gift_purchases_item_user_quantity
  on public.gift_purchases(item_id, purchased_by) include (quantity_purchased);

create or replace function private.manage_gift_item_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    return new;
  end if;

  if new.family_id <> old.family_id or new.owner_id <> old.owner_id then
    raise exception 'Gift item family and owner are immutable' using errcode = '42501';
  end if;

  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function private.enforce_gift_item_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated_quantity integer;
begin
  select
    coalesce((
      select sum(reservation.quantity)
      from public.gift_reservations as reservation
      where reservation.item_id = new.id
    ), 0)
    + coalesce((
      select sum(purchase.quantity_purchased)
      from public.gift_purchases as purchase
      where purchase.item_id = new.id
    ), 0)
  into allocated_quantity;

  if allocated_quantity > new.desired_quantity then
    raise exception 'Desired quantity cannot be lower than coordinated quantity'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists gift_items_manage_version on public.gift_items;
create trigger gift_items_manage_version
  before insert or update on public.gift_items
  for each row execute function private.manage_gift_item_version();

drop trigger if exists gift_items_enforce_capacity on public.gift_items;
create trigger gift_items_enforce_capacity
  before update of desired_quantity on public.gift_items
  for each row execute function private.enforce_gift_item_capacity();

revoke all on function private.manage_gift_item_version() from public, anon, authenticated;
revoke all on function private.enforce_gift_item_capacity() from public, anon, authenticated;

-- Item owners can manage the public wishlist data, but identity and optimistic
-- lock columns cannot be rewritten through PostgREST.
drop policy if exists "Family members can view all wishlist items" on public.gift_items;
drop policy if exists "Users can create their own wishlist items" on public.gift_items;
drop policy if exists "Users can update their own wishlist items" on public.gift_items;
drop policy if exists "Users can delete their own wishlist items" on public.gift_items;

create policy gift_items_select_family
  on public.gift_items for select
  to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));

create policy gift_items_insert_owner
  on public.gift_items for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.is_family_member(family_id, (select auth.uid()))
  );

create policy gift_items_update_owner
  on public.gift_items for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and private.is_family_member(family_id, (select auth.uid()))
  );

create policy gift_items_delete_owner
  on public.gift_items for delete
  to authenticated
  using (owner_id = (select auth.uid()));

revoke update on table public.gift_items from authenticated;
grant update (
  name,
  description,
  price,
  priority,
  links,
  image_url,
  desired_quantity,
  currency,
  status
) on table public.gift_items to authenticated;

-- Coordination tables are read-only to clients. All writes pass through the
-- item-locking RPCs below so capacity cannot be exceeded by racing requests.
revoke insert, update, delete on table public.gift_reservations from authenticated;
revoke insert, update, delete on table public.gift_purchases from authenticated;
grant select on table public.gift_reservations to authenticated;
grant select on table public.gift_purchases to authenticated;

drop policy if exists "Family members can view reservations" on public.gift_reservations;
drop policy if exists "Family members can reserve items (except their own)" on public.gift_reservations;
drop policy if exists "Users can update their own reservations" on public.gift_reservations;
drop policy if exists "Users can delete their own reservations" on public.gift_reservations;

create policy gift_reservations_select_coordinators
  on public.gift_reservations for select
  to authenticated
  using (
    exists (
      select 1
      from public.gift_items as item
      where item.id = gift_reservations.item_id
        and item.owner_id <> (select auth.uid())
        and private.is_family_member(item.family_id, (select auth.uid()))
    )
  );

drop policy if exists "Family members can view purchases (except for their own items)" on public.gift_purchases;
drop policy if exists "Family members can purchase items (except their own)" on public.gift_purchases;
drop policy if exists "Users can update their own purchases" on public.gift_purchases;
drop policy if exists "Users can delete their own purchases" on public.gift_purchases;

create policy gift_purchases_select_coordinators
  on public.gift_purchases for select
  to authenticated
  using (
    exists (
      select 1
      from public.gift_items as item
      where item.id = gift_purchases.item_id
        and item.owner_id <> (select auth.uid())
        and private.is_family_member(item.family_id, (select auth.uid()))
    )
  );

drop policy if exists family_members_can_view_comments on public.gift_item_comments;
create policy gift_comments_select_coordinators
  on public.gift_item_comments for select
  to authenticated
  using (
    exists (
      select 1
      from public.gift_items as item
      where item.id = gift_item_comments.item_id
        and item.owner_id <> (select auth.uid())
        and private.is_family_member(item.family_id, (select auth.uid()))
    )
  );

drop policy if exists family_members_can_view_mentions on public.gift_comment_mentions;
create policy gift_mentions_select_coordinators
  on public.gift_comment_mentions for select
  to authenticated
  using (
    exists (
      select 1
      from public.gift_item_comments as comment
      join public.gift_items as item on item.id = comment.item_id
      where comment.id = gift_comment_mentions.comment_id
        and item.owner_id <> (select auth.uid())
        and private.is_family_member(item.family_id, (select auth.uid()))
    )
  );

create or replace function public.reserve_gift_item(
  p_item_id uuid,
  p_quantity smallint default 1,
  p_status text default 'considering'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_family_id uuid;
  item_owner_id uuid;
  item_desired_quantity integer;
  item_status text;
  allocated_quantity integer;
  reservation_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantity must be between 1 and 999' using errcode = '22023';
  end if;
  if p_status not in ('considering', 'reserved') then
    raise exception 'Invalid reservation status' using errcode = '22023';
  end if;

  select item.family_id, item.owner_id, item.desired_quantity, item.status
  into item_family_id, item_owner_id, item_desired_quantity, item_status
  from public.gift_items as item
  where item.id = p_item_id
  for update;

  if not found then
    raise exception 'Gift item not found' using errcode = 'P0002';
  end if;
  if item_status <> 'active' then
    raise exception 'Only active gift items can be coordinated' using errcode = '23514';
  end if;
  if item_owner_id = actor_id
    or not private.is_family_member(item_family_id, actor_id)
  then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.gift_purchases as purchase
    where purchase.item_id = p_item_id and purchase.purchased_by = actor_id
  ) then
    raise exception 'Release the purchased state before reserving' using errcode = '23514';
  end if;

  select
    coalesce((
      select sum(reservation.quantity)
      from public.gift_reservations as reservation
      where reservation.item_id = p_item_id
        and reservation.reserved_by <> actor_id
    ), 0)
    + coalesce((
      select sum(purchase.quantity_purchased)
      from public.gift_purchases as purchase
      where purchase.item_id = p_item_id
    ), 0)
  into allocated_quantity;

  if allocated_quantity + p_quantity > item_desired_quantity then
    raise exception 'Requested quantity exceeds remaining quantity' using errcode = '23514';
  end if;

  insert into public.gift_reservations (item_id, reserved_by, quantity, status)
  values (p_item_id, actor_id, p_quantity, p_status)
  on conflict (item_id, reserved_by)
  do update set
    quantity = excluded.quantity,
    status = excluded.status,
    reserved_at = now()
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.purchase_gift_item(
  p_item_id uuid,
  p_quantity smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  item_family_id uuid;
  item_owner_id uuid;
  item_desired_quantity integer;
  item_status text;
  allocated_quantity integer;
  purchase_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantity must be between 1 and 999' using errcode = '22023';
  end if;

  select item.family_id, item.owner_id, item.desired_quantity, item.status
  into item_family_id, item_owner_id, item_desired_quantity, item_status
  from public.gift_items as item
  where item.id = p_item_id
  for update;

  if not found then
    raise exception 'Gift item not found' using errcode = 'P0002';
  end if;
  if item_status <> 'active' then
    raise exception 'Only active gift items can be coordinated' using errcode = '23514';
  end if;
  if item_owner_id = actor_id
    or not private.is_family_member(item_family_id, actor_id)
  then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;

  delete from public.gift_reservations
  where item_id = p_item_id and reserved_by = actor_id;

  select
    coalesce((
      select sum(reservation.quantity)
      from public.gift_reservations as reservation
      where reservation.item_id = p_item_id
    ), 0)
    + coalesce((
      select sum(purchase.quantity_purchased)
      from public.gift_purchases as purchase
      where purchase.item_id = p_item_id
        and purchase.purchased_by <> actor_id
    ), 0)
  into allocated_quantity;

  if allocated_quantity + p_quantity > item_desired_quantity then
    raise exception 'Requested quantity exceeds remaining quantity' using errcode = '23514';
  end if;

  insert into public.gift_purchases (item_id, purchased_by, quantity_purchased)
  values (p_item_id, actor_id, p_quantity)
  on conflict (item_id, purchased_by)
  do update set
    quantity_purchased = excluded.quantity_purchased,
    purchased_at = now()
  returning id into purchase_id;

  return purchase_id;
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
  item_family_id uuid;
  item_owner_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_coordination_type not in ('considering', 'reserved', 'purchased', 'all') then
    raise exception 'Invalid coordination type' using errcode = '22023';
  end if;

  select item.family_id, item.owner_id
  into item_family_id, item_owner_id
  from public.gift_items as item
  where item.id = p_item_id
  for update;

  if not found then
    raise exception 'Gift item not found' using errcode = 'P0002';
  end if;
  if item_owner_id = actor_id
    or not private.is_family_member(item_family_id, actor_id)
  then
    raise exception 'Cannot coordinate this gift item' using errcode = '42501';
  end if;

  if p_coordination_type in ('considering', 'reserved') then
    delete from public.gift_reservations
    where item_id = p_item_id
      and reserved_by = actor_id
      and status = p_coordination_type;
  elsif p_coordination_type = 'purchased' then
    delete from public.gift_purchases
    where item_id = p_item_id and purchased_by = actor_id;
  else
    delete from public.gift_reservations
    where item_id = p_item_id and reserved_by = actor_id;
    delete from public.gift_purchases
    where item_id = p_item_id and purchased_by = actor_id;
  end if;
end;
$$;

revoke all on function public.reserve_gift_item(uuid, smallint, text) from public, anon;
revoke all on function public.purchase_gift_item(uuid, smallint) from public, anon;
revoke all on function public.release_gift_item(uuid, text) from public, anon;
grant execute on function public.reserve_gift_item(uuid, smallint, text) to authenticated, service_role;
grant execute on function public.purchase_gift_item(uuid, smallint) to authenticated, service_role;
grant execute on function public.release_gift_item(uuid, text) to authenticated, service_role;

-- Legacy SECURITY DEFINER helpers exposed aggregate purchase information and
-- accepted arbitrary user ids. They are retained for migrations only.
revoke all on function public.get_item_purchased_quantity(uuid) from public, anon, authenticated;
revoke all on function public.has_user_purchased_item(uuid, uuid) from public, anon, authenticated;

-- Private Storage bucket. Object names encode family and uploader identity;
-- access is derived from that path and never from a public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-images',
  'gift-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_path_uuid(p_name text, p_position integer)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[p_position]::uuid;
exception when invalid_text_representation or array_subscript_error then
  return null;
end;
$$;

revoke all on function private.storage_path_uuid(text, integer) from public, anon;
grant execute on function private.storage_path_uuid(text, integer) to authenticated, service_role;

drop policy if exists gift_images_select_family on storage.objects;
create policy gift_images_select_family
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'gift-images'
    and private.is_family_member(
      private.storage_path_uuid(name, 1),
      (select auth.uid())
    )
  );

drop policy if exists gift_images_insert_owner on storage.objects;
create policy gift_images_insert_owner
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gift-images'
    and private.storage_path_uuid(name, 2) = (select auth.uid())
    and private.is_family_member(
      private.storage_path_uuid(name, 1),
      (select auth.uid())
    )
  );

drop policy if exists gift_images_update_owner on storage.objects;
create policy gift_images_update_owner
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'gift-images'
    and private.storage_path_uuid(name, 2) = (select auth.uid())
  )
  with check (
    bucket_id = 'gift-images'
    and private.storage_path_uuid(name, 2) = (select auth.uid())
    and private.is_family_member(
      private.storage_path_uuid(name, 1),
      (select auth.uid())
    )
  );

drop policy if exists gift_images_delete_owner on storage.objects;
create policy gift_images_delete_owner
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gift-images'
    and private.storage_path_uuid(name, 2) = (select auth.uid())
  );

commit;
