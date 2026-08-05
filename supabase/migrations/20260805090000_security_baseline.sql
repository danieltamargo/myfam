begin;

-- Private helpers stay outside the PostgREST-exposed schema. Policies still
-- receive EXECUTE explicitly, while direct public RPC access is impossible.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- The historical migrations relied on hosted default grants. Make the API
-- privileges explicit so a clean local database and production behave alike.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select, insert, update, delete on table public.families to authenticated;
grant select, update, delete on table public.family_members to authenticated;
grant select, insert, update, delete on table public.family_modules to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant select on table public.family_invitations to authenticated;
grant select, insert, update, delete on table public.external_connections to authenticated;
grant select on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.gift_event_categories to authenticated;
grant select, insert, update, delete on table public.gift_items to authenticated;
grant select, insert, update, delete on table public.gift_item_events to authenticated;
grant select, insert, update, delete on table public.gift_reservations to authenticated;
grant select, insert, update, delete on table public.gift_purchases to authenticated;
grant select, insert, update, delete on table public.gift_item_comments to authenticated;
grant select on table public.gift_comment_mentions to authenticated;
grant select, delete on table public.notifications to authenticated;

-- These tables were added after the consolidated schema and had policies but
-- never had RLS enabled, leaving every policy inert.
alter table public.gift_item_comments enable row level security;
alter table public.gift_comment_mentions enable row level security;
alter table public.notifications enable row level security;

alter function public.is_family_member(uuid, uuid) set schema private;
alter function public.has_family_role(uuid, uuid, text[]) set schema private;

create or replace function private.is_family_member(family_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select user_uuid is not null
    and user_uuid = (select auth.uid())
    and exists (
      select 1
      from public.family_members as fm
      where fm.family_id = family_uuid
        and fm.user_id = user_uuid
    );
$$;

create or replace function private.has_family_role(
  family_uuid uuid,
  user_uuid uuid,
  required_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select user_uuid is not null
    and user_uuid = (select auth.uid())
    and exists (
      select 1
      from public.family_members as fm
      where fm.family_id = family_uuid
        and fm.user_id = user_uuid
        and fm.role = any(required_roles)
    );
$$;

create or replace function private.can_view_profile(target_user_id uuid, viewer_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_user_id is not null
    and viewer_user_id = (select auth.uid())
    and (
      target_user_id = viewer_user_id
      or exists (
        select 1
        from public.family_members as viewer_membership
        join public.family_members as target_membership
          on target_membership.family_id = viewer_membership.family_id
        where viewer_membership.user_id = viewer_user_id
          and target_membership.user_id = target_user_id
      )
      or exists (
        select 1
        from public.family_invitations as invitation
        where (
          invitation.invited_user_id = viewer_user_id
          and invitation.invited_by = target_user_id
        ) or (
          invitation.invited_user_id = target_user_id
          and invitation.invited_by = viewer_user_id
        )
      )
    );
$$;

revoke all on function private.is_family_member(uuid, uuid) from public, anon;
revoke all on function private.has_family_role(uuid, uuid, text[]) from public, anon;
revoke all on function private.can_view_profile(uuid, uuid) from public, anon;
grant execute on function private.is_family_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.has_family_role(uuid, uuid, text[]) to authenticated, service_role;
grant execute on function private.can_view_profile(uuid, uuid) to authenticated, service_role;

drop policy if exists anyone_can_view_mentions on public.gift_comment_mentions;
create policy family_members_can_view_mentions
  on public.gift_comment_mentions for select
  to authenticated
  using (
    exists (
      select 1
      from public.gift_item_comments as comment
      join public.gift_items as item on item.id = comment.item_id
      where comment.id = gift_comment_mentions.comment_id
        and private.is_family_member(item.family_id, (select auth.uid()))
    )
  );

-- Profiles: related users may see only the directory columns. Email and the
-- active-family preference are available to the account holder through a
-- narrowly scoped RPC below.
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy profiles_select_related
  on public.profiles for select
  to authenticated
  using (private.can_view_profile(id, (select auth.uid())));

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all privileges on table public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, created_at, updated_at)
  on public.profiles to authenticated;
grant update (display_name, avatar_url, active_family_id)
  on public.profiles to authenticated;

create or replace view public.public_profiles
with (security_invoker = true, security_barrier = true)
as
select id, display_name, avatar_url
from public.profiles;

revoke all on table public.public_profiles from public, anon;
grant select on table public.public_profiles to authenticated;
grant select on table public.public_profiles to service_role;

create or replace function public.get_my_profile()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  email text,
  active_family_id uuid,
  created_at timestamp,
  updated_at timestamp
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.email,
    profile.active_family_id,
    profile.created_at,
    profile.updated_at
  from public.profiles as profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- Direct membership insertion is never a client operation. Invitation
-- acceptance below performs the insert and status transition atomically.
drop policy if exists can_insert_family_members on public.family_members;
drop policy if exists owners_can_update_roles on public.family_members;
drop policy if exists owners_admins_can_remove_members on public.family_members;

create policy owners_update_non_owner_roles
  on public.family_members for update
  to authenticated
  using (
    role <> 'owner'
    and private.has_family_role(family_id, (select auth.uid()), array['owner'])
  )
  with check (
    role in ('admin', 'member')
    and private.has_family_role(family_id, (select auth.uid()), array['owner'])
  );

create policy managers_or_self_remove_non_owners
  on public.family_members for delete
  to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.has_family_role(
        family_id,
        (select auth.uid()),
        array['owner', 'admin']
      )
    )
  );

