begin;

alter table public.expenses
  add constraint expenses_collection_id_id_key unique (collection_id, id);

create table public.expense_splits (
  expense_id uuid not null,
  collection_id uuid not null,
  user_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  primary key (expense_id, user_id),
  foreign key (collection_id, expense_id)
    references public.expenses(collection_id, id) on delete cascade,
  foreign key (collection_id, user_id)
    references public.expense_collection_members(collection_id, user_id)
);

create index expense_splits_collection_user_idx
  on public.expense_splits (collection_id, user_id);

create table public.recurring_expense_rules (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  category_id uuid,
  created_by uuid not null references public.profiles(id),
  paid_by uuid not null references public.profiles(id),
  description text not null check (char_length(btrim(description)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_run date not null,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, id),
  foreign key (collection_id, category_id)
    references public.expense_categories(collection_id, id) on delete set null (category_id),
  foreign key (collection_id, created_by)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, paid_by)
    references public.expense_collection_members(collection_id, user_id)
);

create index recurring_expense_rules_due_idx
  on public.recurring_expense_rules (next_run, id)
  where active;
create index recurring_expense_rules_collection_idx
  on public.recurring_expense_rules (collection_id, active, next_run);

create table public.recurring_expense_splits (
  rule_id uuid not null,
  collection_id uuid not null,
  user_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  primary key (rule_id, user_id),
  foreign key (collection_id, rule_id)
    references public.recurring_expense_rules(collection_id, id) on delete cascade,
  foreign key (collection_id, user_id)
    references public.expense_collection_members(collection_id, user_id)
);

create index recurring_expense_splits_collection_user_idx
  on public.recurring_expense_splits (collection_id, user_id);

alter table public.expenses
  add column recurring_rule_id uuid references public.recurring_expense_rules(id) on delete set null,
  add column recurring_occurrence_on date,
  add constraint expenses_recurring_occurrence_pair_check check (
    (recurring_rule_id is null and recurring_occurrence_on is null)
    or (recurring_rule_id is not null and recurring_occurrence_on is not null)
  );

create unique index expenses_recurring_occurrence_unique_idx
  on public.expenses (recurring_rule_id, recurring_occurrence_on)
  where recurring_rule_id is not null;

insert into public.expense_splits (expense_id, collection_id, user_id, amount)
select expense.id, expense.collection_id, expense.paid_by, expense.amount
from public.expenses as expense;

alter table public.expense_splits enable row level security;
alter table public.recurring_expense_rules enable row level security;
alter table public.recurring_expense_splits enable row level security;

create policy expense_splits_select_active_members
  on public.expense_splits for select
  to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

create policy recurring_expense_rules_select_active_members
  on public.recurring_expense_rules for select
  to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

create policy recurring_expense_splits_select_active_members
  on public.recurring_expense_splits for select
  to authenticated
  using (private.is_active_expense_member(collection_id, (select auth.uid())));

revoke all on table public.expense_splits from anon, authenticated;
revoke all on table public.recurring_expense_rules from anon, authenticated;
revoke all on table public.recurring_expense_splits from anon, authenticated;
grant select on table public.expense_splits to authenticated;
grant select on table public.recurring_expense_rules to authenticated;
grant select on table public.recurring_expense_splits to authenticated;
grant all on table public.expense_splits to service_role;
grant all on table public.recurring_expense_rules to service_role;
grant all on table public.recurring_expense_splits to service_role;

create or replace function private.validate_split_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.expense_collection_members as member
    where member.collection_id = new.collection_id
      and member.user_id = new.user_id
      and member.status = 'active'
  ) then
    raise exception 'Split participant must be active in the collection'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_expense_split_participant_before_write
  before insert or update on public.expense_splits
  for each row execute function private.validate_split_participant();

create trigger validate_recurring_split_participant_before_write
  before insert or update on public.recurring_expense_splits
  for each row execute function private.validate_split_participant();

create or replace function private.assert_expense_split_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_expense_id uuid;
  expense_amount numeric(12,2);
  split_count integer;
  split_total numeric(12,2);
