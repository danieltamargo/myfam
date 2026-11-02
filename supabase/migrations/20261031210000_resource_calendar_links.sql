begin;

create unique index gift_items_family_id_id_idx on public.gift_items(family_id, id);
create unique index expense_collections_family_id_id_idx on public.expense_collections(family_id, id);

create table public.gift_calendar_event_links (
  item_id uuid primary key,
  family_id uuid not null,
  event_id uuid not null,
  foreign key (family_id, item_id) references public.gift_items(family_id, id) on delete cascade,
  foreign key (family_id, event_id) references public.calendar_events(family_id, id) on delete cascade
);
create index gift_calendar_event_links_event_idx on public.gift_calendar_event_links(event_id);
alter table public.gift_calendar_event_links enable row level security;
revoke all on public.gift_calendar_event_links from public, anon, authenticated;
grant select on public.gift_calendar_event_links to authenticated;
grant all on public.gift_calendar_event_links to service_role;
create policy gift_calendar_links_visible on public.gift_calendar_event_links for select to authenticated
using (exists (select 1 from public.gift_items where id = item_id and gift_items.family_id = gift_calendar_event_links.family_id)
  and private.can_view_calendar_event(event_id, (select auth.uid())));

create table public.expense_collection_event_links (
  collection_id uuid primary key,
  family_id uuid not null,
  event_id uuid not null,
  foreign key (family_id, collection_id) references public.expense_collections(family_id, id) on delete cascade,
  foreign key (family_id, event_id) references public.calendar_events(family_id, id) on delete cascade
);
create index expense_collection_event_links_event_idx on public.expense_collection_event_links(event_id);
alter table public.expense_collection_event_links enable row level security;
revoke all on public.expense_collection_event_links from public, anon, authenticated;
grant select on public.expense_collection_event_links to authenticated;
grant all on public.expense_collection_event_links to service_role;
create policy expense_event_links_visible on public.expense_collection_event_links for select to authenticated
using (private.is_active_expense_member(collection_id, (select auth.uid()))
  and private.can_view_calendar_event(event_id, (select auth.uid())));

create function private.prevent_received_gift_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status = 'fulfilled' then
    raise exception 'Received gift items cannot be edited' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger gift_items_received_immutable before update on public.gift_items
  for each row execute function private.prevent_received_gift_update();
revoke all on function private.prevent_received_gift_update() from public, anon, authenticated;