revoke insert on table public.family_members from anon, authenticated;

-- Invitation rows are visible only to the recipient, sender, or an owner/admin.
drop policy if exists "Anyone can view invitations by token" on public.family_invitations;
drop policy if exists "Owners and admins can create invitations" on public.family_invitations;
drop policy if exists users_can_view_own_invitations on public.family_invitations;
drop policy if exists owners_can_manage_invitations on public.family_invitations;

create policy invitation_participants_can_select
  on public.family_invitations for select
  to authenticated
  using (
    invited_user_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or private.has_family_role(
      family_id,
      (select auth.uid()),
      array['owner', 'admin']
    )
  );

revoke insert, update, delete on table public.family_invitations from anon, authenticated;

-- Internal notification creation validates both the type and the in-app link.
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
    'mention',
    'comment',
    'invitation',
    'gift_status',
    'family_join',
    'game_finished',
    'game_won',
    'game_invite'
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
    user_id,
    type,
    title,
    message,
    link,
    reference_type,
    reference_id
  ) values (
    p_user_id,
    p_type,
    left(trim(p_title), 160),
    p_message,
    p_link,
    p_reference_type,
    p_reference_id
  )
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function private.create_notification(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.create_notification(uuid, text, text, text, text, text, uuid)
  to service_role;

drop policy if exists system_can_create_notifications on public.notifications;
revoke insert, update on table public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

create or replace function public.get_unread_notification_count(user_uuid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or user_uuid <> (select auth.uid()) then
    raise exception 'Cannot read another user notification count' using errcode = '42501';
  end if;

  return (
    select count(*)::integer
    from public.notifications as notification
    where notification.user_id = user_uuid
      and notification.read = false
  );
end;
$$;

revoke all on function public.get_unread_notification_count(uuid) from public, anon;
grant execute on function public.get_unread_notification_count(uuid) to authenticated;

-- Harden the signup/email triggers and route mention notifications through
-- the validated internal creator.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    new.email
  );
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

create or replace function public.handle_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mentioned_user_id uuid;
  item_owner_id uuid;
  item_name text;
  author_name text;
  family_members_ids uuid[];
  item_family_id uuid;
begin
  select item.owner_id, item.name, item.family_id
  into item_owner_id, item_name, item_family_id
  from public.gift_items as item
  where item.id = new.item_id;

  select profile.display_name into author_name
  from public.profiles as profile
  where profile.id = new.author_id;

  select array_agg(distinct membership.user_id)
  into family_members_ids
  from public.family_members as membership
  where membership.family_id = item_family_id;

  foreach mentioned_user_id in array public.extract_mentions_from_comment(new.content)
  loop
    if mentioned_user_id = any(family_members_ids)
      and mentioned_user_id <> item_owner_id
      and mentioned_user_id <> new.author_id
    then
      insert into public.gift_comment_mentions (comment_id, mentioned_user_id)
      values (new.id, mentioned_user_id)
      on conflict (comment_id, mentioned_user_id) do nothing;

      perform private.create_notification(
        mentioned_user_id,
        'mention',
        coalesce(author_name, 'Alguien') || ' te mencionó',
        'En un comentario sobre: ' || item_name,
        '/family/' || item_family_id || '/wishlist?item=' || new.item_id,
        'gift_comment',
        new.id
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
revoke all on function public.handle_comment_mentions() from public, anon, authenticated;

-- Manager-only invitation lookup preserves the email use case without making
-- profile emails queryable as a directory.
create or replace function public.get_managed_family_invitations(p_family_id uuid)
returns table (
  id uuid,
  family_id uuid,
  invited_by uuid,
  invited_user_id uuid,
  invited_email text,
  status text,
  created_at timestamp,
  updated_at timestamp
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_family_role(
    p_family_id,
    (select auth.uid()),
    array['owner', 'admin']
  ) then
    raise exception 'Only family managers can view invitations' using errcode = '42501';
  end if;

  return query
  select
    invitation.id,
    invitation.family_id,
    invitation.invited_by,
    invitation.invited_user_id,
    profile.email,
    invitation.status,
    invitation.created_at,
    invitation.updated_at
  from public.family_invitations as invitation
  join public.profiles as profile on profile.id = invitation.invited_user_id
  where invitation.family_id = p_family_id;
end;
$$;

create or replace function public.invite_family_member(p_family_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_user_id uuid;
  invitation_id uuid;
  family_name text;
begin
  if actor_id is null or not private.has_family_role(
    p_family_id,
    actor_id,
    array['owner', 'admin']
  ) then
    raise exception 'Only family managers can invite members' using errcode = '42501';
  end if;

  select profile.id into target_user_id
  from public.profiles as profile
  where lower(profile.email) = lower(trim(p_email))
  limit 1;

  if target_user_id is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if target_user_id = actor_id then
    raise exception 'Cannot invite yourself' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.family_members as membership
    where membership.family_id = p_family_id
      and membership.user_id = target_user_id
  ) then
    raise exception 'User is already a family member' using errcode = '23505';
  end if;

  insert into public.family_invitations (
    family_id,
    invited_by,
    invited_user_id,
    status
  ) values (
    p_family_id,
    actor_id,
    target_user_id,
    'pending'
  )
  on conflict (family_id, invited_user_id)
  do update set
    invited_by = excluded.invited_by,
    status = 'pending',
    updated_at = now()
  returning id into invitation_id;

  select family.name into family_name
  from public.families as family
  where family.id = p_family_id;

  perform private.create_notification(
    target_user_id,
    'invitation',
    'Invitación familiar',
    'Te han invitado a ' || coalesce(family_name, 'una familia'),
    '/dashboard',
    'family',
    p_family_id
  );

  return invitation_id;
end;
$$;

create or replace function public.accept_family_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invitation public.family_invitations%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into invitation
  from public.family_invitations
  where id = p_invitation_id
  for update;

  if invitation.id is null
    or invitation.invited_user_id <> actor_id
    or invitation.status <> 'pending'
  then
    raise exception 'Invitation not found or already processed' using errcode = 'P0002';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invitation.family_id, actor_id, 'member')
  on conflict (family_id, user_id) do nothing;

  update public.family_invitations
  set status = 'accepted', updated_at = now()
  where id = invitation.id;

  return invitation.family_id;
end;
$$;

create or replace function public.reject_family_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  update public.family_invitations
  set status = 'rejected', updated_at = now()
  where id = p_invitation_id
    and invited_user_id = actor_id
    and status = 'pending';

  if not found then
    raise exception 'Invitation not found or already processed' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_managed_family_invitations(uuid) from public, anon;
revoke all on function public.invite_family_member(uuid, text) from public, anon;
revoke all on function public.accept_family_invitation(uuid) from public, anon;
revoke all on function public.reject_family_invitation(uuid) from public, anon;
grant execute on function public.get_managed_family_invitations(uuid) to authenticated;
grant execute on function public.invite_family_member(uuid, text) to authenticated;
grant execute on function public.accept_family_invitation(uuid) to authenticated;
grant execute on function public.reject_family_invitation(uuid) to authenticated;

-- Foreign keys and hot RLS predicates need supporting indexes.
create index if not exists idx_external_connections_user_id
  on public.external_connections(user_id);
create index if not exists idx_families_created_by
  on public.families(created_by);
create index if not exists idx_family_invitations_invited_by
  on public.family_invitations(invited_by);
create index if not exists idx_family_invitations_user_status
  on public.family_invitations(invited_user_id, status, created_at desc);
create index if not exists idx_family_invitations_family_status
  on public.family_invitations(family_id, status, created_at desc);
create index if not exists idx_family_modules_enabled_by
  on public.family_modules(enabled_by);
create index if not exists idx_game_achievements_session_id
  on public.game_achievements(session_id);
create index if not exists idx_gift_event_categories_created_by
  on public.gift_event_categories(created_by);
create index if not exists idx_family_members_family_role
  on public.family_members(family_id, role, user_id);

commit;
