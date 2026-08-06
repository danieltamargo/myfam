import { describe, expect, it } from 'vitest';
import { createWishlistRealtimeReconciler } from './realtime';

describe('createWishlistRealtimeReconciler', () => {
	it('ignora versiones antiguas y eventos duplicados de regalos', () => {
		const reconciler = createWishlistRealtimeReconciler([{ id: 'item-1', version: 2 }]);
		const itemIds = new Set(['item-1']);
		const update = {
			eventType: 'UPDATE' as const,
			new: { id: 'item-1', family_id: 'family-1', version: 3 },
			old: {}
		};

		expect(reconciler.shouldRefresh('gift_items', update, 'family-1', itemIds)).toBe(true);
		expect(reconciler.shouldRefresh('gift_items', update, 'family-1', itemIds)).toBe(false);
		expect(
			reconciler.shouldRefresh(
				'gift_items',
				{ ...update, new: { id: 'item-1', family_id: 'family-1', version: 2 } },
				'family-1',
				itemIds
			)
		).toBe(false);
	});

	it('acepta un borrado visible aunque Realtime solo entregue la clave primaria', () => {
		const reconciler = createWishlistRealtimeReconciler([{ id: 'item-1', version: 2 }]);
		expect(
			reconciler.shouldRefresh(
				'gift_items',
				{ eventType: 'DELETE', old: { id: 'item-1' }, new: {} },
				'family-1',
				new Set(['item-1'])
			)
		).toBe(true);
	});

	it('limita cambios de tablas hijas a regalos visibles y deduplica su revisión', () => {
		const reconciler = createWishlistRealtimeReconciler([{ id: 'item-1', version: 1 }]);
		const payload = {
			eventType: 'INSERT' as const,
			new: { id: 'purchase-1', item_id: 'item-1', purchased_at: '2026-08-06T10:00:00Z' },
			old: {}
		};

		expect(
			reconciler.shouldRefresh('gift_purchases', payload, 'family-1', new Set(['item-1']))
		).toBe(true);
		expect(
			reconciler.shouldRefresh('gift_purchases', payload, 'family-1', new Set(['item-1']))
		).toBe(false);
		expect(
			reconciler.shouldRefresh(
				'gift_purchases',
				{ ...payload, new: { ...payload.new, item_id: 'other-item' } },
				'family-1',
				new Set(['item-1'])
			)
		).toBe(false);
	});
});
