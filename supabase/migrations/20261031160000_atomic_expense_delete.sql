begin;

create function public.delete_expense_with_lock(p_collection_id uuid, p_expense_id uuid, p_version bigint)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  archived_at timestamptz;
  expense_row public.expenses%rowtype;
begin
  select member.role, collection.archived_at into caller_role, archived_at
  from public.expense_collections as collection
  join public.expense_collection_members as member on member.collection_id = collection.id
    and member.user_id = caller_id and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;
  if caller_role is null or caller_role not in ('owner', 'manager', 'contributor') or archived_at is not null then
    raise exception 'Expense deletion permission required' using errcode = '42501';
  end if;
  select * into expense_row from public.expenses
    where collection_id = p_collection_id and id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if caller_role = 'contributor' and expense_row.created_by <> caller_id then
    raise exception 'Expense deletion permission required' using errcode = '42501';
  end if;
  if p_version is null or expense_row.version <> p_version then
    raise exception 'Stale expense version' using errcode = '40001';
  end if;
  delete from public.expenses where id = expense_row.id;
  return expense_row.receipt_path;
end;
$$;

revoke delete on public.expenses from authenticated;
revoke all on function public.delete_expense_with_lock(uuid, uuid, bigint) from public, anon;
grant execute on function public.delete_expense_with_lock(uuid, uuid, bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
