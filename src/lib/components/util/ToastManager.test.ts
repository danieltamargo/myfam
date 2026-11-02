import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import { toastStore } from '$lib/stores/toast';
import ToastManager from './ToastManager.svelte';

afterEach(() => toastStore.clear());

describe('ToastManager', () => {
	it('renders hostile messages as text without creating executable elements', () => {
		const attack = '<img src=x onerror="globalThis.__toastXss = true"><script>alert(1)</script>';
		toastStore.show(attack, { duration: 0 });
		const { body } = render(ToastManager);
		expect(body).not.toContain('<img');
		expect(body).not.toContain('<script');
		expect(body).toContain('&lt;img src=x onerror="globalThis.__toastXss = true">');
		expect(body).toContain('&lt;script>alert(1)&lt;/script>');
	});
});
