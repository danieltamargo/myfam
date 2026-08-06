import { describe, expect, it } from 'vitest';
import { prepareWishlistImage, WishlistImageError } from './images';

const context = {
	familyId: '11111111-1111-4111-8111-111111111111',
	ownerId: '22222222-2222-4222-8222-222222222222'
};

describe('prepareWishlistImage', () => {
	it('creates an owner-scoped private path for supported uploads', () => {
		const formData = new FormData();
		formData.set('image', new File(['image'], 'regalo.png', { type: 'image/png' }));

		const prepared = prepareWishlistImage(formData, context, null);

		expect(prepared.uploadedPath).toMatch(
			new RegExp(`^${context.familyId}/${context.ownerId}/[0-9a-f-]+\\.png$`)
		);
		expect(formData.get('image_url')).toBe(prepared.uploadedPath);
	});

	it('rejects unsupported files before storage is mutated', () => {
		const formData = new FormData();
		formData.set('image', new File(['script'], 'regalo.svg', { type: 'image/svg+xml' }));

		expect(() => prepareWishlistImage(formData, context, null)).toThrow(WishlistImageError);
	});

	it('removes the existing path when explicitly requested', () => {
		const previousPath = `${context.familyId}/${context.ownerId}/old.webp`;
		const formData = new FormData();
		formData.set('remove_image', 'true');

		const prepared = prepareWishlistImage(formData, context, previousPath);

		expect(prepared.finalPath).toBeNull();
		expect(formData.get('image_url')).toBe('');
	});
});
