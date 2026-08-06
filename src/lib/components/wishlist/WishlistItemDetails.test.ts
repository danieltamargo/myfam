import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import WishlistItemDetails from './WishlistItemDetails.svelte';

describe('WishlistItemDetails', () => {
	it('renders a stored item name as text instead of executable HTML', () => {
		const attack = '<img src=x onerror="globalThis.__wishlistNameXss = true">';
		const { body } = render(WishlistItemDetails, {
			props: {
				name: attack,
				description: 'Detalle seguro',
				price: 20,
				currency: 'EUR',
				priority: 1,
				desiredQuantity: 1,
				links: [],
				events: []
			}
		});

		expect(body).not.toContain('<img');
		expect(body).toContain('&lt;img src=x onerror="globalThis.__wishlistNameXss = true">');
	});
});
