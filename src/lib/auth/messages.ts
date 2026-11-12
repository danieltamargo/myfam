import * as m from '$paraglide/messages';

export const registrationMessage =
	'If your account can be created, check your email for a confirmation link. You can also try signing in.';
export const passwordRecoveryMessage =
	'If an account matches that email, you will receive a password reset link.';

type AuthAction = 'login' | 'register' | 'recovery' | 'reset' | 'mfa';

export function safeAuthError(
	error: unknown,
	action: AuthAction,
	locale: 'es' | 'en' = 'en'
): string {
	const options = { locale };
	const details = typeof error === 'object' && error !== null ? error : {};
	const code = 'code' in details ? details.code : undefined;
	const status = 'status' in details ? details.status : undefined;
	const name = 'name' in details ? details.name : undefined;

	if (
		status === 429 ||
		code === 'over_request_rate_limit' ||
		code === 'over_email_send_rate_limit'
	) {
		return m['auth.rate_error']({}, options);
	}
	if (name === 'AuthRetryableFetchError') {
		return m['auth.network_error']({}, options);
	}
	if (action === 'register' && (code === 'user_already_exists' || code === 'email_exists')) {
		return registrationMessage;
	}
	if (action === 'recovery' && (code === 'user_not_found' || code === 'email_not_confirmed')) {
		return '';
	}
	if (action === 'login') {
		return m['auth.login_error']({}, options);
	}
	if (
		action === 'reset' &&
		(code === 'otp_expired' || code === 'session_not_found' || code === 'refresh_token_not_found')
	) {
		return m['auth.reset_link_error']({}, options);
	}
	if (action === 'mfa') {
		return 'Unable to complete two-factor authentication. Check your current code and try again.';
	}
	return m['auth.generic_error']({}, options);
}
