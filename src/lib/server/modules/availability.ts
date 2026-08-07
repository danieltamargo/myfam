import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	getModuleDefinitions,
	MODULE_CATALOG,
	type ModuleDefinition,
	type ModuleId
} from '$lib/config/modules';
import type { Database } from '$lib/types/database';

export interface ModulePreference {
	module_name: string;
	enabled: boolean | null;
}

export type ModuleAccessReason =
	| 'core'
	| 'enabled'
	| 'family-disabled'
	| 'globally-disabled'
	| 'not-entitled';

export interface ModuleAccess {
	moduleId: ModuleId;
	enabled: boolean;
	familyPreference: boolean | null;
	reason: ModuleAccessReason;
}

export interface ModuleEntitlementContext {
	familyId: string;
	module: ModuleDefinition;
}

/**
 * Boundary for a future commercial entitlement service. The current provider
 * deliberately allows every globally released module and has no billing,
 * subscription or payment dependency. Family preferences remain separate.
 */
export interface ModuleEntitlementProvider {
	isEntitled(context: ModuleEntitlementContext): boolean | Promise<boolean>;
}

export const NO_BILLING_ENTITLEMENT_PROVIDER: ModuleEntitlementProvider = {
	isEntitled: () => true
};

export function isModuleGloballyAvailable(moduleId: ModuleId): boolean {
	return MODULE_CATALOG[moduleId].availability !== 'disabled';
}

export function resolveModuleAccess(
	moduleId: ModuleId,
	preferences: readonly ModulePreference[],
	entitled = true
): ModuleAccess {
	const module = MODULE_CATALOG[moduleId];
	const familyPreference =
		preferences.find((preference) => preference.module_name === moduleId)?.enabled ?? null;

	if (!isModuleGloballyAvailable(moduleId)) {
		return { moduleId, enabled: false, familyPreference, reason: 'globally-disabled' };
	}

	if (module.availability === 'core') {
		return { moduleId, enabled: true, familyPreference, reason: 'core' };
	}

	if (!entitled) {
		return { moduleId, enabled: false, familyPreference, reason: 'not-entitled' };
	}

	return familyPreference === true
		? { moduleId, enabled: true, familyPreference, reason: 'enabled' }
		: { moduleId, enabled: false, familyPreference, reason: 'family-disabled' };
}

export async function loadFamilyModuleAccess(
	supabase: SupabaseClient<Database>,
	familyId: string,
	entitlementProvider: ModuleEntitlementProvider = NO_BILLING_ENTITLEMENT_PROVIDER
): Promise<ModuleAccess[]> {
	const { data, error: queryError } = await supabase
		.from('family_modules')
		.select('module_name, enabled')
		.eq('family_id', familyId);

	if (queryError) {
		throw error(500, 'No se pudieron cargar las preferencias de módulos');
	}

	return Promise.all(
		getModuleDefinitions().map(async (module) =>
			resolveModuleAccess(
				module.id,
				data ?? [],
				module.availability === 'core' ||
					(await entitlementProvider.isEntitled({ familyId, module }))
			)
		)
	);
}

export function requireModuleAvailable(moduleId: ModuleId): ModuleDefinition;
export function requireModuleAvailable(
	supabase: SupabaseClient<Database>,
	familyId: string,
	moduleId: ModuleId,
	entitlementProvider?: ModuleEntitlementProvider
): Promise<ModuleDefinition>;
export function requireModuleAvailable(
	supabaseOrModuleId: SupabaseClient<Database> | ModuleId,
	familyId?: string,
	moduleId?: ModuleId,
	entitlementProvider: ModuleEntitlementProvider = NO_BILLING_ENTITLEMENT_PROVIDER
): ModuleDefinition | Promise<ModuleDefinition> {
	if (typeof supabaseOrModuleId === 'string') {
		const module = MODULE_CATALOG[supabaseOrModuleId];
		if (!isModuleGloballyAvailable(supabaseOrModuleId)) {
			throw error(404, 'Módulo no disponible');
		}
		return module;
	}

	if (!familyId || !moduleId) throw error(404, 'Módulo no disponible');
	return requireFamilyModuleAvailable(supabaseOrModuleId, familyId, moduleId, entitlementProvider);
}

async function requireFamilyModuleAvailable(
	supabase: SupabaseClient<Database>,
	familyId: string,
	moduleId: ModuleId,
	entitlementProvider: ModuleEntitlementProvider
): Promise<ModuleDefinition> {
	const module = MODULE_CATALOG[moduleId];

	if (!isModuleGloballyAvailable(moduleId)) {
		throw error(404, 'Módulo no disponible');
	}

	if (module.availability === 'core') return module;

	const entitled = await entitlementProvider.isEntitled({ familyId, module });
	if (!entitled) throw error(404, 'Módulo no disponible');

	const { data, error: queryError } = await supabase
		.from('family_modules')
		.select('enabled')
		.eq('family_id', familyId)
		.eq('module_name', moduleId)
		.maybeSingle();

	if (queryError) {
		throw error(500, 'No se pudo comprobar la disponibilidad del módulo');
	}

	if (data?.enabled !== true) {
		throw error(404, 'Módulo no disponible');
	}

	return module;
}

interface ModuleGuardEvent {
	params: { familyId?: string };
	locals: { supabase: SupabaseClient<Database> };
}

type GenericAction = (event: never) => unknown;
type GuardableActions = Record<string, GenericAction>;

export function guardModuleActions<T extends GuardableActions>(moduleId: ModuleId, actions: T): T {
	return Object.fromEntries(
		Object.entries(actions).map(([name, action]) => [
			name,
			async (event: never) => {
				const guardEvent = event as unknown as ModuleGuardEvent;
				const familyId = guardEvent.params.familyId;
				if (!familyId) throw error(404, 'Familia no encontrada');
				await requireModuleAvailable(guardEvent.locals.supabase, familyId, moduleId);
				return action(event);
			}
		])
	) as T;
}
