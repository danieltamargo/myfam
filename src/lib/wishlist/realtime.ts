export type WishlistRealtimeTable =
	| 'gift_items'
	| 'gift_purchases'
	| 'gift_reservations'
	| 'gift_item_events'
	| 'gift_item_comments';

export interface WishlistRealtimePayload {
	eventType: 'INSERT' | 'UPDATE' | 'DELETE';
	new: Record<string, unknown>;
	old: Record<string, unknown>;
}

export interface WishlistRealtimeItem {
	id: string;
	version: number;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function createWishlistRealtimeReconciler(initialItems: WishlistRealtimeItem[]) {
	const versions = new Map(initialItems.map((item) => [item.id, item.version]));
	const seenEvents = new Set<string>();

	function remember(key: string): boolean {
		if (seenEvents.has(key)) return false;
		seenEvents.add(key);
		if (seenEvents.size > 500) seenEvents.delete(seenEvents.values().next().value ?? '');
		return true;
	}

	return {
		sync(items: WishlistRealtimeItem[]) {
			for (const item of items) versions.set(item.id, item.version);
		},

		shouldRefresh(
			table: WishlistRealtimeTable,
			payload: WishlistRealtimePayload,
			familyId: string,
			visibleItemIds: ReadonlySet<string>
		): boolean {
			const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
			if (table === 'gift_items') {
				const id = stringValue(row.id);
				if (!id) return false;
				const rowFamilyId = stringValue(row.family_id);
				if (payload.eventType === 'DELETE') {
					if (rowFamilyId ? rowFamilyId !== familyId : !visibleItemIds.has(id)) return false;
				} else if (rowFamilyId !== familyId) return false;
				const version = numberValue(row.version) ?? 0;
				const key = `${table}:${payload.eventType}:${id}:${version}`;
				if (!remember(key)) return false;
				if (payload.eventType === 'DELETE') {
					versions.delete(id);
					return true;
				}
				if (version <= (versions.get(id) ?? 0)) return false;
				versions.set(id, version);
				return true;
			}

			const itemId = stringValue(row.item_id);
			const id = stringValue(row.id);
			if (!itemId || !id || !visibleItemIds.has(itemId)) return false;
			const revision =
				stringValue(row.updated_at) ??
				stringValue(row.purchased_at) ??
				stringValue(row.reserved_at) ??
				stringValue(row.created_at) ??
				JSON.stringify(row);
			return remember(`${table}:${payload.eventType}:${id}:${revision}`);
		}
	};
}
