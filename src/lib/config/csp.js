/** @typedef {NonNullable<NonNullable<NonNullable<import('@sveltejs/kit').Config['kit']>['csp']>['directives']>} CspDirectives */
/** @typedef {NonNullable<CspDirectives['connect-src']>} CspSources */

/**
 * @param {string | undefined} supabaseUrl
 * @param {boolean} development
 * @returns {NonNullable<import('@sveltejs/kit').Config['kit']>['csp']}
 */
export function createContentSecurityPolicy(supabaseUrl, development = false) {
	/** @type {CspSources} */
	const connections = ['self'];
	/** @type {CspSources} */
	const images = ['self', 'data:', 'blob:', 'https:'];
	/** @type {CspSources} */
	const forms = ['self'];
	if (supabaseUrl) {
		const url = new URL(supabaseUrl);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
			throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL without credentials.');
		}
		const origin = /** @type {CspSources[number]} */ (url.origin);
		connections.push(origin);
		images.push(origin);
		forms.push(origin);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		connections.push(/** @type {CspSources[number]} */ (url.origin));
	}
	if (development) connections.push('ws://localhost:*', 'ws://127.0.0.1:*');

	return {
		mode: 'auto',
		directives: {
			'default-src': ['self'],
			'script-src': ['self'],
			'style-src': ['self', 'unsafe-inline'],
			'connect-src': connections,
			'img-src': images,
			'object-src': ['none'],
			'base-uri': ['self'],
			'form-action': forms,
			'frame-ancestors': ['none']
		}
	};
}
