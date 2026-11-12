# MyFamily

MyFamily es una aplicación web para coordinar la vida familiar con espacios compartidos y privados. Está construida con SvelteKit y Supabase y aplica autorización tanto en el servidor como en PostgreSQL mediante Row Level Security (RLS).

## Estado

La vía actual de instalación está en [Despliegue guiado con Docker y nginx](docs/GUIDED_DEPLOYMENT.md). El propietario ejecuta los scripts: Supabase se instala junto a la aplicación y las copias son internas al VPS. Se han añadido [administración de usuarios y auditoría](docs/admin.md), registro cerrado y [avisos de cumpleaños con enlace a la wishlist](docs/BIRTHDAY_ALERTS.md). La incorporación inicial de **Mabu** queda pendiente del Excel. La evidencia de esta ampliación está en el [plan de despliegue y administración](docs/superpowers/plans/2026-11-01-guided-vps-admin-alerts.md); los párrafos siguientes conservan la validación histórica del MVP.

El MVP funcional, la recuperación MFA por contraseña/código y las mejoras de listas están implementados y verificados en local según el [plan actual](docs/superpowers/plans/2026-10-31-mvp.md). La [auditoría actual](docs/PROJECT_AUDIT_2026-10-31.md) registra 38/38 E2E en una única ejecución sobre Docker endurecido/Caddy, en escritorio y móvil y sin reintentos; 314 pruebas unitarias, 4 criptográficas de copias y 11 del ciclo de mantenimiento en Linux. La suite SQL anterior aprobó 900 aserciones y no se modificó la base de datos en esta fase. Las copias cifradas y la restauración aislada están ensayadas. El lanzamiento requiere configuración y validación real de VPS/TLS, SMTP/OAuth, copias programadas/externas y controles operativos.

El [ensayo operativo del 1 de noviembre](docs/LOCAL_OPERATIONS_2026-11-01.md) cerró restauración completa del núcleo Supabase, seis escenarios de caída/reinicio y carga de diez usuarios sin errores. El entorno de ensayo y sus secretos se retiraron sin modificar la instalación habitual. La versión de Storage usada en ese ensayo difiere de la CLI local; consultar el informe antes de preparar un servidor.

### Módulos

| Área | Estado |
| --- | --- |
| Miembros, roles e invitaciones | Núcleo, siempre activo |
| Wishlist, recibido, histórico y coordinación sin spoilers | Disponible y configurable; habilitado inicialmente |
| Gastos, repartos, recurrencias y reembolsos registrados | Disponible y configurable |
| Calendario interno y Google/Outlook | Disponible; sincronización en segundo plano al abrir y cada dos minutos, con comprobaciones incrementales |
| Tareas y listas | Disponible y configurable |
| Notas, planner, comidas y hábitos | Disponible y configurable |
| Documentos privados | Disponible y configurable |
| Juegos | Wordle, tres en raya, reacción y acertar el color; autoridad del servidor y configuración familiar |

No existe billing. Las preferencias familiares solo activan u ocultan módulos publicados; no representan una suscripción ni un entitlement comercial.

## Stack

- Node.js 24 y pnpm 10.30.3
- Svelte 5, SvelteKit 2, TypeScript y Vite 7
- Tailwind CSS 4 y daisyUI 5
- Supabase Auth, PostgreSQL, Storage, RLS y Edge Functions
- Paraglide para español e inglés
- Vitest, pgTAP y Playwright

## Puesta en marcha local

### Requisitos

- Node.js `>=24 <25` y Corepack
- Docker Desktop
- Supabase CLI 2.111.0 instalado y disponible en el PATH

```powershell
corepack enable
pnpm install --frozen-lockfile
if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
supabase start
supabase migration up --local
docker compose -f compose.antivirus.yaml up -d --wait --wait-timeout 600
pnpm dev
```

Configura en `.env` únicamente las claves previstas por `.env.example`. Nunca expongas una clave `service_role` mediante variables `PUBLIC_*` o `VITE_*`.

`pnpm db:reset` elimina todos los datos de la base local. Úsalo únicamente en una instancia desechable; no forma parte del arranque habitual. Las migraciones se aplican incrementalmente con `supabase migration up --local`.

## Aplicación en Docker y VPS

El `Dockerfile` genera un servidor Node con `adapter-node` y dependencias de producción. `compose.yaml` ejecuta la aplicación y ClamAV; Supabase se administra por separado. El puerto queda enlazado a `127.0.0.1:3000` para situar un proxy HTTPS delante. ClamAV reserva 3 GiB de RAM y tiene un límite de 4 GiB, además de la memoria necesaria para Supabase y Node; consulta [los límites de subidas y antivirus](docs/UPLOAD_SECURITY.md) antes de dimensionar el VPS.

La imagen fija `BODY_SIZE_LIMIT=16M`: admite documentos de hasta 15 MiB más el formulario multipart. Se conservan los límites por archivo de la aplicación: 5 MiB para imágenes de wishlist, 8 MiB para recibos y 15 MiB para documentos. Configura en el proxy un límite de petición de al menos 16 MiB. Si ejecutas `node build` directamente, exporta también `BODY_SIZE_LIMIT=16M`.

El adaptador comprueba ese límite al consumir el cuerpo de la petición. Una petición sin sesión puede recibir la redirección al login antes de que se lea su cuerpo, aunque supere 16 MiB. La subida autenticada al límite de 15 MiB debe comprobarse en QA con Supabase disponible.

