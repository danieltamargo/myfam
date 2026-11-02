import { describe, expect, it } from 'vitest';
import { invitationSession } from './invitation';

describe('invitation session links', () => {
	it.each(['invite', 'recovery'])(
		'accepts complete %s links for explicit session verification',
		(type) => {
			expect(
				invitationSession(
					`#type=${type}&access_token=synthetic-access&refresh_token=synthetic-refresh`
				)
			).toEqual({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' });
		}
	);
	it.each([
		'',
		'#code=synthetic',
		'#type=signup&access_token=a&refresh_token=b',
		'#type=invite&access_token=a',
		'#type=invite&access_token=&refresh_token=b'
	])('rejects incomplete or unrelated fragments %s', (hash) => {
		expect(invitationSession(hash)).toBeNull();
	});
	it('bounds untrusted fragment input', () => {
		expect(
			invitationSession(`#type=invite&access_token=${'a'.repeat(20_000)}&refresh_token=b`)
		).toBeNull();
	});
});
