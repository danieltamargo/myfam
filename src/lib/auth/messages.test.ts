import { describe, expect, it } from 'vitest';
import { passwordRecoveryMessage, registrationMessage, safeAuthError } from './messages';

describe('safeAuthError', () => {
	it.each(['login', 'register', 'recovery', 'reset', 'mfa'] as const)(
		'keeps provider messages and personal data out of %s errors',
		(action) => {
			const message = 'private@example.com: provider database detail <script>alert(1)</script>';
			const result = safeAuthError({ code: 'unknown_provider_code', message }, action);
			expect(result).not.toContain(message);
			expect(result).not.toContain('private@example.com');
			expect(result).not.toContain('provider');
			expect(result).not.toContain('<script>');
			expect(result).not.toBe('');
		}
	);

	it.each(['invalid_credentials', 'user_not_found', 'email_not_confirmed', 'user_banned'])(
		'uses the same login response for %s',
		(code) => {
			expect(safeAuthError({ code }, 'login')).toBe(
				'Unable to sign in. Check your email and password and try again.'
			);
		}
	);

	it.each(['user_already_exists', 'email_exists'])(
		'uses the normal registration confirmation for %s',
		(code) => expect(safeAuthError({ code }, 'register')).toBe(registrationMessage)
	);

	it.each(['user_not_found', 'email_not_confirmed'])(
		'does not show a recovery error for %s',
		(code) => {
			expect(safeAuthError({ code }, 'recovery')).toBe('');
			expect(passwordRecoveryMessage).toBe(
				'If an account matches that email, you will receive a password reset link.'
			);
		}
	);

	it.each([
		{ status: 429 },
		{ code: 'over_request_rate_limit' },
		{ code: 'over_email_send_rate_limit' }
	])('keeps useful retry guidance for rate limits', (error) =>
		expect(safeAuthError(error, 'recovery')).toContain('wait a few minutes')
	);

	it('gives network retry guidance without displaying the network message', () => {
		expect(
			safeAuthError({ name: 'AuthRetryableFetchError', message: 'private URL' }, 'login')
		).toBe('Unable to connect. Check your connection and try again.');
	});

	it.each(['otp_expired', 'session_not_found', 'refresh_token_not_found'])(
		'offers a new reset link for %s',
		(code) => expect(safeAuthError({ code }, 'reset')).toContain('request a new one')
	);

	it.each([null, undefined, 'private error', new Error('private error')])(
		'handles unstructured errors safely',
		(error) =>
			expect(safeAuthError(error, 'register')).toBe(
				'Unable to complete this request. Please try again.'
			)
	);
});