begin
  if tg_table_name = 'expenses' then
    target_expense_id := coalesce(new.id, old.id);
  else
    target_expense_id := coalesce(new.expense_id, old.expense_id);
  end if;

  select expense.amount
  into expense_amount
  from public.expenses as expense
  where expense.id = target_expense_id;

  if not found then
    return null;
  end if;

  select count(*)::integer, coalesce(sum(split.amount), 0)::numeric(12,2)
  into split_count, split_total
  from public.expense_splits as split
  where split.expense_id = target_expense_id;

  if split_count > 0 and split_total <> expense_amount then
    raise exception 'Expense splits must add up exactly to the expense amount'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger assert_expense_split_total_after_split_write
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function private.assert_expense_split_total();

create constraint trigger assert_expense_split_total_after_amount_update
  after update of amount on public.expenses
  deferrable initially deferred
  for each row execute function private.assert_expense_split_total();

create or replace function private.assert_recurring_split_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_rule_id uuid;
  rule_amount numeric(12,2);
  split_count integer;
  split_total numeric(12,2);
begin
  if tg_table_name = 'recurring_expense_rules' then
    target_rule_id := coalesce(new.id, old.id);
  else
    target_rule_id := coalesce(new.rule_id, old.rule_id);
  end if;

  select rule.amount
  into rule_amount
  from public.recurring_expense_rules as rule
  where rule.id = target_rule_id;

  if not found then
    return null;
  end if;

  select count(*)::integer, coalesce(sum(split.amount), 0)::numeric(12,2)
  into split_count, split_total
  from public.recurring_expense_splits as split
  where split.rule_id = target_rule_id;

  if split_count > 0 and split_total <> rule_amount then
    raise exception 'Recurring splits must add up exactly to the rule amount'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger assert_recurring_split_total_after_split_write
  after insert or update or delete on public.recurring_expense_splits
  deferrable initially deferred
  for each row execute function private.assert_recurring_split_total();

create constraint trigger assert_recurring_split_total_after_amount_update
  after update of amount on public.recurring_expense_rules
  deferrable initially deferred
  for each row execute function private.assert_recurring_split_total();

