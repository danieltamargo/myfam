import { describe, expect, it } from 'vitest';
import { validateCalendarOAuthState } from './oauth';

const state = {
	nonce: 'synthetic-nonce',
	verifier: 'synthetic-verifier',
	userId: 'user-a',
	familyId: 'family-a',
	expiresAt: 2000
};
describe('calendar connection OAuth state', () => {
	it('retains the original family only when state and the current MyFamily identity match', () => {
		expect(validateCalendarOAuthState(state, state.nonce, 'user-a', 1000).familyId).toBe(
			'family-a'
		);
		expect(() => validateCalendarOAuthState(state, state.nonce, 'other-user', 1000)).toThrow();
	});
	it('rejects expired or altered states before token exchange', () => {
		expect(() => validateCalendarOAuthState(state, 'different-nonce', 'user-a', 1000)).toThrow();
		expect(() => validateCalendarOAuthState(state, state.nonce, 'user-a', 2000)).toThrow();
	});
});
