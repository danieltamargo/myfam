import { describe, expect, it } from 'vitest';
import { parseWishlistItemForm } from './schemas';

const familyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function validForm(): FormData {
	const form = new FormData();
	form.set('name', '  Una bicicleta  ');
	form.set('description', '  Azul y ligera  ');
	form.set('price', '129,95');
	form.set('currency', 'EUR');
	form.set('priority', '2');
	form.set('desired_quantity', '2');
	form.set('status', 'active');
	form.append('links', 'https://example.com/bici');
	form.append('links', '  ');
	form.set('image_url', `${familyId}/${ownerId}/bike.webp`);
	form.append('event_ids', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
	return form;
}

describe('parseWishlistItemForm', () => {
	it('preserves an opaque association unless the user explicitly changes it', () => {
		const form = validForm();
		form.set('calendar_event_id', '__keep__');
		expect(parseWishlistItemForm(form, { familyId, ownerId })).toMatchObject({
			success: true,
			data: { calendarChange: 'keep', calendarEventId: null }
		});
		form.set('calendar_event_id', '');
		expect(parseWishlistItemForm(form, { familyId, ownerId })).toMatchObject({
			success: true,
			data: { calendarChange: 'clear', calendarEventId: null }
		});
		form.set('calendar_event_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
		expect(parseWishlistItemForm(form, { familyId, ownerId })).toMatchObject({
			success: true,
			data: { calendarChange: 'replace', calendarEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }
		});
	});
	it('rejects an invalid calendar reference before saving', () => {
		const form = validForm();
		form.set('calendar_event_id', 'not-a-uuid');
		expect(parseWishlistItemForm(form, { familyId, ownerId })).toMatchObject({
			success: false,
			errors: { calendar_event_id: expect.any(String) }
		});
	});
	it('normalizes a valid item and keeps only non-empty HTTPS links', () => {
		const result = parseWishlistItemForm(validForm(), { familyId, ownerId });

		expect(result).toEqual({
			success: true,
			data: {
				name: 'Una bicicleta',
				description: 'Azul y ligera',
				price: 129.95,
				currency: 'EUR',
				priority: 2,
				desiredQuantity: 2,
				status: 'active',
				links: ['https://example.com/bici'],
				imagePath: `${familyId}/${ownerId}/bike.webp`,
				eventIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
				calendarChange: 'keep',
				calendarEventId: null
			}
		});
	});

	it('rejects an empty name', () => {
		const form = validForm();
		form.set('name', '   ');

		const result = parseWishlistItemForm(form, { familyId, ownerId });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.name).toBeDefined();
	});

	it('rejects negative prices', () => {
		const form = validForm();
		form.set('price', '-0.01');

		const result = parseWishlistItemForm(form, { familyId, ownerId });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.price).toBeDefined();
	});

	it.each(['eur', 'EURO', '12A'])('rejects invalid currency %s', (currency) => {
		const form = validForm();
		form.set('currency', currency);

		const result = parseWishlistItemForm(form, { familyId, ownerId });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.currency).toBeDefined();
	});

	it.each(['http://example.com', 'javascript:alert(1)', 'ftp://example.com/file'])(
		'rejects insecure external link %s',
		(link) => {
			const form = validForm();
			form.delete('links');
			form.append('links', link);

			const result = parseWishlistItemForm(form, { familyId, ownerId });
			expect(result.success).toBe(false);
			if (!result.success) expect(result.errors.links).toBeDefined();
		}
	);

	it.each(['0', '1000', '1.5'])('rejects invalid desired quantity %s', (quantity) => {
		const form = validForm();
		form.set('desired_quantity', quantity);

		const result = parseWishlistItemForm(form, { familyId, ownerId });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.errors.desired_quantity).toBeDefined();
	});

	it('rejects arbitrary image URLs and paths owned by another user', () => {
		const external = validForm();
		external.set('image_url', 'https://evil.example/tracker.gif');
		const externalResult = parseWishlistItemForm(external, { familyId, ownerId });
		expect(externalResult.success).toBe(false);

		const forged = validForm();
		forged.set('image_url', `${familyId}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/forged.webp`);
		const forgedResult = parseWishlistItemForm(forged, { familyId, ownerId });
		expect(forgedResult.success).toBe(false);
	});
});
