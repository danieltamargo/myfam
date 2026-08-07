begin;

-- family_modules stores a family's product preference only. Global rollout
-- state remains in the application catalog and future commercial entitlements
-- must live behind a separate provider/table.
update public.family_modules
set module_name = case module_name
	when 'events' then 'calendar'
	when 'fitness' then 'habits'
	else module_name
end;

delete from public.family_modules where family_id is null;
update public.family_modules set enabled = false where enabled is null;
update public.family_modules set settings = '{}'::jsonb where settings is null;

alter table public.family_modules
	drop constraint if exists family_modules_module_name_check,
	drop constraint if exists family_modules_catalog_check;

alter table public.family_modules
	alter column family_id set not null,
	alter column enabled set default false,
	alter column enabled set not null,
	alter column settings set default '{}'::jsonb,
	alter column settings set not null,
	add constraint family_modules_catalog_check check (
		module_name = any (
			array[
				'members',
				'wishlist',
				'expenses',
				'calendar',
				'tasks',
				'lists',
				'notes',
				'planner',
				'meals',
				'habits',
				'documents',
				'games'
			]::text[]
		)
	);

comment on table public.family_modules is
	'Family product preferences. Not a billing entitlement or authorization boundary.';
comment on column public.family_modules.enabled is
	'Family opt-in/out preference; effective access also requires global availability and any future entitlement.';

-- Preserve the product surface already in use when preferences become
-- enforceable. Existing explicit false values remain disabled.
insert into public.family_modules (
	family_id,
	module_name,
	enabled,
	enabled_at,
	enabled_by
)
select
	family.id,
	module_name,
	true,
	now(),
	family.created_by
from public.families as family
cross join unnest(
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
) as module_name
on conflict (family_id, module_name) do nothing;

drop policy if exists "Members can view family modules" on public.family_modules;
drop policy if exists "Owners and admins can manage modules" on public.family_modules;
drop policy if exists family_module_preferences_select on public.family_modules;
drop policy if exists family_module_preferences_insert on public.family_modules;
drop policy if exists family_module_preferences_update on public.family_modules;
drop policy if exists family_module_preferences_delete on public.family_modules;

create policy family_module_preferences_select
	on public.family_modules for select
	to authenticated
	using (private.is_family_member(family_id, (select auth.uid())));

create policy family_module_preferences_insert
	on public.family_modules for insert
	to authenticated
	with check (
		private.has_family_role(
			family_id,
			(select auth.uid()),
			array['owner', 'admin']
		)
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
		private.has_family_role(
			family_id,
			(select auth.uid()),
			array['owner', 'admin']
		)
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
		private.has_family_role(
			family_id,
			(select auth.uid()),
			array['owner', 'admin']
		)
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
		private.has_family_role(
			family_id,
			(select auth.uid()),
			array['owner', 'admin']
		)
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

	if not private.has_family_role(
		p_family_id,
		actor_id,
		array['owner', 'admin']
	) then
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

revoke all on function public.set_family_module_preference(uuid, text, boolean)
	from public, anon;
grant execute on function public.set_family_module_preference(uuid, text, boolean)
	to authenticated, service_role;

-- New families start with the currently released optional modules enabled.
-- Owners/admins can opt out later; core and globally disabled modules never
-- receive a preference row through the supported mutation path.
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

	insert into public.family_modules (
		family_id,
		module_name,
		enabled,
		enabled_at,
		enabled_by
	)
	select family_id, module_name, true, now(), actor_id
	from unnest(
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
	) as module_name;

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
	)
	values (
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

commit;
