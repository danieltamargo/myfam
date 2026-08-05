import { error } from '@sveltejs/kit';
import { MODULE_CATALOG, type ModuleDefinition, type ModuleId } from '$lib/config/modules';

export function isModuleGloballyAvailable(moduleId: ModuleId): boolean {
	return MODULE_CATALOG[moduleId].availability !== 'disabled';
}

export function requireModuleAvailable(moduleId: ModuleId): ModuleDefinition {
	const module = MODULE_CATALOG[moduleId];

	if (!isModuleGloballyAvailable(moduleId)) {
		throw error(404, 'Módulo no disponible');
	}

	return module;
}
