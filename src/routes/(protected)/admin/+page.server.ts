import { error, fail, isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSupabaseAdmin } from '$lib/supabase-admin';
import { requireSuperAdmin } from '$lib/server/admin/access';
import {
	adminRpc,
	getTargetUser,
	PAGE_SIZE,
	pageNumber,
	parseNewUser,
	publicUser,
	runAuditedOperation,
	setUserEnabled
} from '$lib/server/admin/users';
import type { Actions, PageServerLoad } from './$types';

function welcomeUrl(origin: string): string {
	if (!env.ORIGIN) throw error(503, 'Configura el origen público antes de enviar invitaciones.');
	const url = new URL(env.ORIGIN);
	if (
		url.origin !== origin ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	)
		throw error(503, 'La URL de bienvenida no está configurada correctamente.');
	return new URL('/reset-password', url).href;
}

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	const actor = await requireSuperAdmin(locals);
	setHeaders({ 'cache-control': 'private, no-store' });
	const client = getSupabaseAdmin();
	const page = pageNumber(url.searchParams.get('page'));
	const businessPage = pageNumber(url.searchParams.get('businessPage'));
	const authPage = pageNumber(url.searchParams.get('authPage'));
	const [users, business, auth] = await Promise.all([
		client.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
		client
			.from('audit_logs')
			.select('id,created_at,user_id,action,module_name,resource_type,resource_id,family_id')
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.range((businessPage - 1) * PAGE_SIZE, businessPage * PAGE_SIZE),
		adminRpc(client).rpc('admin_auth_events', {
			p_limit: PAGE_SIZE + 1,
			p_offset: (authPage - 1) * PAGE_SIZE
		})
	]);
	if (users.error || business.error || auth.error)
		throw error(503, 'No se pudo cargar la administración. Inténtalo de nuevo.');
	return {
		actorId: actor.id,
		users: users.data.users.map(publicUser),
		page,
		hasMoreUsers: page < 9999 && Boolean(users.data.nextPage),
		business: (business.data ?? []).slice(0, PAGE_SIZE),
		businessPage,
		hasMoreBusiness: businessPage < 9999 && (business.data?.length ?? 0) > PAGE_SIZE,
		authEvents: (auth.data ?? []).slice(0, PAGE_SIZE),
		authPage,
		hasMoreAuth: authPage < 9999 && (auth.data?.length ?? 0) > PAGE_SIZE
	};
};

async function execute(
	event: Parameters<NonNullable<Actions['create']>>[0],
	action: 'create' | 'enable' | 'disable' | 'welcome'
) {
	const actor = await requireSuperAdmin(event.locals);
	try {
		const form = await event.request.formData();
		if (action === 'disable' && form.get('confirm') !== 'on')
			throw error(400, 'Confirma que quieres deshabilitar esta cuenta.');
		const input = action === 'create' ? parseNewUser(form) : null;
		const client = getSupabaseAdmin();
		if (input) {
			await runAuditedOperation(
				client,
				actor.id,
				null,
				'user_invited',
				async () => {
					const { data, error: inviteError } = await client.auth.admin.inviteUserByEmail(
						input.email,
						{
							data: { name: input.name },
							redirectTo: welcomeUrl(event.url.origin)
						}
					);
					if (inviteError || !data.user)
						throw error(
							503,
							'No se pudo crear la invitación. Comprueba si el usuario ya existe y la configuración del correo.'
						);
					return data.user.id;
				},
				(id) => id
			);
			return { success: 'Usuario invitado. Recibirá un correo para establecer su contraseña.' };
		}
		const target = await getTargetUser(client, form.get('userId'));
		if (action === 'welcome') {
			if (!target.email || publicUser(target).disabled)
				throw error(
					400,
					'Habilita al usuario y comprueba su correo antes de enviar la bienvenida.'
				);
			await runAuditedOperation(client, actor.id, target.id, 'user_welcome_sent', async () => {
				const { error: mailError } = await client.auth.resetPasswordForEmail(target.email!, {
					redirectTo: welcomeUrl(event.url.origin)
				});
				if (mailError) throw error(503, 'No se pudo enviar el correo de bienvenida.');
			});
			return { success: 'Se ha solicitado el envío del correo para establecer la contraseña.' };
		}
		await setUserEnabled(client, actor.id, target, action === 'enable');
		return {
			success:
				action === 'enable'
					? 'Usuario habilitado.'
					: 'Usuario deshabilitado. Sus sesiones ya no pueden acceder a los datos.'
		};
	} catch (caught) {
		if (isHttpError(caught)) return fail(caught.status, { error: caught.body.message });
		return fail(503, { error: 'No se pudo completar la operación administrativa.' });
	}
}

export const actions: Actions = {
	create: (event) => execute(event, 'create'),
	enable: (event) => execute(event, 'enable'),
	disable: (event) => execute(event, 'disable'),
	welcome: (event) => execute(event, 'welcome')
};
