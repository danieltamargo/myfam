begin;

create table public.task_groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  unique (family_id, name)
);

create table public.family_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  group_id uuid,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  due_on date,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'completed', 'cancelled')),
  recurrence_frequency text not null default 'none'
    check (recurrence_frequency in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_interval smallint not null default 1
    check (recurrence_interval between 1 and 30),
  recurrence_until date,
  version bigint not null default 1 check (version > 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, group_id)
    references public.task_groups(family_id, id) on delete set null,
  check (
    (recurrence_frequency = 'none' and recurrence_until is null)
    or (
      recurrence_frequency <> 'none'
      and due_on is not null
      and recurrence_until is not null
      and recurrence_until >= due_on
      and recurrence_until <= due_on + 730
    )
  ),
  check (
    (status = 'completed' and completed_at is not null and completed_by is not null)
    or (status <> 'completed' and completed_at is null and completed_by is null)
  )
);

create table public.task_assignees (
  task_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (family_id, task_id)
    references public.family_tasks(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.task_mentions (
  task_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mentioned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id),
  foreign key (family_id, task_id)
    references public.family_tasks(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.family_tasks(id) on delete cascade,
  family_id uuid not null,
  completed_by uuid not null references public.profiles(id),
  occurrence_due_on date,
  completed_at timestamptz not null default now(),
  unique (task_id, occurrence_due_on, completed_at),
  foreign key (family_id, task_id)
    references public.family_tasks(family_id, id) on delete cascade,
  foreign key (family_id, completed_by)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.task_due_deliveries (
  task_id uuid not null references public.family_tasks(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  due_on date not null,
  delivered_at timestamptz not null default now(),
  primary key (task_id, recipient_id, due_on)
);

create table public.family_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  visibility text not null default 'family'
    check (visibility in ('family', 'private', 'selected_members')),
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id)
);

create table public.family_list_members (
  list_id uuid not null,
  family_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (list_id, user_id),
  foreign key (family_id, list_id)
    references public.family_lists(family_id, id) on delete cascade,
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade
);

create table public.family_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.family_lists(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  quantity numeric(10, 3) not null default 1 check (quantity > 0 and quantity <= 9999999),
  unit text check (unit is null or char_length(unit) <= 40),
  sort_order bigint not null check (sort_order >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (completed_at is null and completed_by is null)
    or (completed_at is not null and completed_by is not null)
  )
);

create index task_groups_family_active_idx
  on public.task_groups (family_id, name, id)
  where archived_at is null;
create index family_tasks_family_status_due_idx
  on public.family_tasks (family_id, status, due_on, id);
create index family_tasks_group_idx
  on public.family_tasks (group_id, status, due_on)
  where group_id is not null;
create index family_tasks_created_by_idx
  on public.family_tasks (created_by, family_id, status);
create index task_assignees_user_task_idx
  on public.task_assignees (user_id, family_id, task_id);
create index task_mentions_user_task_idx
  on public.task_mentions (user_id, family_id, task_id);
create index task_completions_task_completed_idx
  on public.task_completions (task_id, completed_at desc);
create index task_due_pending_idx
  on public.family_tasks (due_on, id)
  where due_on is not null and status in ('todo', 'in_progress');
create index family_lists_family_active_idx
  on public.family_lists (family_id, updated_at desc, id)
  where archived_at is null;
create index family_list_members_user_list_idx
  on public.family_list_members (user_id, family_id, list_id);
create index family_list_items_list_order_idx
  on public.family_list_items (list_id, completed_at nulls first, sort_order, id);
create index family_list_items_completed_by_idx
  on public.family_list_items (completed_by, list_id)
  where completed_by is not null;

alter table public.task_groups enable row level security;
alter table public.family_tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_mentions enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_due_deliveries enable row level security;
alter table public.family_lists enable row level security;
alter table public.family_list_members enable row level security;
alter table public.family_list_items enable row level security;

create or replace function private.can_manage_family_task(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_tasks as task
      join public.family_members as member
        on member.family_id = task.family_id
       and member.user_id = p_user_id
      where task.id = p_task_id
        and (
          task.created_by = p_user_id
          or member.role in ('owner', 'admin')
        )
    );
$$;

create or replace function private.can_change_family_task_status(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_family_task(p_task_id, p_user_id)
    or exists (
      select 1
      from public.task_assignees as assignee
      join public.family_tasks as task on task.id = assignee.task_id
      join public.family_members as member
        on member.family_id = task.family_id
       and member.user_id = p_user_id
      where assignee.task_id = p_task_id
        and assignee.user_id = p_user_id
    );
$$;

create or replace function private.can_view_family_list(p_list_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_lists as list
      join public.family_members as member
        on member.family_id = list.family_id
       and member.user_id = p_user_id
      where list.id = p_list_id
        and (
          list.visibility = 'family'
          or list.created_by = p_user_id
          or exists (
            select 1 from public.family_list_members as list_member
            where list_member.list_id = list.id and list_member.user_id = p_user_id
          )
        )
    );
$$;

create or replace function private.can_edit_family_list(p_list_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.family_lists as list
      join public.family_members as member
        on member.family_id = list.family_id
       and member.user_id = p_user_id
      where list.id = p_list_id
        and (
          list.created_by = p_user_id
          or list.visibility = 'family'
          or exists (
            select 1 from public.family_list_members as list_member
            where list_member.list_id = list.id
              and list_member.user_id = p_user_id
              and list_member.role in ('owner', 'editor')
          )
        )
    );
$$;

create or replace function private.validate_family_member_ids(
  p_family_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as requested(user_id)
    left join public.family_members as member
      on member.family_id = p_family_id and member.user_id = requested.user_id
    where member.user_id is null
  ) then
    raise exception 'Every selected user must belong to the family' using errcode = '23503';
  end if;
end;
$$;

create or replace function private.next_task_due_on(
  p_due_on date,
  p_frequency text,
  p_interval integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_frequency
    when 'daily' then p_due_on + p_interval
    when 'weekly' then p_due_on + (p_interval * 7)
    when 'monthly' then (
      case
        when p_due_on = (date_trunc('month', p_due_on) + interval '1 month - 1 day')::date
          then (date_trunc('month', p_due_on) + make_interval(months => p_interval + 1) - interval '1 day')::date
        else (p_due_on + make_interval(months => p_interval))::date
      end
    )
    else p_due_on
  end;
$$;

revoke all on function private.can_manage_family_task(uuid, uuid) from public, anon;
revoke all on function private.can_change_family_task_status(uuid, uuid) from public, anon;
revoke all on function private.can_view_family_list(uuid, uuid) from public, anon;
revoke all on function private.can_edit_family_list(uuid, uuid) from public, anon;
revoke all on function private.validate_family_member_ids(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.next_task_due_on(date, text, integer) from public, anon, authenticated;
grant execute on function private.can_manage_family_task(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_change_family_task_status(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_family_list(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_edit_family_list(uuid, uuid) to authenticated, service_role;

create policy task_groups_select_family
  on public.task_groups for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy family_tasks_select_family
  on public.family_tasks for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy task_assignees_select_family
  on public.task_assignees for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy task_mentions_select_family
  on public.task_mentions for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy task_completions_select_family
  on public.task_completions for select to authenticated
  using (private.is_family_member(family_id, (select auth.uid())));
create policy family_lists_select_visible
  on public.family_lists for select to authenticated
  using (private.can_view_family_list(id, (select auth.uid())));
create policy family_list_members_select_visible
  on public.family_list_members for select to authenticated
  using (private.can_view_family_list(list_id, (select auth.uid())));
create policy family_list_items_select_visible
  on public.family_list_items for select to authenticated
  using (private.can_view_family_list(list_id, (select auth.uid())));

grant select on table public.task_groups to authenticated;
grant select on table public.family_tasks to authenticated;
grant select on table public.task_assignees to authenticated;
grant select on table public.task_mentions to authenticated;
grant select on table public.task_completions to authenticated;
grant select on table public.family_lists to authenticated;
grant select on table public.family_list_members to authenticated;
grant select on table public.family_list_items to authenticated;
revoke all on table public.task_due_deliveries from anon, authenticated;
revoke insert, update, delete on table public.task_groups from anon, authenticated;
revoke insert, update, delete on table public.family_tasks from anon, authenticated;
revoke insert, update, delete on table public.task_assignees from anon, authenticated;
revoke insert, update, delete on table public.task_mentions from anon, authenticated;
revoke insert, update, delete on table public.task_completions from anon, authenticated;
revoke insert, update, delete on table public.family_lists from anon, authenticated;
revoke insert, update, delete on table public.family_list_members from anon, authenticated;
revoke insert, update, delete on table public.family_list_items from anon, authenticated;
grant all privileges on table public.task_groups to service_role;
grant all privileges on table public.family_tasks to service_role;
grant all privileges on table public.task_assignees to service_role;
grant all privileges on table public.task_mentions to service_role;
grant all privileges on table public.task_completions to service_role;
grant all privileges on table public.task_due_deliveries to service_role;
grant all privileges on table public.family_lists to service_role;
grant all privileges on table public.family_list_members to service_role;
grant all privileges on table public.family_list_items to service_role;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'mention', 'comment', 'invitation', 'gift_status', 'family_join',
    'game_finished', 'game_won', 'game_invite', 'calendar_reminder',
    'task_assigned', 'task_due', 'task_mention'
  ));

create or replace function private.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default null,
  p_link text default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  if p_type <> all(array[
    'mention', 'comment', 'invitation', 'gift_status', 'family_join',
    'game_finished', 'game_won', 'game_invite', 'calendar_reminder',
    'task_assigned', 'task_due', 'task_mention'
  ]) then
    raise exception 'Unsupported notification type' using errcode = '22023';
  end if;

  if p_link is not null
    and p_link <> '/dashboard'
    and p_link !~ '^/family/[0-9a-fA-F-]{36}/(members|wishlist|expenses|calendar|tasks|lists|notes|planner|meals|habits|documents)([/?#].*)?$'
  then
    raise exception 'Unsupported notification link' using errcode = '22023';
  end if;

  insert into public.notifications (
    user_id, type, title, message, link, reference_type, reference_id
  ) values (
    p_user_id, p_type, left(btrim(p_title), 160), p_message, p_link,
    p_reference_type, p_reference_id
  ) returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function private.create_notification(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.create_notification(uuid, text, text, text, text, text, uuid)
  to service_role;

create or replace function private.notify_task_people(
  p_task_id uuid,
  p_assignee_ids uuid[],
  p_mention_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.family_tasks%rowtype;
  recipient_id uuid;
begin
  select * into task_row from public.family_tasks where id = p_task_id;

  for recipient_id in
    select distinct requested.user_id
    from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as requested(user_id)
    where requested.user_id <> task_row.created_by
  loop
    perform private.create_notification(
      recipient_id,
      'task_assigned',
      'Nueva tarea: ' || task_row.title,
      'Te han asignado una tarea familiar.',
      format('/family/%s/tasks?task=%s', task_row.family_id, task_row.id),
      'family_task',
      task_row.id
    );
  end loop;

  for recipient_id in
    select distinct requested.user_id
    from unnest(coalesce(p_mention_ids, array[]::uuid[])) as requested(user_id)
    where requested.user_id <> task_row.created_by
  loop
    perform private.create_notification(
      recipient_id,
      'task_mention',
      'Te han mencionado en una tarea',
      task_row.title,
      format('/family/%s/tasks?task=%s', task_row.family_id, task_row.id),
      'family_task',
      task_row.id
    );
  end loop;
end;
$$;

revoke all on function private.notify_task_people(uuid, uuid[], uuid[])
  from public, anon, authenticated;

create or replace function public.create_task_group(p_family_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  group_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;

  insert into public.task_groups (family_id, created_by, name)
  values (p_family_id, caller_id, btrim(p_name))
  returning id into group_id;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id
  ) values (
    p_family_id, caller_id, 'tasks.group_created', 'tasks', 'task_group', group_id
  );
  return group_id;
end;
$$;

create or replace function public.create_family_task(
  p_family_id uuid,
  p_group_id uuid,
  p_title text,
  p_description text,
  p_due_on date,
  p_priority text,
  p_assignee_ids uuid[],
  p_mention_ids uuid[],
  p_recurrence_frequency text default 'none',
  p_recurrence_interval integer default 1,
  p_recurrence_until date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  task_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.task_groups as task_group
    where task_group.id = p_group_id
      and task_group.family_id = p_family_id
      and task_group.archived_at is null
  ) then
    raise exception 'Task group does not belong to family' using errcode = '23503';
  end if;

  perform private.validate_family_member_ids(p_family_id, p_assignee_ids);
  perform private.validate_family_member_ids(p_family_id, p_mention_ids);

  insert into public.family_tasks (
    family_id, group_id, created_by, title, description, due_on, priority,
    recurrence_frequency, recurrence_interval, recurrence_until
  ) values (
    p_family_id, p_group_id, caller_id, btrim(p_title), nullif(btrim(p_description), ''),
    p_due_on, p_priority, p_recurrence_frequency, p_recurrence_interval, p_recurrence_until
  ) returning id into task_id;

  insert into public.task_assignees (task_id, family_id, user_id, assigned_by)
  select task_id, p_family_id, requested.user_id, caller_id
  from (select distinct user_id from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as input(user_id)) as requested;

  insert into public.task_mentions (task_id, family_id, user_id, mentioned_by)
  select task_id, p_family_id, requested.user_id, caller_id
  from (select distinct user_id from unnest(coalesce(p_mention_ids, array[]::uuid[])) as input(user_id)) as requested;

  perform private.notify_task_people(task_id, p_assignee_ids, p_mention_ids);

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'tasks.task_created', 'tasks', 'family_task', task_id,
    jsonb_build_object('priority', p_priority, 'recurrence', p_recurrence_frequency)
  );
  return task_id;
end;
$$;

create or replace function public.update_family_task(
  p_task_id uuid,
  p_version bigint,
  p_group_id uuid,
  p_title text,
  p_description text,
  p_due_on date,
  p_priority text,
  p_assignee_ids uuid[],
  p_mention_ids uuid[],
  p_recurrence_frequency text default 'none',
  p_recurrence_interval integer default 1,
  p_recurrence_until date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  task_row public.family_tasks%rowtype;
  new_assignee_ids uuid[];
  new_mention_ids uuid[];
begin
  select * into task_row from public.family_tasks where id = p_task_id for update;
  if task_row.id is null then
    raise exception 'Family task not found' using errcode = 'P0002';
  end if;
  if not private.can_manage_family_task(p_task_id, caller_id) then
    raise exception 'Family task permission denied' using errcode = '42501';
  end if;
  if task_row.version <> p_version then
    raise exception 'Family task changed concurrently' using errcode = '40001';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.task_groups as task_group
    where task_group.id = p_group_id
      and task_group.family_id = task_row.family_id
      and task_group.archived_at is null
  ) then
    raise exception 'Task group does not belong to family' using errcode = '23503';
  end if;

  perform private.validate_family_member_ids(task_row.family_id, p_assignee_ids);
  perform private.validate_family_member_ids(task_row.family_id, p_mention_ids);

  select coalesce(array_agg(requested.user_id), array[]::uuid[]) into new_assignee_ids
  from (
    select distinct input.user_id
    from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as input(user_id)
    where not exists (
      select 1 from public.task_assignees as existing
      where existing.task_id = p_task_id and existing.user_id = input.user_id
    )
  ) as requested;
  select coalesce(array_agg(requested.user_id), array[]::uuid[]) into new_mention_ids
  from (
    select distinct input.user_id
    from unnest(coalesce(p_mention_ids, array[]::uuid[])) as input(user_id)
    where not exists (
      select 1 from public.task_mentions as existing
      where existing.task_id = p_task_id and existing.user_id = input.user_id
    )
  ) as requested;

  update public.family_tasks
  set group_id = p_group_id,
      title = btrim(p_title),
      description = nullif(btrim(p_description), ''),
      due_on = p_due_on,
      priority = p_priority,
      recurrence_frequency = p_recurrence_frequency,
      recurrence_interval = p_recurrence_interval,
      recurrence_until = p_recurrence_until,
      version = version + 1,
      updated_at = now()
  where id = p_task_id;

  delete from public.task_assignees where task_id = p_task_id;
  insert into public.task_assignees (task_id, family_id, user_id, assigned_by)
  select p_task_id, task_row.family_id, requested.user_id, caller_id
  from (select distinct user_id from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as input(user_id)) as requested;

  delete from public.task_mentions where task_id = p_task_id;
  insert into public.task_mentions (task_id, family_id, user_id, mentioned_by)
  select p_task_id, task_row.family_id, requested.user_id, caller_id
  from (select distinct user_id from unnest(coalesce(p_mention_ids, array[]::uuid[])) as input(user_id)) as requested;

  perform private.notify_task_people(p_task_id, new_assignee_ids, new_mention_ids);

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    task_row.family_id, caller_id, 'tasks.task_updated', 'tasks', 'family_task', p_task_id,
    jsonb_build_object('previous_version', p_version)
  );
end;
$$;

create or replace function public.set_family_task_status(
  p_task_id uuid,
  p_version bigint,
  p_status text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  task_row public.family_tasks%rowtype;
  next_due date;
  new_version bigint;
begin
  select * into task_row from public.family_tasks where id = p_task_id for update;
  if task_row.id is null then
    raise exception 'Family task not found' using errcode = 'P0002';
  end if;
  if not private.can_change_family_task_status(p_task_id, caller_id) then
    raise exception 'Family task permission denied' using errcode = '42501';
  end if;
  if task_row.version <> p_version then
    raise exception 'Family task changed concurrently' using errcode = '40001';
  end if;
  if p_status not in ('todo', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Invalid task status' using errcode = '22023';
  end if;

  if p_status = 'completed' then
    insert into public.task_completions (task_id, family_id, completed_by, occurrence_due_on)
    values (p_task_id, task_row.family_id, caller_id, task_row.due_on);

    if task_row.recurrence_frequency <> 'none' then
      next_due := private.next_task_due_on(
        task_row.due_on,
        task_row.recurrence_frequency,
        task_row.recurrence_interval
      );
    end if;

    if next_due is not null and next_due <= task_row.recurrence_until then
      update public.family_tasks
      set status = 'todo', due_on = next_due, completed_at = null, completed_by = null,
          version = version + 1, updated_at = now()
      where id = p_task_id
      returning version into new_version;
    else
      update public.family_tasks
      set status = 'completed', completed_at = now(), completed_by = caller_id,
          version = version + 1, updated_at = now()
      where id = p_task_id
      returning version into new_version;
    end if;
  else
    update public.family_tasks
    set status = p_status, completed_at = null, completed_by = null,
        version = version + 1, updated_at = now()
    where id = p_task_id
    returning version into new_version;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    task_row.family_id, caller_id, 'tasks.status_changed', 'tasks', 'family_task', p_task_id,
    jsonb_build_object('from', task_row.status, 'requested', p_status, 'next_due_on', next_due)
  );
  return new_version;
end;
$$;

create or replace function public.process_task_due_notifications(
  p_today date default current_date,
  p_limit integer default 200
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row record;
  recipient_id uuid;
  inserted_delivery uuid;
  processed integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_limit not between 1 and 1000 then
    raise exception 'Invalid task notification batch size' using errcode = '22023';
  end if;

  for task_row in
    select task.id, task.family_id, task.created_by, task.title, task.due_on
    from public.family_tasks as task
    where task.due_on is not null
      and task.due_on <= p_today
      and task.status in ('todo', 'in_progress')
    order by task.due_on, task.id
    for update of task skip locked
    limit p_limit
  loop
    for recipient_id in
      select distinct recipient.user_id
      from (
        select assignee.user_id
        from public.task_assignees as assignee
        where assignee.task_id = task_row.id
        union all
        select task_row.created_by
        where not exists (
          select 1 from public.task_assignees as assignee
          where assignee.task_id = task_row.id
        )
      ) as recipient
    loop
      inserted_delivery := null;
      insert into public.task_due_deliveries (task_id, recipient_id, due_on)
      values (task_row.id, recipient_id, task_row.due_on)
      on conflict do nothing
      returning task_id into inserted_delivery;

      if inserted_delivery is not null then
        perform private.create_notification(
          recipient_id,
          'task_due',
          'Tarea pendiente: ' || task_row.title,
          case when task_row.due_on < p_today then 'Esta tarea está vencida.' else 'Esta tarea vence hoy.' end,
          format('/family/%s/tasks?task=%s', task_row.family_id, task_row.id),
          'family_task',
          task_row.id
        );
        processed := processed + 1;
      end if;
    end loop;
  end loop;
  return processed;
end;
$$;

create or replace function public.create_family_list(
  p_family_id uuid,
  p_title text,
  p_description text,
  p_visibility text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_list_id uuid;
begin
  if caller_id is null or not private.is_family_member(p_family_id, caller_id) then
    raise exception 'Family membership required' using errcode = '42501';
  end if;
  perform private.validate_family_member_ids(p_family_id, p_member_ids);

  insert into public.family_lists (family_id, created_by, title, description, visibility)
  values (p_family_id, caller_id, btrim(p_title), nullif(btrim(p_description), ''), p_visibility)
  returning id into new_list_id;

  insert into public.family_list_members (list_id, family_id, user_id, role, added_by)
  values (new_list_id, p_family_id, caller_id, 'owner', caller_id);

  if p_visibility = 'selected_members' then
    insert into public.family_list_members (list_id, family_id, user_id, role, added_by)
    select new_list_id, p_family_id, requested.user_id, 'editor', caller_id
    from (
      select distinct user_id
      from unnest(coalesce(p_member_ids, array[]::uuid[])) as input(user_id)
      where user_id <> caller_id
    ) as requested
    on conflict on constraint family_list_members_pkey do nothing;
  end if;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    p_family_id, caller_id, 'lists.list_created', 'lists', 'family_list', new_list_id,
    jsonb_build_object('visibility', p_visibility)
  );
  return new_list_id;
end;
$$;

create or replace function public.add_family_list_item(
  p_list_id uuid,
  p_title text,
  p_quantity numeric,
  p_unit text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  list_row public.family_lists%rowtype;
  item_id uuid;
  next_order bigint;
begin
  select * into list_row from public.family_lists where id = p_list_id for update;
  if list_row.id is null then
    raise exception 'Family list not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_family_list(p_list_id, caller_id) then
    raise exception 'Family list permission denied' using errcode = '42501';
  end if;
  if list_row.archived_at is not null then
    raise exception 'Family list is archived' using errcode = '22023';
  end if;

  select coalesce(max(item.sort_order), 0) + 1024 into next_order
  from public.family_list_items as item
  where item.list_id = p_list_id;

  insert into public.family_list_items (
    list_id, created_by, title, quantity, unit, sort_order
  ) values (
    p_list_id, caller_id, btrim(p_title), p_quantity, nullif(btrim(p_unit), ''), next_order
  ) returning id into item_id;

  update public.family_lists
  set version = version + 1, updated_at = now()
  where id = p_list_id;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id,
    metadata
  ) values (
    list_row.family_id, caller_id, 'lists.item_added', 'lists', 'family_list_item', item_id,
    jsonb_build_object('list_id', p_list_id)
  );
  return item_id;
end;
$$;

create or replace function public.set_family_list_item_completed(
  p_item_id uuid,
  p_version bigint,
  p_completed boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  item_row public.family_list_items%rowtype;
  list_row public.family_lists%rowtype;
  new_version bigint;
begin
  select * into item_row
  from public.family_list_items as item
  where item.id = p_item_id
  for update;
  if item_row.id is null then
    raise exception 'Family list item not found' using errcode = 'P0002';
  end if;
  select * into list_row from public.family_lists where id = item_row.list_id;
  if not private.can_edit_family_list(item_row.list_id, caller_id) then
    raise exception 'Family list permission denied' using errcode = '42501';
  end if;
  if item_row.version <> p_version then
    raise exception 'Family list item changed concurrently' using errcode = '40001';
  end if;

  update public.family_list_items
  set completed_at = case when p_completed then now() else null end,
      completed_by = case when p_completed then caller_id else null end,
      version = version + 1,
      updated_at = now()
  where id = p_item_id
  returning version into new_version;

  update public.family_lists
  set version = version + 1, updated_at = now()
  where id = item_row.list_id;

  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    list_row.family_id, caller_id, 'lists.item_completion_changed', 'lists',
    'family_list_item', p_item_id, jsonb_build_object('completed', p_completed)
  );
  return new_version;
end;
$$;

create or replace function public.delete_family_list_item(
  p_item_id uuid,
  p_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  item_row public.family_list_items%rowtype;
  list_row public.family_lists%rowtype;
begin
  select * into item_row from public.family_list_items where id = p_item_id for update;
  if item_row.id is null then
    raise exception 'Family list item not found' using errcode = 'P0002';
  end if;
  select * into list_row from public.family_lists where id = item_row.list_id;
  if not private.can_edit_family_list(item_row.list_id, caller_id) then
    raise exception 'Family list permission denied' using errcode = '42501';
  end if;
  if item_row.version <> p_version then
    raise exception 'Family list item changed concurrently' using errcode = '40001';
  end if;

  delete from public.family_list_items where id = p_item_id;
  update public.family_lists set version = version + 1, updated_at = now()
  where id = item_row.list_id;
  insert into public.audit_logs (
    family_id, user_id, action, module_name, resource_type, resource_id, metadata
  ) values (
    list_row.family_id, caller_id, 'lists.item_deleted', 'lists', 'family_list_item',
    p_item_id, jsonb_build_object('title', item_row.title)
  );
end;
$$;

revoke all on function public.create_task_group(uuid, text) from public, anon;
revoke all on function public.create_family_task(uuid, uuid, text, text, date, text, uuid[], uuid[], text, integer, date) from public, anon;
revoke all on function public.update_family_task(uuid, bigint, uuid, text, text, date, text, uuid[], uuid[], text, integer, date) from public, anon;
revoke all on function public.set_family_task_status(uuid, bigint, text) from public, anon;
revoke all on function public.process_task_due_notifications(date, integer) from public, anon, authenticated;
revoke all on function public.create_family_list(uuid, text, text, text, uuid[]) from public, anon;
revoke all on function public.add_family_list_item(uuid, text, numeric, text) from public, anon;
revoke all on function public.set_family_list_item_completed(uuid, bigint, boolean) from public, anon;
revoke all on function public.delete_family_list_item(uuid, bigint) from public, anon;
grant execute on function public.create_task_group(uuid, text) to authenticated;
grant execute on function public.create_family_task(uuid, uuid, text, text, date, text, uuid[], uuid[], text, integer, date) to authenticated;
grant execute on function public.update_family_task(uuid, bigint, uuid, text, text, date, text, uuid[], uuid[], text, integer, date) to authenticated;
grant execute on function public.set_family_task_status(uuid, bigint, text) to authenticated;
grant execute on function public.process_task_due_notifications(date, integer) to service_role;
grant execute on function public.create_family_list(uuid, text, text, text, uuid[]) to authenticated;
grant execute on function public.add_family_list_item(uuid, text, numeric, text) to authenticated;
grant execute on function public.set_family_list_item_completed(uuid, bigint, boolean) to authenticated;
grant execute on function public.delete_family_list_item(uuid, bigint) to authenticated;

alter table public.family_list_items replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'family_list_items'
    )
  then
    alter publication supabase_realtime add table public.family_list_items;
  end if;
end;
$$;

commit;
