import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createWishlistComment,
	createWishlistItem,
	deleteWishlistComment,
	deleteWishlistItem,
	purchaseWishlistItem,
	releaseWishlistItem,
	reserveWishlistItem,
	updateWishlistItem,
	WishlistCommandError
} from '$lib/server/wishlist/commands';
import { loadWishlistQueryData, WishlistQueryError } from '$lib/server/wishlist/queries';
import { presentWishlistData } from '$lib/server/wishlist/presenters';
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

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	try {
		const queryData = await loadWishlistQueryData(supabase, params.familyId);
		return presentWishlistData(queryData, user.id);
	} catch (caught) {
		if (caught instanceof WishlistQueryError) console.error(caught.message);
		else console.error('Unexpected wishlist query failure', caught);
		throw error(500, 'No se pudo cargar la wishlist.');
	}
};

export const actions: Actions = {
	createItem: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const parsed = parseWishlistItemForm(await request.formData(), {
			familyId: params.familyId,
			ownerId: user.id
		});
		if (!parsed.success) return invalidForm(parsed.errors);

		try {
			await createWishlistItem(supabase, params.familyId, user.id, parsed.data);
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo crear el regalo.');
		}
	},

	updateItem: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const item = parseUuidField(formData, 'item_id');
		const version = parseVersionField(formData);
		const parsed = parseWishlistItemForm(formData, {
			familyId: params.familyId,
			ownerId: user.id
		});
		if (!item.success) return invalidForm(item.errors);
		if (!version.success) return invalidForm(version.errors);
		if (!parsed.success) return invalidForm(parsed.errors);

		try {
			await updateWishlistItem(
				supabase,
				params.familyId,
				user.id,
				item.data,
				version.data,
				parsed.data
			);
			return { success: true };
		} catch (caught) {
			return commandFailure(caught, 'No se pudo actualizar el regalo.');
		}
	},

	deleteItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const item = parseUuidField(await request.formData(), 'item_id');
		if (!item.success) return invalidForm(item.errors);

		try {
			await deleteWishlistItem(supabase, user.id, item.data);
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
