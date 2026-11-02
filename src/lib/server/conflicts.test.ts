import { describe, expect, it, vi } from 'vitest';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';
import { deleteCalendarEvent } from './calendar/commands';
import { deleteFamilyDocument } from './documents/commands';
import { deleteExpense, recordExpenseSettlement } from './expenses/commands';
import { gameCommandFailure } from './games/commands';
import { setFamilyListItemCompleted } from './lists/commands';
import { setFamilyNoteArchived } from './notes/commands';
import { setFamilyTaskStatus } from './tasks/commands';
import { receiveWishlistItem } from './wishlist/commands';

type Client = SupabaseClient<Database>;
const operations: { name: string; run: (client: Client) => Promise<unknown> }[] = [
	{ name: 'calendar', run: (client) => deleteCalendarEvent(client, 'event', 1) },
	{ name: 'documents', run: (client) => deleteFamilyDocument(client, 'document', 1) },
	{ name: 'expenses', run: (client) => deleteExpense(client, 'collection', 'expense', 1) },
	{
		name: 'settlements',
		run: (client) =>
			recordExpenseSettlement(client, 'collection', {
				fromUserId: 'payer',
				toUserId: 'recipient',
				amountCents: 100,
				idempotencyKey: 'request'
			})
	},
	{ name: 'lists', run: (client) => setFamilyListItemCompleted(client, 'item', 1, true) },
	{ name: 'notes', run: (client) => setFamilyNoteArchived(client, 'note', 1, true) },
	{ name: 'tasks', run: (client) => setFamilyTaskStatus(client, 'task', 1, 'completed') },
	{ name: 'wishlist', run: (client) => receiveWishlistItem(client, 'gift', 1) }
];

describe.each(['PT409', '40001'])('business conflict compatibility (%s)', (code) => {
	it.each(operations)(
		'returns a conflict in $name without retrying the mutation',
		async ({ run }) => {
			const rpc = vi.fn().mockResolvedValue({
				data: null,
				error: { code, message: 'Stale version', details: '', hint: '' }
			});
			await expect(run({ rpc } as unknown as Client)).rejects.toMatchObject({ status: 409 });
			expect(rpc).toHaveBeenCalledOnce();
		}
	);
	it('returns the game conflict as HTTP 409', () => {
		const error = { code, message: 'Stale version', details: '', hint: '' } as PostgrestError;
		expect(gameCommandFailure(error)).toMatchObject({ status: 409 });
	});
});
