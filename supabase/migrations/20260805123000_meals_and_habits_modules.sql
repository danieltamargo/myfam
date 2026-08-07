begin;

create table public.family_recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  instructions text check (instructions is null or char_length(instructions) <= 10000),
  servings smallint not null default 4 check (servings between 1 and 50),
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  family_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  quantity numeric(10, 3) check (quantity is null or (quantity > 0 and quantity <= 9999999)),
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 40),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  foreign key (family_id, recipe_id)
    references public.family_recipes(family_id, id) on delete cascade
);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipe_id uuid not null,
  created_by uuid not null references public.profiles(id),
  planned_on date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  notes text check (notes is null or char_length(notes) <= 1000),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, planned_on, meal_type),
  foreign key (family_id, recipe_id)
    references public.family_recipes(family_id, id) on delete restrict
);

create table public.family_habits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  visibility text not null default 'private'
    check (visibility in ('private', 'selected_members')),
  start_on date not null default current_date,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id)
);

create table public.family_habit_members (
  habit_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (habit_id, user_id),
  foreign key (family_id, habit_id)
    references public.family_habits(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.habit_completions (
  habit_id uuid not null,
  family_id uuid not null,
  completed_on date not null,
  completed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (habit_id, completed_on),
  foreign key (family_id, habit_id)
    references public.family_habits(family_id, id) on delete cascade,
  foreign key (family_id, completed_by)
    references public.family_members(family_id, user_id) on delete cascade
);

create index family_recipes_family_active_idx
  on public.family_recipes (family_id, updated_at desc, id)
  where archived_at is null;
create index family_recipes_created_by_idx
  on public.family_recipes (created_by, family_id, id);
create index recipe_ingredients_recipe_order_idx
  on public.recipe_ingredients (recipe_id, sort_order, id);
create index recipe_ingredients_family_idx
  on public.recipe_ingredients (family_id, recipe_id);
create index meal_plan_family_date_idx
  on public.meal_plan_entries (family_id, planned_on, meal_type);
create index meal_plan_recipe_idx
  on public.meal_plan_entries (recipe_id, planned_on);
create index meal_plan_created_by_idx
  on public.meal_plan_entries (created_by, family_id, planned_on);
create index family_habits_family_active_idx
  on public.family_habits (family_id, updated_at desc, id)
  where archived_at is null;
create index family_habits_created_by_idx
  on public.family_habits (created_by, family_id, id);
create index family_habit_members_user_idx
  on public.family_habit_members (user_id, family_id, habit_id);
create index family_habit_members_added_by_idx
  on public.family_habit_members (added_by, habit_id);
create index habit_completions_family_date_idx
  on public.habit_completions (family_id, completed_on desc, habit_id);
create index habit_completions_completed_by_idx
  on public.habit_completions (completed_by, completed_on desc);

alter table public.family_recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.family_habits enable row level security;
alter table public.family_habit_members enable row level security;
alter table public.habit_completions enable row level security;

create or replace function private.can_view_family_recipe(p_recipe_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_recipes as recipe
      join public.family_members as member
        on member.family_id = recipe.family_id
       and member.user_id = p_user_id
      where recipe.id = p_recipe_id
    );
$$;

create or replace function private.can_manage_family_recipe(p_recipe_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_recipes as recipe
      join public.family_members as member
        on member.family_id = recipe.family_id
       and member.user_id = p_user_id
      where recipe.id = p_recipe_id
        and (recipe.created_by = p_user_id or member.role in ('owner', 'admin'))
    );
$$;

create or replace function private.can_view_family_habit(p_habit_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_habits as habit
      join public.family_members as member
        on member.family_id = habit.family_id
       and member.user_id = p_user_id
      where habit.id = p_habit_id
        and (
          habit.created_by = p_user_id
          or exists (
            select 1
            from public.family_habit_members as selected_member
            where selected_member.habit_id = habit.id
              and selected_member.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_manage_family_habit(p_habit_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_habits as habit
      join public.family_members as member
        on member.family_id = habit.family_id
       and member.user_id = p_user_id
      where habit.id = p_habit_id
        and habit.created_by = p_user_id
    );
$$;

revoke all on function private.can_view_family_recipe(uuid, uuid) from public, anon;
revoke all on function private.can_manage_family_recipe(uuid, uuid) from public, anon;
revoke all on function private.can_view_family_habit(uuid, uuid) from public, anon;
revoke all on function private.can_manage_family_habit(uuid, uuid) from public, anon;
grant execute on function private.can_view_family_recipe(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_family_recipe(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_family_habit(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_family_habit(uuid, uuid) to authenticated, service_role;

create policy family_recipes_select_family
  on public.family_recipes for select to authenticated
  using (private.can_view_family_recipe(id, (select auth.uid())));
create policy recipe_ingredients_select_family
  on public.recipe_ingredients for select to authenticated
  using (private.can_view_family_recipe(recipe_id, (select auth.uid())));
create policy meal_plan_entries_select_family
  on public.meal_plan_entries for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy family_habits_select_visible
  on public.family_habits for select to authenticated
  using (private.can_view_family_habit(id, (select auth.uid())));
create policy family_habit_members_select_visible
  on public.family_habit_members for select to authenticated
  using (private.can_view_family_habit(habit_id, (select auth.uid())));
create policy habit_completions_select_visible
  on public.habit_completions for select to authenticated
  using (private.can_view_family_habit(habit_id, (select auth.uid())));

grant select on table public.family_recipes to authenticated;
grant select on table public.recipe_ingredients to authenticated;
grant select on table public.meal_plan_entries to authenticated;
grant select on table public.family_habits to authenticated;
grant select on table public.family_habit_members to authenticated;
grant select on table public.habit_completions to authenticated;
revoke insert, update, delete on table public.family_recipes from authenticated;
revoke insert, update, delete on table public.recipe_ingredients from authenticated;
revoke insert, update, delete on table public.meal_plan_entries from authenticated;
revoke insert, update, delete on table public.family_habits from authenticated;
revoke insert, update, delete on table public.family_habit_members from authenticated;
revoke insert, update, delete on table public.habit_completions from authenticated;

create or replace function private.bump_meal_habit_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger bump_family_recipe_version_before_update
  before update on public.family_recipes
  for each row execute function private.bump_meal_habit_version();
create trigger bump_meal_plan_version_before_update
  before update on public.meal_plan_entries
  for each row execute function private.bump_meal_habit_version();
create trigger bump_family_habit_version_before_update
  before update on public.family_habits
  for each row execute function private.bump_meal_habit_version();
revoke all on function private.bump_meal_habit_version() from public, anon, authenticated;

create or replace function public.create_family_recipe(
  p_family_id uuid,
  p_title text,
  p_description text,
  p_instructions text,
  p_servings integer,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_recipe_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  if p_ingredients is null
    or jsonb_typeof(p_ingredients) <> 'array'
    or jsonb_array_length(p_ingredients) < 1
    or jsonb_array_length(p_ingredients) > 50
  then
    raise exception 'Recipe requires between 1 and 50 ingredients' using errcode = '22023';
  end if;

  insert into public.family_recipes (
    family_id, created_by, title, description, instructions, servings
  ) values (
    p_family_id,
    caller_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    nullif(btrim(p_instructions), ''),
    p_servings
  ) returning id into new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, family_id, name, quantity, unit, sort_order
  )
  select
    new_recipe_id,
    p_family_id,
    btrim(ingredient.name),
    ingredient.quantity,
    nullif(btrim(ingredient.unit), ''),
    source.ordinality::integer * 1000
  from jsonb_array_elements(p_ingredients) with ordinality as source(value, ordinality)
  cross join lateral jsonb_to_record(source.value)
    as ingredient(name text, quantity numeric, unit text);

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'meals.recipe_created', 'meals', 'family_recipe',
    new_recipe_id, jsonb_build_object('ingredient_count', jsonb_array_length(p_ingredients))
  );
  return new_recipe_id;
end;
$$;

create or replace function public.schedule_family_meal(
  p_family_id uuid,
  p_recipe_id uuid,
  p_planned_on date,
  p_meal_type text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entry_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  if p_planned_on < current_date - 31 or p_planned_on > current_date + 366 then
    raise exception 'Meal date outside allowed range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.family_recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.family_id = p_family_id
      and recipe.archived_at is null
  ) then
    raise exception 'Recipe not available in family' using errcode = '23503';
  end if;

  insert into public.meal_plan_entries (
    family_id, recipe_id, created_by, planned_on, meal_type, notes
  ) values (
    p_family_id, p_recipe_id, caller_id, p_planned_on, p_meal_type,
    nullif(btrim(p_notes), '')
  )
  on conflict (family_id, planned_on, meal_type) do update
  set recipe_id = excluded.recipe_id,
      created_by = caller_id,
      notes = excluded.notes
  returning id into entry_id;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'meals.meal_scheduled', 'meals', 'meal_plan_entry',
    entry_id, jsonb_build_object('planned_on', p_planned_on, 'meal_type', p_meal_type)
  );
  return entry_id;
end;
$$;

create or replace function public.remove_family_meal(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entry_row public.meal_plan_entries%rowtype;
begin
  select * into entry_row from public.meal_plan_entries where id = p_entry_id for update;
  if entry_row.id is null then
    raise exception 'Meal entry not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.is_family_member(entry_row.family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  delete from public.meal_plan_entries where id = p_entry_id;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    entry_row.family_id, caller_id, 'meals.meal_removed', 'meals', 'meal_plan_entry',
    p_entry_id, jsonb_build_object('planned_on', entry_row.planned_on)
  );
end;
$$;

create or replace function public.copy_recipe_ingredients_to_list(
  p_recipe_id uuid,
  p_list_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  recipe_row public.family_recipes%rowtype;
  list_row public.family_lists%rowtype;
  base_order bigint;
  inserted_count integer;
begin
  select * into recipe_row from public.family_recipes where id = p_recipe_id;
  select * into list_row from public.family_lists where id = p_list_id for update;
  if recipe_row.id is null or recipe_row.archived_at is not null then
    raise exception 'Recipe not found' using errcode = 'P0002';
  end if;
  if list_row.id is null or list_row.archived_at is not null then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  if caller_id is null
    or not private.can_view_family_recipe(p_recipe_id, caller_id)
    or not private.can_edit_family_list(p_list_id, caller_id)
  then
    raise exception 'List edit permission required' using errcode = '42501';
  end if;
  if recipe_row.family_id <> list_row.family_id then
    raise exception 'Recipe and list must belong to the same family' using errcode = '23503';
  end if;

  select coalesce(max(item.sort_order), 0)
  into base_order
  from public.family_list_items as item
  where item.list_id = p_list_id;

  insert into public.family_list_items (
    list_id, created_by, title, quantity, unit, sort_order
  )
  select
    p_list_id,
    caller_id,
    ingredient.name,
    coalesce(ingredient.quantity, 1),
    ingredient.unit,
    base_order + row_number() over (order by ingredient.sort_order, ingredient.id) * 1000
  from public.recipe_ingredients as ingredient
  where ingredient.recipe_id = p_recipe_id;
  get diagnostics inserted_count = row_count;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    recipe_row.family_id, caller_id, 'meals.ingredients_copied', 'meals', 'family_recipe',
    p_recipe_id, jsonb_build_object('list_id', p_list_id, 'ingredient_count', inserted_count)
  );
  return inserted_count;
end;
$$;

create or replace function public.create_family_habit(
  p_family_id uuid,
  p_title text,
  p_description text,
  p_visibility text default 'private',
  p_member_ids uuid[] default array[]::uuid[],
  p_start_on date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_habit_id uuid;
  selected_count integer;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  if p_start_on < current_date - 366 or p_start_on > current_date + 30 then
    raise exception 'Habit start date outside allowed range' using errcode = '22023';
  end if;
  perform private.validate_family_member_ids(p_family_id, p_member_ids);
  select count(distinct requested.user_id)
  into selected_count
  from unnest(coalesce(p_member_ids, array[]::uuid[])) as requested(user_id)
  where requested.user_id <> caller_id;
  if p_visibility = 'private' and selected_count > 0 then
    raise exception 'Private habits cannot have selected members' using errcode = '22023';
  end if;
  if p_visibility = 'selected_members' and selected_count = 0 then
    raise exception 'Selected habits require another family member' using errcode = '22023';
  end if;

  insert into public.family_habits (
    family_id, created_by, title, description, visibility, start_on
  ) values (
    p_family_id, caller_id, btrim(p_title), nullif(btrim(p_description), ''),
    p_visibility, p_start_on
  ) returning id into new_habit_id;

  if p_visibility = 'selected_members' then
    insert into public.family_habit_members (habit_id, family_id, user_id, added_by)
    select new_habit_id, p_family_id, requested.user_id, caller_id
    from (
      select distinct user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where user_id <> caller_id
    ) as requested;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'habits.habit_created', 'habits', 'family_habit',
    new_habit_id, jsonb_build_object('visibility', p_visibility, 'selected_count', selected_count)
  );
  return new_habit_id;
end;
$$;

create or replace function public.set_family_habit_completion(
  p_habit_id uuid,
  p_completed_on date,
  p_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  habit_row public.family_habits%rowtype;
begin
  select * into habit_row from public.family_habits where id = p_habit_id for update;
  if habit_row.id is null or habit_row.archived_at is not null then
    raise exception 'Habit not found' using errcode = 'P0002';
  end if;
  if caller_id is null or not private.can_manage_family_habit(p_habit_id, caller_id) then
    raise exception 'Habit author permission required' using errcode = '42501';
  end if;
  if p_completed_on < habit_row.start_on
    or p_completed_on < current_date - 366
    or p_completed_on > current_date
  then
    raise exception 'Completion date outside allowed range' using errcode = '22023';
  end if;

  if p_completed then
    insert into public.habit_completions (habit_id, family_id, completed_on, completed_by)
    values (p_habit_id, habit_row.family_id, p_completed_on, caller_id)
    on conflict (habit_id, completed_on) do nothing;
  else
    delete from public.habit_completions
    where habit_id = p_habit_id and completed_on = p_completed_on;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    habit_row.family_id, caller_id, 'habits.completion_changed', 'habits', 'family_habit',
    p_habit_id, jsonb_build_object('completed_on', p_completed_on, 'completed', p_completed)
  );
  return p_completed;
end;
$$;

create or replace function public.archive_family_habit(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  habit_family_id uuid;
begin
  if caller_id is null or not private.can_manage_family_habit(p_habit_id, caller_id) then
    raise exception 'Habit author permission required' using errcode = '42501';
  end if;
  update public.family_habits
  set archived_at = coalesce(archived_at, now())
  where id = p_habit_id
  returning family_id into habit_family_id;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    habit_family_id, caller_id, 'habits.habit_archived', 'habits', 'family_habit',
    p_habit_id, '{}'::jsonb
  );
end;
$$;

revoke all on function public.create_family_recipe(uuid, text, text, text, integer, jsonb) from public, anon;
revoke all on function public.schedule_family_meal(uuid, uuid, date, text, text) from public, anon;
revoke all on function public.remove_family_meal(uuid) from public, anon;
revoke all on function public.copy_recipe_ingredients_to_list(uuid, uuid) from public, anon;
revoke all on function public.create_family_habit(uuid, text, text, text, uuid[], date) from public, anon;
revoke all on function public.set_family_habit_completion(uuid, date, boolean) from public, anon;
revoke all on function public.archive_family_habit(uuid) from public, anon;
grant execute on function public.create_family_recipe(uuid, text, text, text, integer, jsonb) to authenticated;
grant execute on function public.schedule_family_meal(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.remove_family_meal(uuid) to authenticated;
grant execute on function public.copy_recipe_ingredients_to_list(uuid, uuid) to authenticated;
grant execute on function public.create_family_habit(uuid, text, text, text, uuid[], date) to authenticated;
grant execute on function public.set_family_habit_completion(uuid, date, boolean) to authenticated;
grant execute on function public.archive_family_habit(uuid) to authenticated;

comment on table public.family_recipes is 'Shared family recipes used by the weekly meal planner.';
comment on table public.meal_plan_entries is 'Weekly meal plan projection backed by family recipes.';
comment on table public.family_habits is 'Private-by-default habits optionally visible to selected family members.';
comment on table public.habit_completions is 'Daily habit check-ins without public streaks, scores, or rankings.';

commit;
