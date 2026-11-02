import { describe, expect, it } from 'vitest';
import { decryptCalendarSecret, encryptCalendarSecret } from './crypto';

const oldKey = Buffer.alloc(32, 1).toString('base64');
const newKey = Buffer.alloc(32, 2).toString('base64');
describe('calendar token encryption', () => {
	it('authenticates ciphertext and its user/family context', () => {
		const keys = { activeId: 'old', keys: { old: oldKey } };
		const encrypted = encryptCalendarSecret('synthetic-token', 'user-a:family-a', keys);
		expect(encrypted).not.toContain('synthetic-token');
		expect(decryptCalendarSecret(encrypted, 'user-a:family-a', keys)).toBe('synthetic-token');
		expect(() => decryptCalendarSecret(encrypted, 'user-b:family-a', keys)).toThrow();
		const tampered = encrypted.split('.');
		tampered[3] = (tampered[3].startsWith('A') ? 'B' : 'A') + tampered[3].slice(1);
		expect(() => decryptCalendarSecret(tampered.join('.'), 'user-a:family-a', keys)).toThrow();
	});
	it('keeps older envelopes readable while new writes use the active rotation key', () => {
		const original = encryptCalendarSecret('synthetic-token', 'connection', {
			activeId: 'old',
			keys: { old: oldKey }
		});
		const rotatedKeys = { activeId: 'new', keys: { old: oldKey, new: newKey } };
		expect(decryptCalendarSecret(original, 'connection', rotatedKeys)).toBe('synthetic-token');
		expect(encryptCalendarSecret('synthetic-token', 'connection', rotatedKeys)).toMatch(/^new\./);
		expect(() =>
			decryptCalendarSecret(original, 'connection', { activeId: 'new', keys: { new: newKey } })
		).toThrow();
	});
});
