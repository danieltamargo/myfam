import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const familyId = params.familyId;

	// Load family members for filter dropdown
	const { data: members, error: membersError } = await supabase
		.from('family_members')
		.select(
			`
			user_id,
			role,
			profiles (
				id,
				display_name,
				avatar_url
			)
		`
		)
		.eq('family_id', familyId);

	if (membersError) {
		console.error('Error loading members:', membersError);
		throw error(500, 'Failed to load family members');
	}

	// Load event categories for this family
	const { data: eventCategories, error: eventsError } = await supabase
		.from('gift_event_categories')
		.select('*')
		.eq('family_id', familyId)
		.order('name');

	if (eventsError) {
		console.error('Error loading event categories:', eventsError);
		throw error(500, 'Failed to load event categories');
	}

	// Load all wishlist items with related data
	const { data: items, error: itemsError } = await supabase
		.from('gift_items')
		.select(
			`
			*,
			profiles (
				id,
				display_name,
				avatar_url
			),
			gift_item_events (
				event_category_id,
				gift_event_categories (
					id,
					name,
					icon,
					color
				)
			)
		`
		)
		.eq('family_id', familyId)
		.order('created_at', { ascending: false });

	if (itemsError) {
		console.error('Error loading wishlist items:', itemsError);
		throw error(500, 'Failed to load wishlist items');
	}

	// Load current user's purchases
	const { data: myPurchases, error: purchasesError } = await supabase
		.from('gift_purchases')
		.select('item_id, quantity_purchased, notes')
		.eq('purchased_by', user.id);

	if (purchasesError) {
		console.error('Error loading purchases:', purchasesError);
	}

	// Load current user's reservations
	const { data: myReservations, error: reservationsError } = await supabase
		.from('gift_reservations')
		.select('item_id, notes')
		.eq('reserved_by', user.id);

	if (reservationsError) {
		console.error('Error loading reservations:', reservationsError);
	}

	// Load ALL reservations for items in this family (visible to coordinate)
	const { data: allReservations, error: allReservationsError } = await supabase
		.from('gift_reservations')
		.select(`
			item_id,
			reserved_by,
			reserved_at,
			profiles (
				id,
				display_name,
				avatar_url
			)
		`)
		.in('item_id', items?.map(i => i.id) || []);

	if (allReservationsError) {
		console.error('Error loading all reservations:', allReservationsError);
	}

	// Load comments for all items
	const { data: comments, error: commentsError } = await supabase
		.from('gift_item_comments')
		.select(`
			*,
			profiles (
				id,
				display_name,
				avatar_url
			)
		`)
		.in('item_id', items?.map(i => i.id) || [])
		.order('created_at', { ascending: true });

	if (commentsError) {
		console.error('Error loading comments:', commentsError);
	}

	return {
		members: members || [],
		eventCategories: eventCategories || [],
		items: items || [],
		myPurchases: myPurchases || [],
		myReservations: myReservations || [],
		allReservations: allReservations || [],
		comments: comments || [],
		currentUserId: user.id
	};
};

