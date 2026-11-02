import { beforeEach, describe, expect, it, vi } from 'vitest';

const { values, createClient } = vi.hoisted(() => ({
	values: {} as Record<string, string>,
	createClient: vi.fn(() => ({ administrative: true }))
}));
vi.mock('$env/dynamic/private', () => ({ env: values }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { getSupabaseAdmin } from './supabase-admin';

describe('administrative client configuration', () => {
	beforeEach(() => {
		for (const key of Object.keys(values)) delete values[key];
		createClient.mockClear();
	});

	it('can be imported without a server credential and rejects an unconfigured request', () => {
		expect(createClient).not.toHaveBeenCalled();
		expect(() => getSupabaseAdmin()).toThrow('no está configurado');
	});

	it('uses the internal project URL and supports the legacy server credential at request time', () => {
		values.SUPABASE_PROJECT_URL = 'http://supabase.internal.test';
		values.SUPABASE_SERVICE_ROLE_KEY = 'test-only-server-credential';
		getSupabaseAdmin();
		expect(createClient).toHaveBeenCalledWith(
			values.SUPABASE_PROJECT_URL,
			values.SUPABASE_SERVICE_ROLE_KEY,
			{ auth: { autoRefreshToken: false, persistSession: false } }
		);
	});
});