create function public.save_wishlist_item(
  p_item_id uuid, p_family_id uuid, p_owner_id uuid, p_version bigint,
  p_name text, p_description text, p_links text[], p_price numeric,
  p_currency text, p_priority smallint, p_desired_quantity smallint, p_status text,
  p_image_path text, p_category_ids uuid[], p_calendar_change text, p_calendar_event_id uuid
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous public.gift_items%rowtype;
  saved_item_id uuid;
  category_ids uuid[];
begin
  if actor_id is null or p_owner_id is distinct from actor_id
    or not private.is_family_member(p_family_id, actor_id) then
    raise exception 'Wishlist ownership required' using errcode = '42501';
  end if;
  if p_item_id is not null then
    select * into previous from public.gift_items where id = p_item_id for update;
    if previous.id is null or previous.family_id <> p_family_id or previous.owner_id <> actor_id then
      raise exception 'Wishlist ownership required' using errcode = '42501';
    end if;
    if previous.status = 'fulfilled' then
      raise exception 'Received gift items cannot be edited' using errcode = '23514';
    end if;
    if p_version is null or previous.version <> p_version then
      raise exception 'Gift item changed concurrently' using errcode = 'PT409';
    end if;
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120
    or char_length(coalesce(p_description, '')) > 2000
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_priority is null or p_priority not between -1 and 2
    or p_desired_quantity is null or p_desired_quantity not between 1 and 999
    or p_status is null or p_status not in ('active', 'archived')
    or (p_price is not null and (p_price < 0 or p_price > 99999999.99))
    or coalesce(cardinality(p_links), 0) > 10
    or exists (select 1 from unnest(p_links) as link where link is null or link !~ '^https://[^[:space:]]+$' or char_length(link) > 2048)
    or coalesce(cardinality(p_category_ids), 0) > 20 then
    raise exception 'Invalid wishlist data' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct category_id), '{}'::uuid[]) into category_ids
    from unnest(coalesce(p_category_ids, '{}'::uuid[])) as category_id;
  if exists (select 1 from unnest(category_ids) as category_id where not exists (
    select 1 from public.gift_event_categories where id = category_id and family_id = p_family_id
  )) then raise exception 'Invalid wishlist categories' using errcode = '22023'; end if;
  if p_calendar_change is null or p_calendar_change not in ('keep', 'replace', 'clear') then
    raise exception 'Invalid calendar association action' using errcode = '22023';
  end if;
  if p_calendar_change = 'replace' and not exists (
    select 1 from public.calendar_events where id = p_calendar_event_id and family_id = p_family_id
      and private.can_view_calendar_event(id, actor_id)
  ) then raise exception 'Calendar event is not available' using errcode = '42501'; end if;

  if previous.id is null then
    insert into public.gift_items(family_id, owner_id, name, description, links, price, currency, priority, desired_quantity, status, image_url)
    values (p_family_id, actor_id, btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_links, '{}'), p_price,
      p_currency, p_priority, p_desired_quantity, p_status, p_image_path) returning id into saved_item_id;
  else
    update public.gift_items set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      links = coalesce(p_links, '{}'), price = p_price, currency = p_currency, priority = p_priority,
      desired_quantity = p_desired_quantity, status = p_status, image_url = p_image_path, updated_at = now()
    where id = previous.id returning id into saved_item_id;
  end if;
  delete from public.gift_item_events where gift_item_events.item_id = saved_item_id;
  insert into public.gift_item_events(item_id, event_category_id)
    select saved_item_id, category_id from unnest(category_ids) as category_id;
  if p_calendar_change in ('replace', 'clear') then
    delete from public.gift_calendar_event_links where gift_calendar_event_links.item_id = saved_item_id;
    if p_calendar_change = 'replace' then
      insert into public.gift_calendar_event_links(item_id, family_id, event_id) values (saved_item_id, p_family_id, p_calendar_event_id);
    end if;
  end if;
  return saved_item_id;
end;
$$;

create function public.set_expense_collection_event(p_collection_id uuid, p_change text, p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); collection public.expense_collections%rowtype;
begin
  select * into collection from public.expense_collections where id = p_collection_id for update;
  if collection.id is null or not private.has_expense_collection_role(p_collection_id, actor_id, array['owner', 'manager']) then
    raise exception 'Collection manager required' using errcode = '42501';
  end if;
  if collection.archived_at is not null then raise exception 'Collection is archived' using errcode = '42501'; end if;
  if p_change is null or p_change not in ('keep', 'replace', 'clear') then
    raise exception 'Invalid calendar association action' using errcode = '22023';
  end if;
  if p_change = 'keep' then return; end if;
  if p_change = 'replace' and not exists (
    select 1 from public.calendar_events where id = p_event_id and family_id = collection.family_id
      and private.can_view_calendar_event(id, actor_id)
  ) then raise exception 'Calendar event is not available' using errcode = '42501'; end if;
  delete from public.expense_collection_event_links where collection_id = p_collection_id;
  if p_change = 'replace' then
    insert into public.expense_collection_event_links(collection_id, family_id, event_id)
    values (p_collection_id, collection.family_id, p_event_id);
  end if;
end;
$$;

revoke all on function public.save_wishlist_item(uuid, uuid, uuid, bigint, text, text, text[], numeric, text, smallint, smallint, text, text, uuid[], text, uuid) from public, anon;
grant execute on function public.save_wishlist_item(uuid, uuid, uuid, bigint, text, text, text[], numeric, text, smallint, smallint, text, text, uuid[], text, uuid) to authenticated;
revoke all on function public.set_expense_collection_event(uuid, text, uuid) from public, anon;
grant execute on function public.set_expense_collection_event(uuid, text, uuid) to authenticated;

commit;
