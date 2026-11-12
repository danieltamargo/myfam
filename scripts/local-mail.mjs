import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const copy = {
	es: {
		invitation: (title) => [
			`Te han invitado a ${title}`,
			'Abre MyFamily para aceptar la invitación.',
			'Ver invitación'
		],
		event: (title) => [
			`Se acerca ${title}`,
			'Consulta el calendario para ver los detalles.',
			'Abrir calendario'
		],
		birthday_wishlist: (title) => [
			`Se acerca el cumpleaños de ${title}`,
			'Puedes mirar su wishlist si buscas ideas para regalar.',
			'Ver wishlist'
		],
		event_wishlist: (title) => [
			`Se acerca el evento ${title}`,
			'Echa un vistazo a las wishlists de tu familia para preparar los regalos.',
			'Ver wishlists'
		]
	},
	en: {
		invitation: (title) => [
			`You’re invited to ${title}`,
			'Open MyFamily to accept the invitation.',
			'View invitation'
		],
		event: (title) => [
			`${title} is coming up`,
			'Check your family calendar for the details.',
			'Open calendar'
		],
		birthday_wishlist: (title) => [
			`${title}’s birthday is coming up`,
			'Take a look at their wishlist for gift ideas.',
			'View wishlist'
		],
		event_wishlist: (title) => [
			`${title} is coming up`,
			'Browse your family’s wishlists for gift ideas before the event.',
			'View wishlists'
		]
	}
};

const escapeHtml = (value) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;'
			})[character]
	);

function localUrl(value, schemes) {
	const url = new URL(value);
	if (!schemes.includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
		throw new Error('El correo de prueba solo puede usar servicios locales.');
	}
	return url;
}

async function main() {
	const args = process.argv.slice(2);
	const preview = args.includes('--preview');
	const authPreview = args.includes('--auth-preview');
	const watch = args.includes('--watch');
	if (
		args.some((arg) => !['--preview', '--auth-preview', '--watch'].includes(arg)) ||
		args.length > 1
	) {
		throw new Error('Uso: node scripts/local-mail.mjs [--preview | --auth-preview | --watch]');
	}
	const status = JSON.parse(
		execFileSync('supabase', ['status', '-o', 'json'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		})
	);
	const mailpit = localUrl(status.MAILPIT_URL ?? status.INBUCKET_URL, ['http:']);
	const origin = localUrl(process.env.MYFAMILY_LOCAL_ORIGIN ?? 'http://localhost:5173', ['http:']);
	const database = localUrl(status.DB_URL, ['postgres:', 'postgresql:']);
	const pendingQuery = readFileSync(new URL('./local-mail.sql', import.meta.url), 'utf8');
	const sql = (query) =>
		execFileSync('psql', ['-X', database.href, '-qAt', '-v', 'ON_ERROR_STOP=1'], {
			input: query,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe']
		});

	if (authPreview) {
		const api = localUrl(status.API_URL, ['http:']);
		const admin = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
		const redirect = new URL('/reset-password', origin);
		const recoveryEmail = `myfamily-recovery-${randomUUID()}@example.test`;
		async function authPost(path, key, body) {
			const url = new URL(`/auth/v1/${path}`, api);
			if (path !== 'admin/users') url.searchParams.set('redirect_to', redirect.href);
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					apikey: key,
					authorization: `Bearer ${key}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) throw new Error(`Auth rechazó la solicitud (HTTP ${response.status}).`);
		}
		await authPost('admin/users', admin, {
			email: recoveryEmail,
			email_confirm: true,
			password: randomUUID(),
			user_metadata: { locale: 'en' }
		});
		await authPost('recover', status.ANON_KEY, { email: recoveryEmail });
		await authPost('invite', admin, {
			email: `myfamily-invite-${randomUUID()}@example.test`,
			data: { locale: 'es' }
		});
		console.log('Solicitudes de bienvenida y recuperación enviadas a Mailpit.');
		return;
	}

	async function send(message) {
		const locale = message.locale === 'en' ? 'en' : 'es';
		const [subject, description, action] = copy[locale][message.kind](
			message.title?.trim() || (locale === 'es' ? 'tu familia' : 'your family')
		);
		const link = new URL(message.path, origin);
		const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<body style="margin:0;background:#f5f3ef;color:#272423;font-family:system-ui,sans-serif">
<main style="max-width:520px;margin:24px auto;padding:28px;background:#fff;border-radius:16px">
<p style="margin:0;color:#615093;font-weight:700">MyFamily</p>
<h1 style="font-size:26px">${escapeHtml(subject)}</h1>
<p>${escapeHtml(description)}</p>
<p><a style="display:inline-block;background:#574489;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none" href="${escapeHtml(link.href)}">${escapeHtml(action)}</a></p>
</main></body></html>`;
		const response = await fetch(new URL('/api/v1/send', mailpit), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				From: { Email: 'myfamily@example.test', Name: 'MyFamily' },
				To: [{ Email: message.email }],
				Subject: subject.replace(/[\r\n]+/g, ' '),
				Text: `${description}\n\n${action}: ${link.href}`,
				HTML: html
			}),
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) throw new Error(`Mailpit rechazó el mensaje (HTTP ${response.status}).`);
	}

	if (preview) {
		for (const locale of ['es', 'en']) {
			for (const [kind, title] of Object.entries({
				invitation: 'Test',
				event: 'Excursión',
				birthday_wishlist: 'Alex',
				event_wishlist: 'Reunión familiar'
			})) {
				await send({
					kind,
					title,
					locale,
					path: '/dashboard',
					email: 'myfamily-preview@example.test'
				});
			}
		}
		console.log('Ocho mensajes de prueba guardados en Mailpit.');
		return;
	}

	async function deliverPending() {
		const pending = JSON.parse(sql(pendingQuery));
		for (const message of pending) {
			await send(message);
			const key = Buffer.from(message.delivery_key).toString('base64');
			sql(`insert into public.transactional_email_deliveries (delivery_key)
				values (convert_from(decode('${key}', 'base64'), 'UTF8')) on conflict do nothing;`);
		}
		if (pending.length) console.log(`Mensajes guardados en Mailpit: ${pending.length}.`);
	}

	do {
		try {
			await deliverPending();
		} catch (error) {
			if (!watch) throw error;
			console.error('No se pudo procesar el correo local. Se reintentará en un minuto.');
		}
		if (watch) await setTimeout(60_000);
	} while (watch);
}

main().catch(() => {
	console.error('No se pudo procesar el correo local. Revisa Supabase, las migraciones y Mailpit.');
	process.exitCode = 1;
});
