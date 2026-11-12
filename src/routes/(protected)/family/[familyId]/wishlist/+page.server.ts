import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { guardModuleActions, requireModuleAvailable } from '$lib/server/modules/availability';
import {
	createWishlistComment,
	createWishlistItem,
	deleteWishlistComment,
	deleteWishlistItem,
	purchaseWishlistItem,
	receiveWishlistItem,
	revealReceivedWishlistBuyers,
	releaseWishlistItem,
	reserveWishlistItem,
	updateWishlistItem,
	WishlistCommandError
} from '$lib/server/wishlist/commands';
import {
	loadWishlistQueryData,
	loadReceivedWishlistHistory,
	WishlistQueryError
} from '$lib/server/wishlist/queries';
import { presentWishlistData } from '$lib/server/wishlist/presenters';
import {
	finalizeWishlistImage,
	loadWishlistImagePath,
	prepareWishlistImage,
	removeWishlistImage,
	rollbackWishlistImage,
	uploadWishlistImage,
	WishlistImageError,
	type PreparedWishlistImage
} from '$lib/server/wishlist/images';
import {
	parseBooleanField,
	parseCommentForm,
	parseCoordinationForm,
	parseUuidField,
	parseVersionField,
	parseWishlistItemForm,
	type ValidationErrors
} from '$lib/server/wishlist/schemas';

function invalidForm(errors: ValidationErrors) {
	return fail(400, {
		error: Object.values(errors)[0] ?? 'Los datos enviados no son válidos.',
		fieldErrors: errors
	});
}

function commandFailure(caught: unknown, fallback: string) {
	if (caught instanceof WishlistCommandError) return fail(caught.status, { error: caught.message });
	console.error(fallback, caught);
	return fail(500, { error: fallback });
}

function imageFailure(caught: unknown) {
	if (caught instanceof WishlistImageError) {
		return fail(caught.status, { error: caught.message, fieldErrors: { image: caught.message } });
	}
	return null;
}

async function rollbackAfterFailure(
	supabase: Parameters<typeof rollbackWishlistImage>[0],
	prepared: PreparedWishlistImage,
	caught: unknown,
	fallback: string
) {
	await rollbackWishlistImage(supabase, prepared);
	return imageFailure(caught) ?? commandFailure(caught, fallback);
}

export const load: PageServerLoad = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	await requireModuleAvailable(supabase, params.familyId, 'wishlist');
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	try {
		const showHistory = url.searchParams.get('view') === 'history';
		const queryData = await loadWishlistQueryData(supabase, params.familyId);
		const history = showHistory
			? await loadReceivedWishlistHistory(
					supabase,
					params.familyId,
					user.id,
					url.searchParams.get('history_page')
				)
			: { receivedItems: [], historyPage: 1, historyHasNext: false };
		return { ...presentWishlistData(queryData, user.id), ...history, showHistory };
	} catch (caught) {
		if (caught instanceof WishlistQueryError) console.error(caught.message);
		else console.error('Unexpected wishlist query failure', caught);
		throw error(500, 'No se pudo cargar la wishlist.');
	}
};

