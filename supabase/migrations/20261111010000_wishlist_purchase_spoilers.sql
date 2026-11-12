begin;

alter table public.families add column alias text
  check (alias is null or (alias = btrim(alias) and char_length(alias) between 1 and 100));

alter table public.gift_purchases alter column purchased_by drop not null;
create unique index gift_purchases_unknown_buyer
  on public.gift_purchases (item_id) where purchased_by is null;

do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.purchase_gift_item(uuid,smallint)'::regprocedure);
  if strpos(definition, 'purchased_by <> actor_id') = 0 then
    raise exception 'Expected gift purchase capacity predicate';
  end if;
  execute replace(definition, 'purchased_by <> actor_id', 'purchased_by is distinct from actor_id');

  definition := pg_get_functiondef('public.reveal_received_gift_buyers(uuid)'::regprocedure);
  execute replace(
    replace(definition, 'join public.profiles as profile', 'left join public.profiles as profile'),
    'coalesce(nullif(btrim(profile.display_name), ''''), ''Usuario'')',
    'case when purchase.purchased_by is null then ''Comprador desconocido''
      else coalesce(nullif(btrim(profile.display_name), ''''), ''Usuario'') end'
  );
end;
$$;

create function public.reveal_purchased_gift_items(p_family_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  perform private.require_session_mfa();
  if actor_id is null or not private.is_family_member(p_family_id, actor_id) then
    raise exception 'Cannot reveal purchases in this family' using errcode = '42501';
  end if;
  return query
    select item.id
    from public.gift_items as item
    where item.family_id = p_family_id and item.owner_id = actor_id and item.status = 'active'
      and exists (select 1 from public.gift_purchases as purchase where purchase.item_id = item.id);
end;
$$;

revoke all on function public.reveal_purchased_gift_items(uuid) from public, anon;
grant execute on function public.reveal_purchased_gift_items(uuid) to authenticated, service_role;

commit;
