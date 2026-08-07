# MyFamily

MyFamily es una aplicación web para coordinar la vida familiar con espacios compartidos y privados. Está construida con SvelteKit y Supabase y aplica autorización tanto en el servidor como en PostgreSQL mediante Row Level Security (RLS).

## Estado

El roadmap funcional está implementado y dispone de pruebas unitarias, de base de datos y end-to-end. El proyecto ofrece una base verificable para validación y despliegue controlado, pero aún requiere elegir infraestructura de producción, monitorización y una revisión independiente antes de almacenar datos reales.

### Módulos

| Área | Estado |
| --- | --- |
| Miembros, roles e invitaciones | Núcleo, siempre activo |
| Wishlist, reservas y comentarios anti-spoiler | Núcleo, siempre activo |
| Gastos, colecciones privadas, repartos y recurrencias | Disponible y configurable |
| Calendario, tareas y listas | Disponible y configurable |
| Notas, planner, comidas y hábitos | Disponible y configurable |
| Documentos privados | Disponible y configurable |
| Juegos | Deshabilitado y bloqueado también por URL directa |

No existe billing. Las preferencias familiares solo activan u ocultan módulos publicados; no representan una suscripción ni un entitlement comercial.

## Stack

- Node.js 24
- Svelte 5, SvelteKit 2, TypeScript y Vite 7
- Tailwind CSS 4 y daisyUI 5
- Supabase Auth, PostgreSQL, Storage, RLS y Edge Functions
- Paraglide para español e inglés
- Vitest, pgTAP y Playwright

## Puesta en marcha local

### Requisitos

- Node.js `>=24 <25`
- Docker Desktop
- Supabase CLI

```powershell
npm ci
Copy-Item .env.example .env
npx supabase start
npm run db:reset
npm run dev
```

Configura en `.env` únicamente las claves previstas por `.env.example`. Nunca expongas una clave `service_role` mediante variables `PUBLIC_*` o `VITE_*`.

`npm run db:reset` reconstruye la base local y elimina sus datos de prueba. No lo ejecutes contra un proyecto remoto.

## Calidad y pruebas

```powershell
npm run verify
npm run test:db
npm run test:e2e
```

`npm run verify` ejecuta comprobación de Svelte/TypeScript, formato y ESLint, pruebas unitarias y build de producción. Los E2E requieren Supabase local en ejecución.

Comandos útiles:

```powershell
# Regenerar tipos desde la base local migrada
npx supabase gen types typescript --local |
  Out-File -Encoding utf8 src/lib/types/database.ts

# Comprobar el esquema
npx supabase db lint --level warning

# Crear un volcado local antes de una operación de mantenimiento
npx supabase db dump --local --data-only --file backup.sql
```

## Límites operativos

- Las rutas de módulo se protegen en servidor; ocultar una entrada de navegación no concede ni revoca permisos.
- RLS es la frontera final de acceso a datos.
- El borrado de cuenta exige AAL2 y se rechaza si la persona es la única propietaria de una familia.
- Los archivos y recibos se sirven mediante URLs firmadas de corta duración.
- El adaptador de despliegue, backups programados, alertas y recuperación ante incidentes deben definirse para el entorno elegido.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Permisos y privacidad](docs/PERMISSIONS.md)
- [Catálogo y activación de módulos](docs/MODULES.md)
- [Frontera futura de entitlements](docs/MODULE_ENTITLEMENT_PROVIDER.md)
- [Auditoría final](docs/PROJECT_AUDIT_2026-08-07.md)
- [Configuración de autenticación](docs/AUTH_SETUP.md)
- [Configuración de 2FA](docs/2FA_SETUP.md)
- [Plantillas de email](docs/EMAIL_TEMPLATES.md)

La marca de producto y repositorio es **MyFamily**.
