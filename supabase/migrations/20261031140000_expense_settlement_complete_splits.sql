begin;

create or replace function public.get_expense_settlement_balances(p_collection_id uuid)
returns table (user_id uuid, balance_cents bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not private.is_active_expense_member(p_collection_id, (select auth.uid())) then
    raise exception 'Collection access required' using errcode = '42501';
  end if;
  if exists (
    select expense.id from public.expenses as expense
    left join public.expense_splits as split on split.expense_id = expense.id
    where expense.collection_id = p_collection_id
    group by expense.id, expense.amount
    having coalesce(sum(split.amount), 0) <> expense.amount
  ) then
    raise exception 'Expense splits are incomplete' using errcode = '22023';
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

notify pgrst, 'reload schema';
commit;