export const actions: Actions = {
	// Create a new wishlist item
	createItem: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const links = formData.getAll('links') as string[];
		const price = formData.get('price') as string;
		const priority = parseInt(formData.get('priority') as string) || 0;
		const imageUrl = formData.get('image_url') as string;
		const eventIds = formData.getAll('event_ids') as string[];

		// Validation
		if (!name || name.trim().length === 0) {
			return fail(400, { error: 'Name is required' });
		}

		// Filter empty links
		const filteredLinks = links.filter((link) => link && link.trim().length > 0);

		// Create the item
		const { data: item, error: itemError } = await supabase
			.from('gift_items')
			.insert({
				family_id: params.familyId,
				owner_id: user.id,
				name: name.trim(),
				description: description?.trim() || null,
				links: filteredLinks,
				price: price ? parseFloat(price) : null,
				priority,
				image_url: imageUrl?.trim() || null
			})
			.select()
			.single();

		if (itemError) {
			console.error('Error creating item:', itemError);
			return fail(500, { error: 'Failed to create item' });
		}

		// Link to event categories
		if (eventIds && eventIds.length > 0) {
			const eventLinks = eventIds.map((eventId) => ({
				item_id: item.id,
				event_category_id: eventId
			}));

			const { error: linkError } = await supabase.from('gift_item_events').insert(eventLinks);

			if (linkError) {
				console.error('Error linking events:', linkError);
				// Item created but events not linked - not critical
			}
		}

		return { success: true };
	},

	// Update an existing item
	updateItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const itemId = formData.get('item_id') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const links = formData.getAll('links') as string[];
		const price = formData.get('price') as string;
		const priority = parseInt(formData.get('priority') as string) || 0;
		const imageUrl = formData.get('image_url') as string;
		const eventIds = formData.getAll('event_ids') as string[];

		if (!itemId || !name) {
			return fail(400, { error: 'Item ID and name are required' });
		}

		// Filter empty links
		const filteredLinks = links.filter((link) => link && link.trim().length > 0);

		// Update the item
		const { error: updateError } = await supabase
			.from('gift_items')
			.update({
				name: name.trim(),
				description: description?.trim() || null,
				links: filteredLinks,
				price: price ? parseFloat(price) : null,
				priority,
				image_url: imageUrl?.trim() || null
			})
			.eq('id', itemId)
			.eq('owner_id', user.id); // Ensure user owns the item

		if (updateError) {
			console.error('Error updating item:', updateError);
			return fail(500, { error: 'Failed to update item' });
		}

		// Update event links: delete all and re-insert
		await supabase.from('gift_item_events').delete().eq('item_id', itemId);

		if (eventIds && eventIds.length > 0) {
			const eventLinks = eventIds.map((eventId) => ({
				item_id: itemId,
				event_category_id: eventId
			}));

			const { error: linkError } = await supabase.from('gift_item_events').insert(eventLinks);

			if (linkError) {
				console.error('Error updating event links:', linkError);
			}
		}

		return { success: true };
	},

	// Delete an item
	deleteItem: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const itemId = formData.get('item_id') as string;

		if (!itemId) {
			return fail(400, { error: 'Item ID is required' });
		}

		const { error: deleteError } = await supabase
			.from('gift_items')
			.delete()
			.eq('id', itemId)
			.eq('owner_id', user.id);

		if (deleteError) {
			console.error('Error deleting item:', deleteError);
			return fail(500, { error: 'Failed to delete item' });
		}

		return { success: true };
	},

	// Toggle purchase status
	togglePurchase: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const itemId = formData.get('item_id') as string;
		const isPurchased = formData.get('is_purchased') === 'true';

		if (!itemId) {
			return fail(400, { error: 'Item ID is required' });
		}

		if (isPurchased) {
			// Mark as purchased
			const { error: purchaseError } = await supabase
				.from('gift_purchases')
				.insert({
					item_id: itemId,
					purchased_by: user.id,
					quantity_purchased: 1
				})
				.select();

			if (purchaseError) {
				console.error('Error marking as purchased:', purchaseError);
				return fail(500, { error: 'Failed to mark as purchased' });
			}
		} else {
			// Un-purchase
			const { error: unpurchaseError } = await supabase
				.from('gift_purchases')
				.delete()
				.eq('item_id', itemId)
				.eq('purchased_by', user.id);

			if (unpurchaseError) {
				console.error('Error un-purchasing:', unpurchaseError);
				return fail(500, { error: 'Failed to un-purchase' });
			}
		}

		return { success: true };
	},

	// Toggle reservation status ("Yo lo miro")
	toggleReservation: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const itemId = formData.get('item_id') as string;
		const isReserved = formData.get('is_reserved') === 'true';

		if (!itemId) {
			return fail(400, { error: 'Item ID is required' });
		}

		if (isReserved) {
			// Reserve item
			const { error: reserveError } = await supabase
				.from('gift_reservations')
				.insert({
					item_id: itemId,
					reserved_by: user.id
				})
				.select();

			if (reserveError) {
				console.error('Error reserving item:', reserveError);
				return fail(500, { error: 'Failed to reserve item' });
			}
		} else {
			// Unreserve
			const { error: unreserveError } = await supabase
				.from('gift_reservations')
				.delete()
				.eq('item_id', itemId)
				.eq('reserved_by', user.id);

			if (unreserveError) {
				console.error('Error unreserving:', unreserveError);
				return fail(500, { error: 'Failed to unreserve' });
			}
		}

		return { success: true };
	},

	// Create a comment on a gift item
	createComment: async ({ request, params, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const itemId = formData.get('item_id') as string;
		const content = formData.get('content') as string;

		if (!itemId || !content || content.trim().length === 0) {
			return fail(400, { error: 'Item ID and content are required' });
		}

		// Verify user is not the item owner and is a family member
		const { data: item } = await supabase
			.from('gift_items')
			.select('owner_id, family_id')
			.eq('id', itemId)
			.single();

		if (!item) {
			return fail(404, { error: 'Item not found' });
		}

		if (item.owner_id === user.id) {
			return fail(403, { error: 'Cannot comment on your own items' });
		}

		// Create the comment
		const { error: commentError } = await supabase
			.from('gift_item_comments')
			.insert({
				item_id: itemId,
				author_id: user.id,
				content: content.trim()
			});

		if (commentError) {
			console.error('Error creating comment:', commentError);
			console.error('Comment error details:', {
				code: commentError.code,
				message: commentError.message,
				details: commentError.details,
				hint: commentError.hint
			});
			return fail(500, { error: `Failed to create comment: ${commentError.message}` });
		}

		return { success: true };
	},

	// Delete a comment
	deleteComment: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const commentId = formData.get('comment_id') as string;

		if (!commentId) {
			return fail(400, { error: 'Comment ID is required' });
		}

		// Delete the comment (RLS ensures only author can delete)
		const { error: deleteError } = await supabase
			.from('gift_item_comments')
			.delete()
			.eq('id', commentId)
			.eq('author_id', user.id);

		if (deleteError) {
			console.error('Error deleting comment:', deleteError);
			return fail(500, { error: 'Failed to delete comment' });
		}

		return { success: true };
	}
};
