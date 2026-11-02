import { readFile, lstat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bootstrapAdmin(envFile, email, create = createClient) {
	if (
		!envFile ||
		typeof email !== 'string' ||
		email.length > 254 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	) {
		throw new Error('Uso: node scripts/bootstrap-admin.mjs ENV_FILE CORREO_ADMIN');
	}
	const info = await lstat(envFile);
	if (!info.isFile() || info.isSymbolicLink())
		throw new Error('El entorno debe ser un archivo normal.');
	if (process.platform !== 'win32' && (info.mode & 0o077) !== 0)
		throw new Error('Protege el entorno con permisos 600 antes de continuar.');
	const source = await readFile(envFile, 'utf8');
	const env = parseEnv(source);
	const projectUrl = env.SUPABASE_PROJECT_URL || env.SUPABASE_URL;
	const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
	if (!projectUrl || !secret || !(env.ORIGIN || env.PUBLIC_SITE_URL))
		throw new Error('Faltan la URL, la clave del servicio o el origen público en el entorno.');
	const origin = new URL(env.ORIGIN || env.PUBLIC_SITE_URL);
	if (
		origin.protocol !== 'https:' ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash
	)
		throw new Error('El origen público debe ser una URL HTTPS sin ruta.');
	const ids = env.SUPER_ADMIN_USER_IDS?.trim()
		? env.SUPER_ADMIN_USER_IDS.split(',').map((id) => id.trim().toLowerCase())
		: [];
	if (ids.some((id) => !uuidPattern.test(id)))
		throw new Error('La lista de superadministradores contiene un identificador no válido.');
	const client = create(projectUrl, secret, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const normalizedEmail = email.trim().toLowerCase();
	let target;
	for (let page = 1; page <= 100; page += 1) {
		const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
		if (error) throw new Error('No se pudieron consultar los usuarios de Supabase.');
		target = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
		if (target || !data.nextPage) break;
		if (page === 100)
			throw new Error(
				'Se alcanzó el límite de búsqueda. Configura el UUID del administrador manualmente.'
			);
	}
	if (!target) {
		const { data, error } = await client.auth.admin.inviteUserByEmail(normalizedEmail, {
			redirectTo: new URL('/reset-password', origin).href
		});
		if (error || !data.user)
			throw new Error(
				'No se pudo invitar al administrador. Comprueba el servicio de correo antes de repetir.'
			);
		target = data.user;
	}
	if (target.banned_until && new Date(target.banned_until).getTime() > Date.now())
		throw new Error('El usuario está deshabilitado. Habilítalo antes de asignarle administración.');
	if (!uuidPattern.test(target.id))
		throw new Error('Supabase devolvió un identificador no válido.');
	const updatedIds = [...new Set([...ids, target.id.toLowerCase()])].join(',');
	const entries = source
		.split(/\r?\n/)
		.filter((line) => !/^\s*(?:export\s+)?SUPER_ADMIN_USER_IDS\s*=/.test(line));
	while (entries.at(-1) === '') entries.pop();
	await writeFile(envFile, `${entries.join('\n')}\nSUPER_ADMIN_USER_IDS=${updatedIds}\n`, {
		encoding: 'utf8',
		mode: 0o600
	});
	return { existing: Boolean(target.last_sign_in_at) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		await bootstrapAdmin(process.argv[2], process.argv[3]);
		console.log(
			'Superadministrador configurado. Inicia sesión y activa la verificación en dos pasos en tu perfil para acceder al panel.'
		);
	} catch (cause) {
		console.error(
			cause instanceof Error ? cause.message : 'No se pudo configurar el administrador.'
		);
		process.exitCode = 1;
	}
}