const moduleActions: Actions = {
	revealPurchased: async ({ params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const { data, error: revealError } = await supabase.rpc('reveal_purchased_gift_items', {
			p_family_id: params.familyId
		});
		if (revealError) return fail(500, { error: 'No se pudieron mostrar los regalos comprados.' });
		return { purchasedItemIds: data };
	},
	receiveItem: async ({ params, request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const item = parseUuidField(formData, 'item_id');
		const version = parseVersionField(formData);
		if (!item.success) return invalidForm(item.errors);
		if (!version.success) return invalidForm(version.errors);
		try {
			const { data: purchasedItemIds, error: revealError } = await supabase.rpc(
				'reveal_purchased_gift_items',
				{ p_family_id: params.familyId }
			);
			if (revealError) return fail(500, { error: 'No se pudo comprobar la compra.' });
			if (!purchasedItemIds?.includes(item.data)) {
				return fail(409, { error: 'El regalo debe tener una compra registrada.' });
			}
			await receiveWishlistItem(supabase, item.data, version.data);
			return { success: true, message: 'Regalo recibido. Puedes verlo en tu histórico.' };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo marcar el regalo como recibido.');
		}
	},
	revealBuyers: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });
		const item = parseUuidField(await request.formData(), 'item_id');
		if (!item.success) return invalidForm(item.errors);
		try {
			return {
				success: true,
				revealedItemId: item.data,
				revealedBuyers: await revealReceivedWishlistBuyers(supabase, item.data)
			};
		} catch (caught) {
			return commandFailure(caught, 'No se pudo revelar quién compró el regalo.');
		}
	},
	createItem: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		let prepared: PreparedWishlistImage;
		try {
			prepared = prepareWishlistImage(
				formData,
				{ familyId: params.familyId, ownerId: user.id },
				null
			);
		} catch (caught) {
			return imageFailure(caught) ?? commandFailure(caught, 'No se pudo preparar la imagen.');
		}
		const parsed = parseWishlistItemForm(formData, { familyId: params.familyId, ownerId: user.id });
		if (!parsed.success) return invalidForm(parsed.errors);

		try {
			await uploadWishlistImage(supabase, prepared);
			await createWishlistItem(supabase, params.familyId, user.id, parsed.data);
			await finalizeWishlistImage(supabase, prepared);
			return { success: true };
		} catch (caught) {
			return rollbackAfterFailure(supabase, prepared, caught, 'No se pudo crear el regalo.');
		}
	},

	updateItem: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const item = parseUuidField(formData, 'item_id');
		const version = parseVersionField(formData);
		if (!item.success) return invalidForm(item.errors);
		if (!version.success) return invalidForm(version.errors);
		let prepared: PreparedWishlistImage;
		try {
			const context = { familyId: params.familyId, ownerId: user.id, itemId: item.data };
			const previousPath = await loadWishlistImagePath(supabase, context, item.data);
			prepared = prepareWishlistImage(formData, context, previousPath);
		} catch (caught) {
			return imageFailure(caught) ?? commandFailure(caught, 'No se pudo preparar la imagen.');
		}
		const parsed = parseWishlistItemForm(formData, {
			familyId: params.familyId,
			ownerId: user.id
		});
		if (!parsed.success) return invalidForm(parsed.errors);

		try {
			await uploadWishlistImage(supabase, prepared);
			await updateWishlistItem(
				supabase,
				params.familyId,
				user.id,
				item.data,
				version.data,
				parsed.data
			);
			await finalizeWishlistImage(supabase, prepared);
			return { success: true };
		} catch (caught) {
			return rollbackAfterFailure(supabase, prepared, caught, 'No se pudo actualizar el regalo.');
		}
	},

	deleteItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const item = parseUuidField(await request.formData(), 'item_id');
		if (!item.success) return invalidForm(item.errors);

		try {
			const imagePath = await deleteWishlistItem(supabase, user.id, item.data);
			await removeWishlistImage(supabase, imagePath);
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar el regalo.');
		}
	},

	togglePurchase: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const coordination = parseCoordinationForm(formData);
		const purchased = parseBooleanField(formData, 'is_purchased');
		if (!coordination.success) return invalidForm(coordination.errors);
		if (!purchased.success) return invalidForm(purchased.errors);

		try {
			if (purchased.data)
				await purchaseWishlistItem(supabase, coordination.data.itemId, coordination.data.quantity);
			else await releaseWishlistItem(supabase, coordination.data.itemId, 'purchased');
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar la compra.');
		}
	},

	toggleReservation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const coordination = parseCoordinationForm(formData, 'considering');
		const reserved = parseBooleanField(formData, 'is_reserved');
		if (!coordination.success) return invalidForm(coordination.errors);
		if (!reserved.success) return invalidForm(reserved.errors);

		try {
			if (reserved.data)
				await reserveWishlistItem(
					supabase,
					coordination.data.itemId,
					coordination.data.quantity,
					coordination.data.status
				);
			else await releaseWishlistItem(supabase, coordination.data.itemId, 'considering');
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar la reserva.');
		}
	},

	createComment: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const comment = parseCommentForm(await request.formData());
		if (!comment.success) return invalidForm(comment.errors);

		try {
			await createWishlistComment(supabase, user.id, comment.data.itemId, comment.data.content);
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear el comentario.');
		}
	},

	deleteComment: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const comment = parseUuidField(await request.formData(), 'comment_id');
		if (!comment.success) return invalidForm(comment.errors);

		try {
			await deleteWishlistComment(supabase, user.id, comment.data);
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo eliminar el comentario.');
		}
	}
};

export const actions: Actions = guardModuleActions('wishlist', moduleActions);
