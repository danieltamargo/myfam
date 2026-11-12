begin;

insert into public.family_modules (family_id, module_name, enabled, enabled_at, enabled_by)
select family.id, 'wishlist', true, now(), family.created_by
from public.families as family
on conflict (family_id, module_name) do nothing;

-- Keep the installed MFA guards, function settings and grants intact.
do $wishlist_functions$
declare
	signature text;
	function_id regprocedure;
	definition text;
	original_body text;
	updated_body text;
begin
	foreach signature in array array[
		'public.create_family(text)',
		'public.set_family_module_preference(uuid,text,boolean)'
	] loop
		function_id := signature::regprocedure;
		select pg_get_functiondef(function_id), prosrc into definition, original_body
		from pg_proc where oid = function_id and prosecdef
			and prolang = (select oid from pg_language where lanname = 'plpgsql');
		if definition is null or strpos(definition, original_body) = 0
			or original_body not like '%private.require_session_mfa()%'
			or original_body like '%''wishlist''%'
		then
			raise exception 'Unexpected optional Wishlist function definition: %', signature;
		end if;
		updated_body := replace(original_body, $needle$'expenses',$needle$,
			$replacement$'wishlist',
			'expenses',$replacement$);
		if updated_body = original_body then
			raise exception 'Optional module allowlist not found: %', signature;
		end if;
		execute replace(definition, original_body, updated_body);
	end loop;
end;
$wishlist_functions$;

-- The separate restrictive session_mfa_required policy still applies to all writes.
alter policy family_module_preferences_insert on public.family_modules
	with check (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (array[
			'wishlist', 'expenses', 'calendar', 'tasks', 'lists', 'notes',
			'planner', 'meals', 'habits', 'documents', 'games'
		]::text[])
	);

alter policy family_module_preferences_update on public.family_modules
	using (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (array[
			'wishlist', 'expenses', 'calendar', 'tasks', 'lists', 'notes',
			'planner', 'meals', 'habits', 'documents', 'games'
		]::text[])
	)
	with check (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (array[
			'wishlist', 'expenses', 'calendar', 'tasks', 'lists', 'notes',
			'planner', 'meals', 'habits', 'documents', 'games'
		]::text[])
	);

alter policy family_module_preferences_delete on public.family_modules
	using (
		private.has_family_capability(family_id, 'configure_modules')
		and module_name = any (array[
			'wishlist', 'expenses', 'calendar', 'tasks', 'lists', 'notes',
			'planner', 'meals', 'habits', 'documents', 'games'
		]::text[])
	);

notify pgrst, 'reload schema';
commit;
