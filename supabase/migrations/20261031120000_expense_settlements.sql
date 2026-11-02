begin;

create table public.expense_settlements (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  from_user_id uuid not null,
  to_user_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 999999999999),
  idempotency_key uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (collection_id, from_user_id)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, to_user_id)
    references public.expense_collection_members(collection_id, user_id),
  check (from_user_id <> to_user_id),
  unique (collection_id, idempotency_key)
);

alter table public.expense_settlements enable row level security;
revoke all on public.expense_settlements from anon, authenticated;
grant select on public.expense_settlements to authenticated;
create policy expense_settlements_select on public.expense_settlements
  for select to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

create function public.get_expense_settlement_balances(p_collection_id uuid)
returns table (user_id uuid, balance_cents bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not private.is_active_expense_member(p_collection_id, (select auth.uid())) then
    raise exception 'Collection access required' using errcode = '42501';
  end if;
  return query
    with adjustments as (
      select settlement.from_user_id as participant, settlement.amount_cents as cents
      from public.expense_settlements as settlement where settlement.collection_id = p_collection_id
      union all
      select settlement.to_user_id, -settlement.amount_cents
      from public.expense_settlements as settlement where settlement.collection_id = p_collection_id
    )
    select balance.user_id,
      (balance.balance * 100 + coalesce(sum(adjustments.cents), 0))::bigint
    from public.get_expense_balances(p_collection_id, '0001-01-01', '9999-12-31') as balance
    left join adjustments on adjustments.participant = balance.user_id
    group by balance.user_id, balance.balance
    order by balance.user_id;
end;
$$;

create function public.record_expense_settlement(
  p_collection_id uuid, p_from_user_id uuid, p_to_user_id uuid,
  p_amount_cents bigint, p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  archived_at timestamptz;
  previous public.expense_settlements%rowtype;
  debtor_balance bigint;
  creditor_balance bigint;
  settlement_id uuid;
begin
  select member.role, collection.archived_at into caller_role, archived_at
  from public.expense_collections as collection
  join public.expense_collection_members as member on member.collection_id = collection.id
    and member.user_id = caller_id and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;
  if caller_role is null or caller_role not in ('owner', 'manager', 'contributor') then
    raise exception 'Settlement permission required' using errcode = '42501';
  end if;
  if caller_role = 'contributor' and p_from_user_id is distinct from caller_id then
    raise exception 'Contributors can only record their own payments' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 999999999999
    or p_idempotency_key is null or p_from_user_id is null or p_to_user_id is null
    or p_from_user_id = p_to_user_id then
    raise exception 'Invalid settlement' using errcode = '22023';
  end if;
  select * into previous from public.expense_settlements
    where collection_id = p_collection_id and idempotency_key = p_idempotency_key;
  if found then
    if previous.from_user_id <> p_from_user_id or previous.to_user_id <> p_to_user_id
      or previous.amount_cents <> p_amount_cents or previous.created_by <> caller_id then
      raise exception 'Idempotency key already used for another settlement' using errcode = '40001';
    end if;
    return previous.id;
  end if;
  if archived_at is not null then
    raise exception 'Collection is archived' using errcode = '42501';
  end if;
  select balance_cents into debtor_balance
    from public.get_expense_settlement_balances(p_collection_id) where user_id = p_from_user_id;
  select balance_cents into creditor_balance
    from public.get_expense_settlement_balances(p_collection_id) where user_id = p_to_user_id;
  if debtor_balance is null or creditor_balance is null
    or debtor_balance >= 0 or creditor_balance <= 0
    or p_amount_cents > -debtor_balance or p_amount_cents > creditor_balance then
    raise exception 'Balances changed; reload before recording the settlement' using errcode = '40001';
  end if;
  insert into public.expense_settlements (
    collection_id, from_user_id, to_user_id, amount_cents, idempotency_key, created_by
  ) values (
    p_collection_id, p_from_user_id, p_to_user_id, p_amount_cents, p_idempotency_key, caller_id
  ) returning id into settlement_id;
  return settlement_id;
end;
$$;

revoke all on function public.get_expense_settlement_balances(uuid) from public, anon;
revoke all on function public.record_expense_settlement(uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.get_expense_settlement_balances(uuid) to authenticated;
grant execute on function public.record_expense_settlement(uuid, uuid, uuid, bigint, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
