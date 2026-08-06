import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import GiftComments from './GiftComments.svelte';

describe('GiftComments', () => {
	it('renders stored comment content as text instead of executable HTML', () => {
		const attack = '<img src=x onerror="globalThis.__wishlistXss = true">';
		const { body } = render(GiftComments, {
			props: {
				itemId: '11111111-1111-4111-8111-111111111111',
				comments: [
					{
						id: '22222222-2222-4222-8222-222222222222',
						content: attack,
						created_at: '2026-08-06T12:00:00.000Z',
						updated_at: '2026-08-06T12:00:00.000Z',
						author_id: '33333333-3333-4333-8333-333333333333',
						profiles: {
							id: '33333333-3333-4333-8333-333333333333',
							display_name: 'Ana',
							avatar_url: null
						}
					}
				],
				members: [],
				currentUserId: '44444444-4444-4444-8444-444444444444',
				itemOwnerId: '55555555-5555-4555-8555-555555555555'
			}
		});

		expect(body).not.toContain('<img');
		expect(body).toContain('&lt;img src=x onerror="globalThis.__wishlistXss = true">');
	});
});
