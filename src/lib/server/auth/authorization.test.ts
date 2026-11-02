import { describe, expect, it, vi } from 'vitest';
import { hasFamilyCapability, requireFamilyCapability } from './authorization';

describe('family capabilities', () => {
	it('preserves owner and admin capabilities', () => {
		for (const role of ['owner', 'admin']) {
			expect(hasFamilyCapability({ role }, 'manage_members')).toBe(true);
			expect(hasFamilyCapability({ role }, 'configure_modules')).toBe(true);
		}
	});

	it('keeps delegated capabilities independent and denied by default', () => {
		expect(hasFamilyCapability({ role: 'member' }, 'manage_members')).toBe(false);
		expect(
			hasFamilyCapability({ role: 'member', can_manage_members: true }, 'manage_members')
		).toBe(true);
		expect(
			hasFamilyCapability({ role: 'member', can_manage_members: true }, 'configure_modules')
		).toBe(false);
	});

	it('denies a server action when the capability is absent', async () => {
		const query = {
			eq: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'member' }, error: null })
		};
		const locals = {
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user' } }),
			supabase: { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) }
		} as unknown as Parameters<typeof requireFamilyCapability>[0];
		await expect(requireFamilyCapability(locals, 'family', 'manage_members')).rejects.toMatchObject(
			{ status: 403 }
		);
		query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
		await expect(requireFamilyCapability(locals, 'family', 'manage_members')).rejects.toMatchObject(
			{ status: 500 }
		);
	});
});
