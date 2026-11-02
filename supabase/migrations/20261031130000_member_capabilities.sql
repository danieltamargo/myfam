alter table public.family_members
  add column can_manage_members boolean not null default false,
  add column can_configure_modules boolean not null default false;

create function private.has_family_capability(p_family_id uuid, p_capability text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.family_members as member
    where member.family_id = p_family_id and member.user_id = (select auth.uid())
      and p_capability in ('manage_members', 'configure_modules')
      and (member.role in ('owner', 'admin') or case p_capability
        when 'manage_members' then member.can_manage_members
        when 'configure_modules' then member.can_configure_modules
        else false end)
  );
$$;
revoke all on function private.has_family_capability(uuid, text) from public, anon;
grant execute on function private.has_family_capability(uuid, text) to authenticated;

revoke update on public.family_members from authenticated;
grant update (role) on public.family_members to authenticated;

create function public.set_family_member_capabilities(
  p_family_id uuid, p_target_user_id uuid,
  p_can_manage_members boolean, p_can_configure_modules boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.families where id = p_family_id for update;
  if not private.has_family_role(p_family_id, (select auth.uid()), array['owner']) then
    raise exception 'Only owners can delegate capabilities' using errcode = '42501';
  end if;
  if p_target_user_id = (select auth.uid()) then
    raise exception 'Cannot change your own capabilities' using errcode = '42501';
  end if;
  if p_can_manage_members is null or p_can_configure_modules is null then
    raise exception 'Capabilities are required' using errcode = '22023';
  end if;
  update public.family_members
    set can_manage_members = p_can_manage_members,
        can_configure_modules = p_can_configure_modules
    where family_id = p_family_id and user_id = p_target_user_id and role = 'member';
  if not found then
    raise exception 'Ordinary family member required' using errcode = '22023';
  end if;
  insert into public.audit_logs(family_id, user_id, action, resource_type, resource_id, metadata)
  values (p_family_id, (select auth.uid()), 'family.capabilities_changed', 'family_member',
    p_target_user_id, jsonb_build_object('manage_members', p_can_manage_members,
      'configure_modules', p_can_configure_modules));
end;
$$;
revoke all on function public.set_family_member_capabilities(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.set_family_member_capabilities(uuid, uuid, boolean, boolean) to authenticated;

create policy delegated_managers_remove_members on public.family_members for delete to authenticated
using (role = 'member' and private.has_family_capability(family_id, 'manage_members'));

create policy delegated_managers_read_invitations on public.family_invitations for select to authenticated
using (private.has_family_capability(family_id, 'manage_members'));


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
  if not private.has_family_capability(p_family_id, 'manage_members') then
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
  if actor_id is null or not private.has_family_capability(p_family_id, 'manage_members') then
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

  if actor_id <> p_target_user_id and (not private.has_family_capability(p_family_id, 'manage_members') or (actor_role = 'member' and target_role <> 'member')) then
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

create or replace function public.set_family_module_preference(
	p_family_id uuid,
	p_module_name text,
	p_enabled boolean
)
returns public.family_modules
language plpgsql
security definer
set search_path = ''
as $$
declare
	actor_id uuid := (select auth.uid());
	preference public.family_modules;
begin
	if actor_id is null then
		raise exception 'Authentication required' using errcode = '42501';
	end if;

	if p_enabled is null or p_module_name is null or not (p_module_name = any (
		array[
			'expenses',
			'calendar',
			'tasks',
			'lists',
			'notes',
			'planner',
			'meals',
			'habits',
			'documents'
		]::text[]
	)) then
		raise exception 'Only available modules have a family preference'
			using errcode = '22023';
	end if;

	if not private.has_family_capability(p_family_id, 'configure_modules') then
		raise exception 'Owner or admin role required' using errcode = '42501';
	end if;

	insert into public.family_modules (
		family_id,
		module_name,
		enabled,
		enabled_at,
		enabled_by
	)
	values (
		p_family_id,
		p_module_name,
		p_enabled,
		case when p_enabled then now() else null end,
		case when p_enabled then actor_id else null end
	)
	on conflict (family_id, module_name) do update
	set enabled = excluded.enabled,
		enabled_at = excluded.enabled_at,
		enabled_by = excluded.enabled_by
	returning * into preference;

	insert into public.audit_logs (
		family_id,
		user_id,
		action,
		module_name,
		resource_type,
		resource_id,
		metadata
	)
	values (
		p_family_id,
		actor_id,
		'module.preference_changed',
		p_module_name,
		'family_module',
		preference.id,
		jsonb_build_object('enabled', p_enabled)
	);

	return preference;
end;
$$;
drop policy family_module_preferences_insert on public.family_modules;
drop policy family_module_preferences_update on public.family_modules;
drop policy family_module_preferences_delete on public.family_modules;
create policy family_module_preferences_insert
	on public.family_modules for insert
	to authenticated
	with check (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (
			array[
				'expenses',
				'calendar',
				'tasks',
				'lists',
				'notes',
				'planner',
				'meals',
				'habits',
				'documents'
			]::text[]
		)
	);

create policy family_module_preferences_update
	on public.family_modules for update
	to authenticated
	using (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (
			array[
				'expenses',
				'calendar',
				'tasks',
				'lists',
				'notes',
				'planner',
				'meals',
				'habits',
				'documents'
			]::text[]
		)
	)
	with check (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (
			array[
				'expenses',
				'calendar',
				'tasks',
				'lists',
				'notes',
				'planner',
				'meals',
				'habits',
				'documents'
			]::text[]
		)
	);

create policy family_module_preferences_delete
	on public.family_modules for delete
	to authenticated
	using (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (
			array[
				'expenses',
				'calendar',
				'tasks',
				'lists',
				'notes',
				'planner',
				'meals',
				'habits',
				'documents'
			]::text[]
		)
	);

