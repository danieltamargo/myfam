begin;

create table public.expense_event_links (
  expense_id uuid primary key,
  collection_id uuid not null,
  family_id uuid not null,
  event_id uuid not null,
  foreign key (collection_id, expense_id) references public.expenses(collection_id, id) on delete cascade,
  foreign key (family_id, collection_id) references public.expense_collections(family_id, id) on delete cascade,
  foreign key (family_id, event_id) references public.calendar_events(family_id, id) on delete cascade
);
create index expense_event_links_collection_idx on public.expense_event_links(collection_id);
create index expense_event_links_event_idx on public.expense_event_links(event_id);
alter table public.expense_event_links enable row level security;
revoke all on public.expense_event_links from public, anon, authenticated;
grant select on public.expense_event_links to authenticated;
grant all on public.expense_event_links to service_role;

create policy expense_event_links_visible on public.expense_event_links
  for select to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid()))
    and private.can_view_calendar_event(event_id, (select auth.uid())));
create policy session_mfa_required on public.expense_event_links
  as restrictive for all to authenticated
  using ((select private.session_meets_mfa()))
  with check ((select private.session_meets_mfa()));

create function public.save_expense_with_event(
  p_collection_id uuid, p_expense_id uuid, p_version bigint,
  p_category_id uuid, p_paid_by uuid, p_description text, p_amount numeric,
  p_occurred_on date, p_notes text, p_receipt_path text, p_splits jsonb,
  p_calendar_change text, p_calendar_event_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  collection public.expense_collections%rowtype;
  previous public.expenses%rowtype;
  saved_id uuid;
begin
  perform private.require_session_mfa();
  select * into collection from public.expense_collections where id = p_collection_id for update;
  if actor_id is null or collection.id is null or collection.archived_at is not null
    or not private.has_expense_collection_role(p_collection_id, actor_id, array['owner', 'manager', 'contributor']) then
    raise exception 'Expense write permission required' using errcode = '42501';
  end if;
  if p_expense_id is not null then
    select * into previous from public.expenses
      where id = p_expense_id and collection_id = p_collection_id for update;
    if previous.id is null or not (
      private.has_expense_collection_role(p_collection_id, actor_id, array['owner', 'manager'])
      or previous.created_by = actor_id
    ) then raise exception 'Expense write permission required' using errcode = '42501'; end if;
    if p_version is null or previous.version <> p_version then
      raise exception 'Stale expense version' using errcode = 'PT409';
    end if;
  end if;
  if p_calendar_change is null or p_calendar_change not in ('keep', 'replace', 'clear') then
    raise exception 'Invalid calendar association action' using errcode = '22023';
  end if;
  if p_calendar_change = 'replace' and not exists (
    select 1 from public.calendar_events where id = p_calendar_event_id and family_id = collection.family_id
      and private.can_view_calendar_event(id, actor_id)
  ) then raise exception 'Calendar event is not available' using errcode = '42501'; end if;

  if p_expense_id is null then
    saved_id := public.create_expense_with_splits(p_collection_id, p_category_id, p_paid_by,
      p_description, p_amount, p_occurred_on, p_notes, p_receipt_path, p_splits);
  else
    perform public.update_expense_with_splits(p_collection_id, p_expense_id, p_version,
      p_category_id, p_paid_by, p_description, p_amount, p_occurred_on, p_notes, p_receipt_path, p_splits);
    saved_id := p_expense_id;
  end if;
  if p_calendar_change in ('replace', 'clear') then
    delete from public.expense_event_links where expense_id = saved_id;
    if p_calendar_change = 'replace' then
      insert into public.expense_event_links(expense_id, collection_id, family_id, event_id)
        values (saved_id, p_collection_id, collection.family_id, p_calendar_event_id);
    end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_expense_with_event(uuid, uuid, bigint, uuid, uuid, text, numeric, date, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.save_expense_with_event(uuid, uuid, bigint, uuid, uuid, text, numeric, date, text, text, jsonb, text, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
