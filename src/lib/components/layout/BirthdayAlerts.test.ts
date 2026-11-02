import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BirthdayAlerts from './BirthdayAlerts.svelte';

describe('birthday alerts', () => {
	it('renders an accessible link using the wishlist member filter and today date', () => {
		const { body } = render(BirthdayAlerts, {
			props: {
				alerts: [
					{
						userId: 'member',
						displayName: 'Ángela',
						date: '2026-11-01',
						daysUntil: 0,
						wishlistHref: '/family/family/wishlist?member=member'
					}
				]
			}
		});
		expect(body).toContain('aria-label="Cumpleaños próximos"');
		expect(body).toContain('aria-label="Ver wishlist de Ángela"');
		expect(body).toContain('href="/family/family/wishlist?member=member"');
		expect(body).toContain('hoy');
		expect(body).toContain('datetime="2026-11-01"');
	});
	it('does not display an empty notification, and makes failures visible', () => {
		expect(render(BirthdayAlerts, { props: { alerts: [] } }).body).not.toContain('<aside');
		const { body } = render(BirthdayAlerts, {
			props: { alerts: [], errorMessage: 'No se pudieron cargar los avisos.' }
		});
		expect(body).toContain('role="status"');
		expect(body).toContain('No se pudieron cargar los avisos.');
	});
});
