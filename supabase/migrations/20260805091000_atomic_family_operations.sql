begin;

-- Preserve deletion audit records after their family is removed.
alter table public.audit_logs
  drop constraint if exists audit_logs_family_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_family_id_fkey
  foreign key (family_id)
  references public.families(id)
  on delete set null;

-- A family can never contain two owners. Ownership transfer is the only path
-- that may change an owner row.
create unique index if not exists family_members_one_owner_idx
  on public.family_members(family_id)
  where role = 'owner';

create or replace function private.require_aal2()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'aal'), 'aal1') <> 'aal2' then
    raise exception 'Two-factor verification is required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_aal2() from public, anon, authenticated;

drop policy if exists authenticated_can_create_families on public.families;
drop policy if exists owners_can_delete_families on public.families;
revoke insert, delete on table public.families from anon, authenticated;

create or replace function public.create_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_name text := trim(p_name);
  family_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_name is null
    or char_length(normalized_name) = 0
    or char_length(normalized_name) > 80
  then
    raise exception 'Family name must contain between 1 and 80 characters'
      using errcode = '22023';
  end if;

  insert into public.families (name, created_by)
  values (normalized_name, actor_id)
  returning id into family_id;

  insert into public.family_members (family_id, user_id, role)
  values (family_id, actor_id, 'owner');

  insert into public.gift_event_categories (
    family_id,
    name,
    icon,
    color,
    is_system,
    created_by
  )
  values
    (family_id, 'Navidad', '🎄', '#dc2626', true, actor_id),
    (family_id, 'Cumpleaños', '🎂', '#f59e0b', true, actor_id),
    (family_id, 'Reyes', '👑', '#8b5cf6', true, actor_id),
    (family_id, 'San Valentín', '❤️', '#ec4899', true, actor_id),
    (family_id, 'Todos', '🎁', '#10b981', true, actor_id);

  insert into public.audit_logs (
    family_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    family_id,
    actor_id,
    'family.created',
    'family',
    family_id,
    jsonb_build_object('name', normalized_name)
  );

  return family_id;
end;
$$;

create or replace function public.transfer_family_ownership(
  p_family_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_role text;
begin
  perform private.require_aal2();

  if actor_id is null or actor_id = p_target_user_id then
    raise exception 'A different target member is required' using errcode = '22023';
  end if;

  perform 1
  from public.families as family
  where family.id = p_family_id
  for update;

  if not found then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.family_members as membership
  where membership.family_id = p_family_id
  order by membership.user_id
  for update;

  if not exists (
    select 1
    from public.family_members as membership
    where membership.family_id = p_family_id
      and membership.user_id = actor_id
      and membership.role = 'owner'
  ) then
    raise exception 'Only the current owner can transfer ownership' using errcode = '42501';
  end if;

  select membership.role into target_role
  from public.family_members as membership
  where membership.family_id = p_family_id
    and membership.user_id = p_target_user_id;

  if target_role is null then
    raise exception 'Target member not found' using errcode = 'P0002';
  end if;

  if target_role = 'owner' then
    raise exception 'Target is already an owner' using errcode = '22023';
  end if;

  update public.family_members
  set role = 'admin'
  where family_id = p_family_id
    and user_id = actor_id;

  update public.family_members
  set role = 'owner'
  where family_id = p_family_id
    and user_id = p_target_user_id;

  insert into public.audit_logs (
    family_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_family_id,
    actor_id,
    'family.ownership_transferred',
    'family_member',
    p_target_user_id,
    jsonb_build_object('previous_owner_id', actor_id, 'new_owner_id', p_target_user_id)
  );
end;
$$;

create or replace function public.remove_family_member(
  p_family_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  target_role text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.families as family
  where family.id = p_family_id
  for update;

  if not found then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.family_members as membership
  where membership.family_id = p_family_id
  order by membership.user_id
  for update;

  select membership.role into actor_role
  from public.family_members as membership
  where membership.family_id = p_family_id
    and membership.user_id = actor_id;

  select membership.role into target_role
  from public.family_members as membership
  where membership.family_id = p_family_id
    and membership.user_id = p_target_user_id;

  if actor_role is null or target_role is null then
    raise exception 'Family member not found' using errcode = 'P0002';
  end if;

  if target_role = 'owner' then
    raise exception 'Owners must transfer ownership before leaving' using errcode = '42501';
  end if;

  if actor_id <> p_target_user_id and actor_role not in ('owner', 'admin') then
    raise exception 'Only managers can remove another member' using errcode = '42501';
  end if;

  delete from public.family_members
  where family_id = p_family_id
    and user_id = p_target_user_id;

  insert into public.audit_logs (
    family_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_family_id,
    actor_id,
    case when actor_id = p_target_user_id then 'family.member_left' else 'family.member_removed' end,
    'family_member',
    p_target_user_id,
    jsonb_build_object('removed_role', target_role)
  );
end;
$$;

create or replace function public.delete_family(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  family_name text;
begin
  perform private.require_aal2();

  select family.name into family_name
  from public.families as family
  where family.id = p_family_id
  for update;

  if family_name is null then
    raise exception 'Family not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.family_members as membership
  where membership.family_id = p_family_id
  order by membership.user_id
  for update;

  if not exists (
    select 1
    from public.family_members as membership
    where membership.family_id = p_family_id
      and membership.user_id = actor_id
      and membership.role = 'owner'
  ) then
    raise exception 'Only the owner can delete a family' using errcode = '42501';
  end if;

  insert into public.audit_logs (
    family_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_family_id,
    actor_id,
    'family.deleted',
    'family',
    p_family_id,
    jsonb_build_object('family_id', p_family_id, 'name', family_name)
  );

  delete from public.families where id = p_family_id;
end;
$$;

-- Keep invitation acceptance atomic and include its audit event.
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

  insert into public.audit_logs (
    family_id,
    user_id,
    action,
    resource_type,
    resource_id
  ) values (
    invitation.family_id,
    actor_id,
    'family.invitation_accepted',
    'family_invitation',
    invitation.id
  );

  return invitation.family_id;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
revoke all on function public.transfer_family_ownership(uuid, uuid) from public, anon;
revoke all on function public.remove_family_member(uuid, uuid) from public, anon;
revoke all on function public.delete_family(uuid) from public, anon;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.transfer_family_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_family_member(uuid, uuid) to authenticated;
grant execute on function public.delete_family(uuid) to authenticated;

commit;
