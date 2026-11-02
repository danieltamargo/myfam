export function invitationSession(hash: string) {
	if (hash.length > 20_000) return null;
	const params = new URLSearchParams(hash.replace(/^#/, ''));
	if (!['invite', 'recovery'].includes(params.get('type') ?? '')) return null;
	const access_token = params.get('access_token');
	const refresh_token = params.get('refresh_token');
	if (!access_token || !refresh_token) return null;
	return { access_token, refresh_token };
}