create or replace function private.validate_expense_split_payload(
  p_collection_id uuid,
  p_amount numeric,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  split_count integer;
  unique_count integer;
  active_count integer;
  invalid_count integer;
  split_total numeric;
begin
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one split participant is required' using errcode = '22023';
  end if;

  with parsed as (
    select payload.user_id, payload.amount
    from jsonb_to_recordset(p_splits) as payload(user_id uuid, amount numeric)
  )
  select
    count(*)::integer,
    count(distinct parsed.user_id)::integer,
    count(*) filter (
      where parsed.user_id is null
        or parsed.amount is null
        or parsed.amount <= 0
        or parsed.amount <> round(parsed.amount, 2)
    )::integer,
    coalesce(sum(parsed.amount), 0)
  into split_count, unique_count, invalid_count, split_total
  from parsed;

  with parsed as (
    select payload.user_id
    from jsonb_to_recordset(p_splits) as payload(user_id uuid, amount numeric)
  )
  select count(*)::integer
  into active_count
  from parsed
  join public.expense_collection_members as member
    on member.collection_id = p_collection_id
   and member.user_id = parsed.user_id
   and member.status = 'active';

  if p_amount is null
    or p_amount <= 0
    or p_amount <> round(p_amount, 2)
    or split_count <> unique_count
    or invalid_count > 0
    or active_count <> split_count
    or split_total <> p_amount
  then
    raise exception 'Splits must be unique active participants and add up exactly to the amount'
      using errcode = '22023';
  end if;
end;
$$;

create or replace function public.create_expense_with_splits(
  p_collection_id uuid,
  p_category_id uuid,
  p_paid_by uuid,
  p_description text,
  p_amount numeric,
  p_occurred_on date,
  p_notes text,
  p_receipt_path text,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  collection_archived_at timestamptz;
  expense_id uuid;
begin
  select member.role, collection.archived_at
  into caller_role, collection_archived_at
  from public.expense_collections as collection
  join public.expense_collection_members as member
    on member.collection_id = collection.id
   and member.user_id = caller_id
   and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;

  if caller_role not in ('owner', 'manager', 'contributor') or collection_archived_at is not null then
    raise exception 'Expense creation permission required' using errcode = '42501';
  end if;

  perform private.validate_expense_split_payload(p_collection_id, p_amount, p_splits);

  insert into public.expenses (
    collection_id,
    category_id,
    created_by,
    paid_by,
    description,
    amount,
    occurred_on,
    notes,
    receipt_path
  ) values (
    p_collection_id,
    p_category_id,
    caller_id,
    p_paid_by,
    btrim(p_description),
    p_amount,
    p_occurred_on,
    nullif(btrim(p_notes), ''),
    p_receipt_path
  ) returning id into expense_id;

  insert into public.expense_splits (expense_id, collection_id, user_id, amount)
  select expense_id, p_collection_id, payload.user_id, payload.amount
  from jsonb_to_recordset(p_splits) as payload(user_id uuid, amount numeric);

  return expense_id;
end;
$$;

create or replace function public.update_expense_with_splits(
  p_collection_id uuid,
  p_expense_id uuid,
  p_version bigint,
  p_category_id uuid,
  p_paid_by uuid,
  p_description text,
  p_amount numeric,
  p_occurred_on date,
  p_notes text,
  p_receipt_path text,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  collection_archived_at timestamptz;
  expense_creator uuid;
  current_version bigint;
begin
  select member.role, collection.archived_at
  into caller_role, collection_archived_at
  from public.expense_collections as collection
  join public.expense_collection_members as member
    on member.collection_id = collection.id
   and member.user_id = caller_id
   and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;

  select expense.created_by, expense.version
  into expense_creator, current_version
  from public.expenses as expense
  where expense.collection_id = p_collection_id
    and expense.id = p_expense_id
  for update;

  if expense_creator is null then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if collection_archived_at is not null
    or not (caller_role in ('owner', 'manager') or expense_creator = caller_id)
  then
    raise exception 'Expense update permission required' using errcode = '42501';
  end if;
  if current_version <> p_version then
    raise exception 'Stale expense version' using errcode = '40001';
  end if;

  perform private.validate_expense_split_payload(p_collection_id, p_amount, p_splits);

  update public.expenses
  set category_id = p_category_id,
      paid_by = p_paid_by,
      description = btrim(p_description),
      amount = p_amount,
      occurred_on = p_occurred_on,
      notes = nullif(btrim(p_notes), ''),
      receipt_path = p_receipt_path
  where id = p_expense_id;

  delete from public.expense_splits where expense_id = p_expense_id;
  insert into public.expense_splits (expense_id, collection_id, user_id, amount)
  select p_expense_id, p_collection_id, payload.user_id, payload.amount
  from jsonb_to_recordset(p_splits) as payload(user_id uuid, amount numeric);
end;
$$;

create or replace function public.create_recurring_expense_rule(
  p_collection_id uuid,
  p_category_id uuid,
  p_paid_by uuid,
  p_description text,
  p_amount numeric,
  p_notes text,
  p_frequency text,
  p_next_run date,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  collection_archived_at timestamptz;
  rule_id uuid;
begin
  select member.role, collection.archived_at
  into caller_role, collection_archived_at
  from public.expense_collections as collection
  join public.expense_collection_members as member
    on member.collection_id = collection.id
   and member.user_id = caller_id
   and member.status = 'active'
  where collection.id = p_collection_id
  for update of collection;

  if caller_role not in ('owner', 'manager', 'contributor') or collection_archived_at is not null then
    raise exception 'Recurring expense permission required' using errcode = '42501';
  end if;
  if p_frequency not in ('weekly', 'monthly') or p_next_run is null then
    raise exception 'Invalid recurrence schedule' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.expense_collection_members as payer
    where payer.collection_id = p_collection_id
      and payer.user_id = p_paid_by
      and payer.status = 'active'
  ) then
    raise exception 'Recurring payer must be an active collection member'
      using errcode = '23514';
  end if;

  perform private.validate_expense_split_payload(p_collection_id, p_amount, p_splits);

  insert into public.recurring_expense_rules (
    collection_id,
    category_id,
    created_by,
    paid_by,
    description,
    amount,
    notes,
    frequency,
    next_run,
    day_of_month
  ) values (
    p_collection_id,
    p_category_id,
    caller_id,
    p_paid_by,
    btrim(p_description),
    p_amount,
    nullif(btrim(p_notes), ''),
    p_frequency,
    p_next_run,
    extract(day from p_next_run)::smallint
  ) returning id into rule_id;

  insert into public.recurring_expense_splits (rule_id, collection_id, user_id, amount)
  select rule_id, p_collection_id, payload.user_id, payload.amount
  from jsonb_to_recordset(p_splits) as payload(user_id uuid, amount numeric);

  return rule_id;
end;
$$;

create or replace function public.set_recurring_expense_rule_active(
  p_collection_id uuid,
  p_rule_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  rule_creator uuid;
begin
  select member.role, rule.created_by
  into caller_role, rule_creator
  from public.recurring_expense_rules as rule
  join public.expense_collection_members as member
    on member.collection_id = rule.collection_id
   and member.user_id = caller_id
   and member.status = 'active'
  where rule.collection_id = p_collection_id
    and rule.id = p_rule_id
  for update of rule;

  if rule_creator is null then
    raise exception 'Recurring rule not found' using errcode = 'P0002';
  end if;
  if not (caller_role in ('owner', 'manager') or rule_creator = caller_id) then
    raise exception 'Recurring rule update permission required' using errcode = '42501';
  end if;

  update public.recurring_expense_rules
  set active = p_active,
      updated_at = now()
  where id = p_rule_id;
end;
$$;

create or replace function private.next_recurring_expense_date(
  p_current date,
  p_frequency text,
  p_day_of_month integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  next_month date;
  last_day date;
begin
  if p_frequency = 'weekly' then
    return p_current + 7;
  end if;

  next_month := (date_trunc('month', p_current)::date + interval '1 month')::date;
  last_day := (next_month + interval '1 month - 1 day')::date;
  return make_date(
    extract(year from next_month)::integer,
    extract(month from next_month)::integer,
    least(p_day_of_month, extract(day from last_day)::integer)
  );
end;
$$;

create or replace function public.process_due_recurring_expenses(
  p_as_of date default current_date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_row public.recurring_expense_rules%rowtype;
  occurrence_date date;
  occurrence_id uuid;
  generated_count integer := 0;
begin
  if p_as_of is null then
    raise exception 'Processing date is required' using errcode = '22023';
  end if;

  for rule_row in
    select rule.*
    from public.recurring_expense_rules as rule
    join public.expense_collections as collection on collection.id = rule.collection_id
    where rule.active
      and rule.next_run <= p_as_of
      and collection.archived_at is null
    order by rule.next_run, rule.id
    for update of rule skip locked
  loop
    if not exists (
      select 1
      from public.expense_collection_members as creator
      where creator.collection_id = rule_row.collection_id
        and creator.user_id = rule_row.created_by
        and creator.status = 'active'
    ) or not exists (
      select 1
      from public.expense_collection_members as payer
      where payer.collection_id = rule_row.collection_id
        and payer.user_id = rule_row.paid_by
        and payer.status = 'active'
    ) or exists (
      select 1
      from public.recurring_expense_splits as split
      left join public.expense_collection_members as member
        on member.collection_id = split.collection_id
       and member.user_id = split.user_id
       and member.status = 'active'
      where split.rule_id = rule_row.id
        and member.user_id is null
    ) then
      update public.recurring_expense_rules
      set active = false,
          updated_at = now()
      where id = rule_row.id;
      continue;
    end if;

    occurrence_date := rule_row.next_run;
    while occurrence_date <= p_as_of loop
      occurrence_id := null;
      insert into public.expenses (
        collection_id,
        category_id,
        created_by,
        paid_by,
        description,
        amount,
        occurred_on,
        notes,
        recurring_rule_id,
        recurring_occurrence_on
      ) values (
        rule_row.collection_id,
        rule_row.category_id,
        rule_row.created_by,
        rule_row.paid_by,
        rule_row.description,
        rule_row.amount,
        occurrence_date,
        rule_row.notes,
        rule_row.id,
        occurrence_date
      )
      on conflict (recurring_rule_id, recurring_occurrence_on)
        where recurring_rule_id is not null
      do nothing
      returning id into occurrence_id;

      if occurrence_id is not null then
        insert into public.expense_splits (expense_id, collection_id, user_id, amount)
        select occurrence_id, split.collection_id, split.user_id, split.amount
        from public.recurring_expense_splits as split
        where split.rule_id = rule_row.id;
        generated_count := generated_count + 1;
      end if;

      occurrence_date := private.next_recurring_expense_date(
        occurrence_date,
        rule_row.frequency,
        rule_row.day_of_month
      );
    end loop;

    update public.recurring_expense_rules
    set next_run = occurrence_date,
        updated_at = now()
    where id = rule_row.id;
  end loop;

  return generated_count;
end;
$$;

create or replace function public.get_expense_balances(
  p_collection_id uuid,
  p_from date,
  p_to date
)
returns table (
  user_id uuid,
  paid numeric,
  owed numeric,
  balance numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with members as (
    select member.user_id
    from public.expense_collection_members as member
    where member.collection_id = p_collection_id
  ), paid_totals as (
    select expense.paid_by as user_id, sum(expense.amount) as amount
    from public.expenses as expense
    where expense.collection_id = p_collection_id
      and expense.occurred_on between p_from and p_to
    group by expense.paid_by
  ), owed_totals as (
    select split.user_id, sum(split.amount) as amount
    from public.expense_splits as split
    join public.expenses as expense on expense.id = split.expense_id
    where split.collection_id = p_collection_id
      and expense.occurred_on between p_from and p_to
    group by split.user_id
  )
  select
    members.user_id,
    coalesce(paid_totals.amount, 0)::numeric,
    coalesce(owed_totals.amount, 0)::numeric,
    (coalesce(paid_totals.amount, 0) - coalesce(owed_totals.amount, 0))::numeric
  from members
  left join paid_totals using (user_id)
  left join owed_totals using (user_id)
  order by members.user_id;
$$;

revoke all on function private.validate_split_participant() from public, anon, authenticated;
revoke all on function private.assert_expense_split_total() from public, anon, authenticated;
revoke all on function private.assert_recurring_split_total() from public, anon, authenticated;
revoke all on function private.validate_expense_split_payload(uuid, numeric, jsonb) from public, anon, authenticated;
revoke all on function private.next_recurring_expense_date(date, text, integer) from public, anon, authenticated;

revoke all on function public.create_expense_with_splits(uuid, uuid, uuid, text, numeric, date, text, text, jsonb) from public, anon;
revoke all on function public.update_expense_with_splits(uuid, uuid, bigint, uuid, uuid, text, numeric, date, text, text, jsonb) from public, anon;
revoke all on function public.create_recurring_expense_rule(uuid, uuid, uuid, text, numeric, text, text, date, jsonb) from public, anon;
revoke all on function public.set_recurring_expense_rule_active(uuid, uuid, boolean) from public, anon;
revoke all on function public.process_due_recurring_expenses(date) from public, anon, authenticated;
revoke all on function public.get_expense_balances(uuid, date, date) from public, anon;

grant execute on function public.create_expense_with_splits(uuid, uuid, uuid, text, numeric, date, text, text, jsonb) to authenticated;
grant execute on function public.update_expense_with_splits(uuid, uuid, bigint, uuid, uuid, text, numeric, date, text, text, jsonb) to authenticated;
grant execute on function public.create_recurring_expense_rule(uuid, uuid, uuid, text, numeric, text, text, date, jsonb) to authenticated;
grant execute on function public.set_recurring_expense_rule_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.process_due_recurring_expenses(date) to service_role;
grant execute on function public.get_expense_balances(uuid, date, date) to authenticated;

commit;
