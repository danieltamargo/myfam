import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Avatar from './Avatar.svelte';

describe('Avatar', () => {
	it('renders images without inline event handlers blocked by CSP', () => {
		const { body } = render(Avatar, {
			props: { src: '/missing-avatar.png', name: 'Owner Gastos' }
		});

		expect(body).toContain('<img');
		expect(body).toContain('src="/missing-avatar.png"');
		expect(body).not.toMatch(/\son(?:error|load)\s*=/i);
	});
});