1. Configura Supabase y aplica las migraciones del repositorio en ese entorno. Para producción, usa un proyecto gestionado o un despliegue independiente de [Supabase self-hosted](https://supabase.com/docs/guides/self-hosting/docker). Supabase CLI local está pensado para desarrollo y pruebas.
2. Crea `.env` siguiendo `.env.example`. Configura `VITE_SUPABASE_URL` para navegador y servidor, y `SUPABASE_PROJECT_URL` para las operaciones privadas del servidor. `127.0.0.1` dentro del contenedor apunta al propio contenedor, no al host. Si Supabase local corre en Docker Desktop, usa `http://host.docker.internal:54321` en ambas variables para la prueba local y verifica que el navegador alcance esa dirección. No dejes `SUPABASE_PROJECT_URL` apuntando a `127.0.0.1`: las subidas analizadas no alcanzarían Storage.
3. Añade `ORIGIN=https://tu-dominio.example` a `.env` (o `http://localhost:3000` para una prueba local). Configura en Supabase Auth la URL del sitio y los redirects para ese origen.
4. Construye y arranca la aplicación:

```sh
docker compose up -d --build
docker compose logs --tail=100 app
```

`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se incorporan al build y son públicas. Si cambian, reconstruye la imagen. Usa solo la clave pública/anon en esos argumentos; las claves secretas del servidor se inyectan mediante `.env` al arrancar. `.dockerignore` excluye los archivos de entorno del contexto de construcción.

Para un VPS, el repositorio incluye `compose.vps.yaml`, configuración Caddy y un override de volúmenes para una instalación Supabase nueva; no provisiona un stack completo de Supabase. Ese Compose se usa de forma independiente y solo publica 80/443 mediante Caddy; la aplicación no publica su puerto. Sigue las guías de [VPS](docs/VPS_OPERATIONS.md) y [copias](docs/BACKUPS.md) antes de usar datos reales. Las plantillas systemd permanecen sin activar y la copia externa requiere configuración.

Los [datos necesarios para el despliegue](docs/VPS_DEPLOYMENT_INPUTS.md) concretan servidor/acceso SSH, dominios y DNS, ubicación de Supabase, SMTP, destino de copias y contacto. Las credenciales se facilitan mediante archivos protegidos fuera del repositorio. Cuando estén preparados, ejecuta en Linux `pnpm check:vps --compose-env-file /srv/private/compose.env --env-file /srv/private/app.env --check-docker`. Consulta la guía para añadir la URL de compilación y el acceso administrativo por túnel. Esta comprobación solo valida configuración local y formatos; no acredita credenciales, DNS, TLS ni disponibilidad real.

## Calidad y pruebas

```powershell
pnpm verify
pnpm test:db
pnpm test:e2e
```

`pnpm verify` ejecuta comprobación de Svelte/TypeScript, formato y ESLint, pruebas unitarias y build de producción. Los E2E requieren Supabase local en ejecución y prueban escritorio y móvil sin reintentos: por defecto construyen producción y arrancan su vista previa; `PLAYWRIGHT_BASE_URL` permite apuntarlos a una instancia ya preparada, como Docker. `pnpm test:backup-cycle` requiere Linux y se ejecuta también en CI. `pnpm test:vps-config` prueba el comprobador de configuración VPS con archivos ficticios y se ejecuta en CI, sin Docker ni credenciales externas.

Comandos útiles:

```powershell
# Regenerar tipos desde la base local migrada
supabase gen types typescript --local |
  Out-File -Encoding utf8 src/lib/types/database.ts

# Comprobar el esquema
supabase db lint --level warning

# Crear un volcado local antes de una operación de mantenimiento
supabase db dump --local --data-only --file backup.sql
```

## Límites operativos

- Las rutas de módulo se protegen en servidor; ocultar una entrada de navegación no concede ni revoca permisos.
- RLS es la frontera final de acceso a datos.
- El borrado de cuenta exige AAL2 y se rechaza si la persona es la única propietaria de una familia.
- Los archivos y recibos se sirven mediante URLs firmadas de corta duración.
- El despliegue Node dispone de Dockerfile y Compose. Las herramientas de copia y recuperación están preparadas; programación, copia externa y alertas requieren configuración en el entorno elegido.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Permisos y privacidad](docs/PERMISSIONS.md)
- [Catálogo y activación de módulos](docs/MODULES.md)
- [Frontera futura de entitlements](docs/MODULE_ENTITLEMENT_PROVIDER.md)
- [Estado actual del MVP](docs/PROJECT_AUDIT_2026-10-31.md)
- [Plan del MVP](docs/superpowers/plans/2026-10-31-mvp.md)
- [Auditoría de seguridad](docs/SECURITY_AUDIT_2026-10-31.md)
- [Revisión antislop del hito](docs/ANTISLOP_REVIEW_2026-10-31.md)
- [Auditoría de Wishlist](docs/WISHLIST_MVP_AUDIT_2026-10-31.md)
- [Configuración de autenticación](docs/AUTH_SETUP.md)
- [Conexión con Google Calendar](docs/GOOGLE_CALENDAR_SETUP.md)
- [Conexión con Microsoft Calendar](docs/MICROSOFT_CALENDAR_SETUP.md)
- [Análisis y límites de archivos](docs/UPLOAD_SECURITY.md)
- [Configuración de 2FA](docs/2FA_SETUP.md)
- [Recuperación MFA](docs/mfa-recovery.md)
- [Copias de seguridad](docs/BACKUPS.md)
- [Operación en VPS](docs/VPS_OPERATIONS.md)
- [Datos necesarios para desplegar](docs/VPS_DEPLOYMENT_INPUTS.md)
- [Plan de recuperación, operación y listas](docs/superpowers/plans/2026-10-31-recovery-operations-lists.md)
- [Plantillas de email](docs/EMAIL_TEMPLATES.md)

Las listas incluyen tipos de compra, casa y otros, plantillas basadas en el histórico visible, sugerencias relacionadas y emojis locales. Las sugerencias no consultan servicios externos.

La marca de producto y repositorio es **MyFamily**.
