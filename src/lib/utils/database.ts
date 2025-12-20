import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '$lib/types/database';

// Type helpers
type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Inserts<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Insert'];

export type UserRole = 'owner' | 'admin' | 'member';

export interface FamilyMemberWithProfile {
	id: string;
	family_id: string;
	user_id: string;
	role: UserRole;
	joined_at: string;
	profile: Tables<'profiles'>;
}

/**
 * Get all families for the current user
 */
export async function getUserFamilies(supabase: SupabaseClient<Database>) {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) return { data: null, error: new Error('Not authenticated') };

	const { data, error } = await supabase
		.from('family_members')
		.select('*, family:families(*)')
		.eq('user_id', user.id);

	return { data, error };
}

/**
 * Get family with members
 */
export async function getFamilyWithMembers(supabase: SupabaseClient<Database>, familyId: string) {
	const { data: family, error: familyError } = await supabase
		.from('families')
		.select('*')
		.eq('id', familyId)
		.single();

	if (familyError || !family) return { data: null, error: familyError };

	const { data: members, error: membersError } = await supabase
		.from('family_members')
		.select('*, profile:profiles(*)')
		.eq('family_id', familyId);

	if (membersError) return { data: null, error: membersError };

	const { data: modules, error: modulesError } = await supabase
		.from('family_modules')
		.select('*')
		.eq('family_id', familyId);

	if (modulesError) return { data: null, error: modulesError };

	return {
		data: {
			...family,
			members: members || [],
			modules: modules || []
		},
		error: null
	};
}

/**
 * Check if user has specific role in family
 */
export async function hasRole(
	supabase: SupabaseClient<Database>,
	familyId: string,
	roles: UserRole[]
): Promise<boolean> {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) return false;

	const { data } = await supabase
		.from('family_members')
		.select('role')
		.eq('family_id', familyId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (!data) return false;

	return roles.includes(data.role as UserRole);
}

/**
 * Check if module is enabled for family
 */
export async function isModuleEnabled(
	supabase: SupabaseClient<Database>,
	familyId: string,
	moduleName: string
): Promise<boolean> {
	const { data } = await supabase
		.from('family_modules')
		.select('enabled')
		.eq('family_id', familyId)
		.eq('module_name', moduleName)
		.maybeSingle();

	return data?.enabled ?? false;
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
	supabase: SupabaseClient<Database>,
	params: {
		familyId: string;
		action: string;
		moduleName?: string;
		resourceType?: string;
		resourceId?: string;
		metadata?: Record<string, unknown>;
	}
) {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	const payload: Inserts<'audit_logs'> = {
		family_id: params.familyId,
		user_id: user?.id ?? null,
		action: params.action,
		module_name: params.moduleName ?? null,
		resource_type: params.resourceType ?? null,
		resource_id: params.resourceId ?? null,
		metadata: (params.metadata || {}) as Json | undefined
	};

	return supabase.from('audit_logs').insert(payload);
}

/**
 * Toggle module for family
 */
export async function toggleModule(
	supabase: SupabaseClient<Database>,
	familyId: string,
	moduleName: string,
	enabled: boolean
) {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user) return { data: null, error: new Error('Not authenticated') };

	const { data: existing } = await supabase
		.from('family_modules')
		.select('*')
		.eq('family_id', familyId)
		.eq('module_name', moduleName)
		.maybeSingle();

	if (existing) {
		const { data, error } = await supabase
			.from('family_modules')
			.update({
				enabled,
				enabled_at: enabled ? new Date().toISOString() : null,
				enabled_by: enabled ? user.id : null
			})
			.eq('id', existing.id)
			.select()
			.single();

		if (!error && enabled) {
			await createAuditLog(supabase, {
				familyId,
				action: 'module.enabled',
				moduleName
			});
		}

		return { data, error };
	} else {
		const payload: Inserts<'family_modules'> = {
			family_id: familyId,
			module_name: moduleName,
			enabled,
			enabled_at: enabled ? new Date().toISOString() : null,
			enabled_by: enabled ? user.id : null
		};

		const { data, error } = await supabase.from('family_modules').insert(payload).select().single();

		if (!error && enabled) {
			await createAuditLog(supabase, {
				familyId,
				action: 'module.enabled',
				moduleName
			});
		}

		return { data, error };
	}
}

export async function canDeleteAccount(supabase: SupabaseClient<Database>, userId: string) {
	// Get families where user is the only owner
	const { data: memberships } = await supabase
		.from('family_members')
		.select('family_id, role')
		.eq('user_id', userId)
		.eq('role', 'owner');

	if (!memberships || memberships.length === 0) {
		return { canDelete: true };
	}

	// Check each family
	const problematicFamilies = [];

	for (const membership of memberships) {
		const { data: owners } = await supabase
			.from('family_members')
			.select('id')
			.eq('family_id', membership.family_id)
			.eq('role', 'owner');

		if (owners && owners.length === 1) {
			problematicFamilies.push(membership.family_id);
		}
	}

	if (problematicFamilies.length > 0) {
		return {
			canDelete: false,
			reason: 'You are the only owner of one or more families. Transfer ownership first.'
		};
	}

	return { canDelete: true };
}
