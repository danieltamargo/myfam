import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ConfirmationModal from './ConfirmationModal.svelte';

describe('ConfirmationModal', () => {
	it('renders dynamic messages as text instead of executable HTML', () => {
		const attack = '<img src=x onerror="globalThis.__confirmationXss = true">';
		const { body } = render(ConfirmationModal, {
			props: {
				show: true,
				title: 'Confirmar',
				message: attack,
				onConfirm: () => undefined
			}
		});

		expect(body).not.toContain('<img');
		expect(body).toContain('&lt;img src=x onerror="globalThis.__confirmationXss = true">');
	});
});
