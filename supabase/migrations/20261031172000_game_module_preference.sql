begin;

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
			'documents',
			'games'
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
				'documents',
				'games'
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
				'documents',
				'games'
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
				'documents',
				'games'
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
				'documents',
				'games'
			]::text[]
		)
	);


notify pgrst, 'reload schema';
commit;
