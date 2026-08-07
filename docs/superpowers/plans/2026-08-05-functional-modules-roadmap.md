# Functional Modules Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir MyFamily en un producto familiar funcional, con Wishlist como caso de uso principal, Gastos como segundo pilar y el resto de módulos organizativos construidos sobre una base segura, verificable y preparada para añadir gamificación, juegos y planes de pago más adelante.

**Architecture:** Mantener SvelteKit como frontera web y Supabase/Postgres como frontera definitiva de autorización. Separar disponibilidad global del módulo, activación por familia y futuros derechos de pago; usar roles familiares para el núcleo y ACL específicas para recursos con privacidad propia, como colecciones de gastos. Las mutaciones de varios pasos deben ejecutarse mediante funciones transaccionales y toda tabla multiusuario debe tener RLS y pruebas negativas.

**Tech Stack:** Svelte 5, SvelteKit 2, TypeScript estricto, Supabase Auth/Postgres/RLS/Realtime/Storage, Tailwind CSS 4, daisyUI 5, Paraglide, Vitest, Playwright y pgTAP/Supabase CLI.

---

## 1. Decisiones de producto

1. **Wishlist es núcleo del producto.** Siempre estará disponible para una familia y no dependerá de un toggle ni de un plan de pago.
2. **Juegos queda congelado, no eliminado.** Se oculta de la navegación, se bloquean sus rutas y se deniega acceso a sus tablas para `authenticated`. El código y los datos quedan recuperables.
3. **Miembros y perfil son infraestructura**, no módulos comercializables.
4. **Gastos usa privacidad por colección.** Ser propietario o administrador de una familia no concede acceso automático a una colección privada.
5. **Los módulos funcionales se liberan por valor y dependencia:** Wishlist, Gastos, Calendario, Tareas/Listas, Notas, Planner/Inicio, Comidas, Hábitos y Documentos.
6. **Gamificación, Juegos y Billing quedan fuera de este roadmap.** La arquitectura deja un punto de extensión, pero no introduce Stripe, puntos, logros ni paywalls ahora.
7. **Una moneda por colección de gastos en la primera versión.** Se guarda como código ISO 4217; no se implementan conversión ni contabilidad fiscal.
8. **Datos privados por defecto.** Las selecciones de participantes son explícitas y se validan en la base de datos.
9. **No se anuncia un módulo hasta cumplir su definición de terminado.**
10. **Fitness se concreta como Hábitos y rutinas.** No se almacenan métricas médicas, biometría ni diagnósticos en este roadmap.

## 2. Catálogo objetivo y prioridad

| Orden | Área                       | Resultado mínimo para publicarla                                                                                    |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0    | Seguridad, roles y calidad | RLS aislada por familia/recurso, operaciones sensibles atómicas, AAL2 efectivo, `check`/`lint`/tests/build en verde |
| P0    | Congelación de Juegos      | Sin navegación, rutas bloqueadas y acceso directo a tablas denegado                                                 |
| P1    | Wishlist                   | Flujo completo, anti-spoiler real, sin XSS, concurrencia controlada, responsive y cubierto por tests                |
| P2    | Gastos                     | Colecciones privadas, ACL, gastos/categorías/participantes, filtros temporales, dashboard y exportación             |
| P3    | Calendario                 | Eventos, participantes, recurrencia básica, recordatorios y vistas mensual/lista                                    |
| P3    | Tareas y Listas            | Asignación, vencimientos, repetición, listas de compra y estado en tiempo real                                      |
| P4    | Notas                      | Notas familiares seguras, búsqueda y visibilidad seleccionable                                                      |
| P4    | Planner / Inicio           | Vista agregada de próximos eventos, tareas, listas y resumen mensual de gastos                                      |
| P5    | Comidas                    | Plan semanal, recetas sencillas y envío de ingredientes a una lista de compra                                       |
| P5    | Hábitos                    | Seguimiento privado o compartido, sin gamificación                                                                  |
| P6    | Documentos                 | Metadatos, almacenamiento privado, permisos y caducidades                                                           |

## 3. Modelo de módulos preparado para billing futuro

No usar `family_modules.enabled` como prueba de pago. Separar tres preguntas:

```ts
export type ModuleId =
	| 'members'
	| 'wishlist'
	| 'expenses'
	| 'calendar'
	| 'tasks'
	| 'lists'
	| 'notes'
	| 'planner'
	| 'meals'
	| 'habits'
	| 'documents'
	| 'games';

export type ModuleAvailability = 'core' | 'available' | 'preview' | 'disabled';

export interface ModuleDefinition {
	id: ModuleId;
	availability: ModuleAvailability;
	familyCanDisable: boolean;
	href: (familyId: string) => string;
}
```

- **Disponibilidad global:** configuración versionada en `src/lib/config/modules.ts`.
- **Preferencia familiar:** `family_modules` indica si owner/admin quiere utilizar un módulo disponible.
- **Derecho comercial futuro:** una tabla independiente de entitlements resolverá el plan de pago.
- **Acceso efectivo futuro:** `globalmente disponible AND habilitado por familia AND permitido por entitlement`.
- En este roadmap el entitlement se considera siempre permitido y no se crea ninguna integración de pago.

## 4. Modelo de permisos objetivo

### Roles familiares

| Rol      | Capacidades                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `owner`  | Configuración familiar, transferencia de propiedad, roles, invitaciones, borrado y activación de módulos              |
| `admin`  | Invitaciones, gestión operativa de miembros no-owner y activación de módulos; nunca crear, degradar o eliminar owners |
| `member` | Uso de módulos y gestión de sus propios recursos                                                                      |

Invariantes:

- Toda familia tiene al menos un owner.
- La transferencia mantiene exactamente un owner en la primera versión.
- Nadie puede autoasignarse un rol.
- Un admin no puede crear, modificar ni eliminar owners.
- Transferir propiedad, borrar familia y eliminar cuenta requieren una sesión AAL2. Si el owner no ha inscrito TOTP, la operación se rechaza y se le dirige al alta de MFA.

### Roles de una colección de gastos

| Rol           | Capacidades                                                             |
| ------------- | ----------------------------------------------------------------------- |
| `owner`       | Todo, incluida transferencia, archivo y participantes                   |
| `manager`     | Participantes salvo owners, categorías y cualquier gasto                |
| `contributor` | Ver la colección y crear gastos; editar/eliminar únicamente los propios |
| `viewer`      | Solo lectura y dashboards                                               |

Reglas:

- El creador se convierte en owner dentro de la misma transacción.
- Solo miembros activos de la familia pueden pertenecer a una colección.
- Los invitados no ven datos hasta aceptar.
- El owner de familia no obtiene acceso implícito.
- No se puede eliminar ni degradar al último owner.

## 5. Mapa de archivos

### Archivos transversales a crear

- `src/lib/config/modules.ts`: catálogo tipado y disponibilidad.
- `src/lib/config/modules.test.ts`: contrato del catálogo.
- `src/lib/server/auth/authorization.ts`: helpers de sesión, familia, rol y AAL.
- `src/lib/server/auth/authorization.test.ts`: tests unitarios de decisiones de autorización.
- `src/lib/server/validation/common.ts`: UUID, fechas, moneda, texto y URL.
- `src/lib/server/notifications/service.ts`: creación segura de notificaciones desde servidor.
- `src/lib/server/audit/service.ts`: registro de eventos sensibles.
- `tests/e2e/auth.setup.ts`: sesiones de usuarios de prueba.
- `tests/e2e/family-roles.spec.ts`: límites de roles.
- `supabase/tests/database/001_family_roles_rls.test.sql`: aislamiento entre familias.
- `supabase/tests/database/002_notifications_rls.test.sql`: inserción/lectura de notificaciones.
- `playwright.config.ts` y `.github/workflows/ci.yml`.

### Wishlist

- `src/lib/server/wishlist/schemas.ts`: payloads y normalización.
- `src/lib/server/wishlist/queries.ts`: lecturas autorizadas.
- `src/lib/server/wishlist/commands.ts`: comandos y llamadas RPC.
- `src/lib/server/wishlist/presenters.ts`: vista anti-spoiler.
- `src/lib/components/wishlist/WishlistItemForm.svelte`: formulario único create/edit.
- `src/lib/components/wishlist/WishlistItemDetails.svelte`: detalle accesible sin HTML inseguro.
- `src/lib/components/wishlist/WishlistCoordination.svelte`: reservas, compras y comentarios ocultos al destinatario.
- `tests/e2e/wishlist.spec.ts`.
- `supabase/tests/database/010_wishlist_rls.test.sql`.
- `supabase/tests/database/011_wishlist_concurrency.test.sql`.

### Gastos

- `src/lib/server/expenses/schemas.ts`.
- `src/lib/server/expenses/queries.ts`.
- `src/lib/server/expenses/commands.ts`.
- `src/lib/server/expenses/filters.ts`.
- `src/routes/(protected)/family/[familyId]/expenses/+page.server.ts`.
- `src/routes/(protected)/family/[familyId]/expenses/+page.svelte`.
- `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+layout.server.ts`.
- `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+page.server.ts`.
- `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+page.svelte`.
- `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/settings/+page.server.ts`.
- `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/settings/+page.svelte`.
- `src/lib/components/expenses/ExpenseCollectionCard.svelte`.
- `src/lib/components/expenses/ExpenseForm.svelte`.
- `src/lib/components/expenses/ExpenseFilters.svelte`.
- `src/lib/components/expenses/ExpenseSummary.svelte`.
- `src/lib/components/expenses/ExpenseBreakdown.svelte`.
- `src/lib/components/expenses/ExpenseTable.svelte`.
- `tests/e2e/expenses.spec.ts`.
- `supabase/tests/database/020_expenses_rls.test.sql`.
- `supabase/tests/database/021_expenses_aggregates.test.sql`.

### Organizadores posteriores

- `src/lib/server/calendar/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/calendar/+page.server.ts` y `+page.svelte`.
- `src/lib/server/tasks/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/tasks/+page.server.ts` y `+page.svelte`.
- `src/lib/server/lists/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/lists/+page.server.ts` y `+page.svelte`.
- `src/lib/server/notes/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/notes/+page.server.ts` y `+page.svelte`.
- `src/routes/(protected)/family/[familyId]/planner/+page.server.ts` y `+page.svelte` para la vista agregada.
- `src/lib/server/meals/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/meals/+page.server.ts` y `+page.svelte`.
- `src/lib/server/habits/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/habits/+page.server.ts` y `+page.svelte`.
- `src/lib/server/documents/schemas.ts`, `queries.ts` y `commands.ts`.
- `src/routes/(protected)/family/[familyId]/documents/+page.server.ts` y `+page.svelte`.

### Migraciones previstas

- `supabase/migrations/20260805090000_security_baseline.sql`.
- `supabase/migrations/20260805091000_atomic_family_operations.sql`.
- `supabase/migrations/20260805092000_disable_games.sql`.
- `supabase/migrations/20260805100000_wishlist_hardening.sql`.
- `supabase/migrations/20260805110000_expenses_module.sql`.
- `supabase/migrations/20260805111000_expense_splits_recurring.sql`.
- `supabase/migrations/20260805120000_calendar_module.sql`.
- `supabase/migrations/20260805121000_tasks_and_lists_modules.sql`.
- `supabase/migrations/20260805122000_notes_module.sql`.
- `supabase/migrations/20260805123000_meals_and_habits_modules.sql`.
- `supabase/migrations/20260805124000_documents_module.sql`.
- `supabase/migrations/20260805130000_module_preferences.sql`.

Los timestamps son nombres planificados; cada migración debe probarse sobre una base vacía y sobre una copia de la secuencia actual antes de integrarse.

---

### Task 1: Establecer una línea base verificable

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `eslint.config.js`
- Create: `playwright.config.ts`
- Create: `.github/workflows/ci.yml`
- Create: `src/lib/config/modules.test.ts`

- [x] **Step 1: Añadir scripts separados de verificación**

```json
{
	"scripts": {
		"test:unit": "vitest run",
		"test:db": "supabase test db",
		"test:e2e": "playwright test",
		"verify": "npm run check && npm run lint && npm run test:unit && npm run build"
	}
}
```

- [x] **Step 2: Escribir un smoke test de Vitest que falle si no puede importar código del proyecto**
- [x] **Step 3: Reparar la configuración de ESLint y los errores actuales de `svelte-check` sin cambiar comportamiento**
- [x] **Step 4: Ejecutar `npm run check`, `npm run lint`, `npm run test:unit` y `npm run build`**
- [x] **Step 5: Configurar CI con instalación bloqueada, Supabase local, tests DB, unitarios, E2E y build**
- [x] **Step 6: Confirmar que una ruptura intencionada hace fallar CI y revertir únicamente esa ruptura**
- [x] **Step 7: Commit: `chore: establish verified development baseline`**

**Gate:** no empieza Wishlist mientras `check` o lint sigan en rojo.

### Task 2: Congelar Juegos de forma reversible

**Files:**

- Create: `src/lib/config/modules.ts`
- Create: `src/lib/server/modules/availability.ts`
- Modify: `src/routes/(protected)/family/[familyId]/+layout.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/games/+page.server.ts`
- Modify: `src/routes/(protected)/family/[familyId]/games/play/[roomId]/+page.server.ts`
- Create: `supabase/migrations/20260805092000_disable_games.sql`
- Test: `src/lib/config/modules.test.ts`
- Test: `supabase/tests/database/003_games_disabled.test.sql`

- [x] **Step 1: Escribir el test del catálogo con `wishlist=core` y `games=disabled`**
- [x] **Step 2: Implementar el catálogo tipado mostrado en la sección 3**
- [x] **Step 3: Generar la navegación desde el catálogo y excluir módulos `disabled`**
- [x] **Step 4: Añadir guardas servidor que respondan 404 para las dos rutas de Juegos**
- [x] **Step 5: Añadir políticas restrictivas `USING (false) WITH CHECK (false)` sobre todas las tablas de juegos para `authenticated`**
- [x] **Step 6: Probar que UI, URL directa y PostgREST no permiten acceder, y que no se elimina ningún dato**
- [x] **Step 7: Commit: `feat: freeze games behind disabled module gate`**

### Task 3: Cerrar escaladas de rol y exposición entre familias

**Files:**

- Create: `supabase/migrations/20260805090000_security_baseline.sql`
- Create: `src/lib/server/auth/authorization.ts`
- Test: `supabase/tests/database/001_family_roles_rls.test.sql`
- Test: `supabase/tests/database/002_notifications_rls.test.sql`

- [x] **Step 1: Escribir casos pgTAP con Alice/Bob en familia A y Carol en familia B**
- [x] **Step 2: Demostrar que actualmente Bob puede intentar autoasignarse owner y que las invitaciones/perfiles se exponen**
- [x] **Step 3: Eliminar `can_insert_family_members` y reemplazar altas por funciones transaccionales autorizadas**
- [x] **Step 4: Impedir a admin insertar, actualizar o borrar un owner**
- [x] **Step 5: Sustituir lectura global de `profiles` por una proyección pública sin email y acceso al perfil completo solo para el titular**
- [x] **Step 6: Eliminar la política global de invitaciones; destinatario, emisor y gestores autorizados serán los únicos lectores**
- [x] **Step 7: Revocar inserción cliente de notificaciones; crearlas mediante servicio/RPC con tipo y enlace internos validados**
- [x] **Step 8: Mover helpers RLS a esquema `private`, fijar `search_path = ''`, comprobar `auth.uid()` y revocar ejecución pública**
- [x] **Step 9: Indexar todas las FK y columnas usadas por RLS**
- [x] **Step 10: Ejecutar `npm run test:db` y verificar todos los casos negativos**
- [x] **Step 11: Commit: `fix: enforce least privilege across family data`**

### Task 4: Hacer atómicas las operaciones sensibles de familia

**Files:**

- Create: `supabase/migrations/20260805091000_atomic_family_operations.sql`
- Modify: `src/routes/(protected)/families/+page.server.ts`
- Modify: `src/routes/(protected)/family/[familyId]/members/+page.server.ts`
- Modify: `src/routes/(protected)/profile/+page.server.ts`
- Modify: `src/lib/server/auth/authorization.ts`
- Test: `tests/e2e/family-roles.spec.ts`

- [x] **Step 1: Escribir tests para crear familia, aceptar invitación, transferir propiedad, expulsar y abandonar**
- [x] **Step 2: Crear RPC `create_family(name)` que inserte familia, owner y categorías Wishlist en una transacción**
- [x] **Step 3: Crear RPC `transfer_family_ownership(family_id, target_user_id)` con bloqueo de filas e invariante de owner único**
- [x] **Step 4: Crear RPC `remove_family_member(family_id, target_user_id)` que proteja owners**
- [x] **Step 5: Comprobar AAL2 en servidor para transferencia, borrado de familia y borrado de cuenta**
- [x] **Step 6: Retirar `supabaseAdmin` de la creación ordinaria de familias**
- [x] **Step 7: Registrar estas operaciones en `audit_logs` desde la transacción**
- [x] **Step 8: Ejecutar tests DB y E2E**
- [x] **Step 9: Commit: `fix: make family ownership operations atomic`**

---

## 6. Wishlist: definición cerrada

Wishlist se considera terminada cuando:

- Un miembro crea, edita, archiva y elimina sus regalos.
- Puede indicar descripción, prioridad, cantidad deseada, precio estimado, moneda, imagen y varios enlaces.
- Puede asociarlos a una o varias categorías de regalo.
- Los demás coordinan `considering`, `reserved` y `purchased` sin que el destinatario pueda consultar esos datos ni por UI ni por API.
- Las cantidades no pueden superar la cantidad deseada.
- Comentarios y menciones de coordinación siguen la misma privacidad anti-spoiler.
- No se renderiza HTML controlado por usuarios.
- Realtime no duplica elementos ni pierde estado.
- Hay estados vacíos, errores recuperables, accesibilidad de teclado y diseño móvil.
- Existe exportación JSON/CSV del wishlist propio.
- RLS, concurrencia, acciones de servidor y recorrido E2E están probados.

### Task 5: Consolidar el modelo de Wishlist

**Files:**

- Create: `supabase/migrations/20260805100000_wishlist_hardening.sql`
- Create: `supabase/tests/database/010_wishlist_rls.test.sql`
- Create: `supabase/tests/database/011_wishlist_concurrency.test.sql`
- Modify: `src/lib/types/database.ts` mediante regeneración

- [x] **Step 1: Escribir tests anti-spoiler para item owner, coordinador y miembro de otra familia**
- [x] **Step 2: Añadir `desired_quantity smallint NOT NULL DEFAULT 1 CHECK (desired_quantity > 0)`**
- [x] **Step 3: Añadir `currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$')` y validar `price >= 0`**
- [x] **Step 4: Añadir `status` con valores `active`, `fulfilled` y `archived`**
- [x] **Step 5: Añadir `version bigint NOT NULL DEFAULT 1` para control optimista**
- [x] **Step 6: Corregir RLS para ocultar reservas, compras, comentarios y menciones al propietario del item**
- [x] **Step 7: Añadir RPC transaccionales `reserve_gift_item`, `purchase_gift_item` y `release_gift_item` con bloqueo `FOR UPDATE`**
- [x] **Step 8: Validar dentro de cada RPC pertenencia, anti-spoiler y suma de cantidades**
- [x] **Step 9: Crear bucket privado `gift-images` y políticas por familia/propietario; guardar paths, no URLs arbitrarias**
- [x] **Step 10: Regenerar `src/lib/types/database.ts` desde la base migrada**
- [x] **Step 11: Ejecutar tests DB sobre base limpia**
- [x] **Step 12: Commit: `feat: harden wishlist data and anti-spoiler rules`**

### Task 6: Separar dominio Wishlist de la página

**Files:**

- Create: `src/lib/server/wishlist/schemas.ts`
- Create: `src/lib/server/wishlist/queries.ts`
- Create: `src/lib/server/wishlist/commands.ts`
- Create: `src/lib/server/wishlist/presenters.ts`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/+page.server.ts`
- Test: `src/lib/server/wishlist/schemas.test.ts`
- Test: `src/lib/server/wishlist/presenters.test.ts`

- [x] **Step 1: Escribir tests para nombres vacíos, precios negativos, monedas inválidas, URLs inseguras y cantidades**
- [x] **Step 2: Definir esquemas que acepten únicamente `https:` para enlaces externos y límites explícitos de longitud**
- [x] **Step 3: Mover lecturas a `queries.ts` y devolver DTOs sin datos anti-spoiler al owner**
- [x] **Step 4: Mover mutaciones a `commands.ts` y usar las RPC atómicas**
- [x] **Step 5: Reducir `+page.server.ts` a carga, parseo, autorización y delegación**
- [x] **Step 6: Eliminar `any` relacionados con Wishlist**
- [x] **Step 7: Ejecutar tests unitarios y `npm run check`**
- [x] **Step 8: Commit: `refactor: isolate wishlist domain logic`**

### Task 7: Unificar create/edit y eliminar XSS

**Files:**

- Create: `src/lib/components/wishlist/WishlistItemForm.svelte`
- Create: `src/lib/components/wishlist/WishlistItemDetails.svelte`
- Modify: `src/lib/components/wishlist/GiftComments.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/components/WishlistEditModal.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/components/WishlistItemModal.svelte`
- Modify: `src/lib/components/modals/ConfirmationModal.svelte`

- [x] **Step 1: Escribir un test de componente con `<img src=x onerror=...>` como nombre/comentario**
- [x] **Step 2: Crear un único formulario sin formularios anidados para alta y edición**
- [x] **Step 3: Renderizar comentarios y menciones como nodos de texto/componentes, nunca mediante `{@html}`**
- [x] **Step 4: Cambiar ConfirmationModal para recibir texto y snippets seguros en lugar de HTML interpolado**
- [x] **Step 5: Añadir estados de envío, errores por campo, foco inicial y retorno de foco**
- [x] **Step 6: Ejecutar `svelte-autofixer` sobre cada componente modificado hasta obtener cero incidencias**
- [x] **Step 7: Ejecutar unit tests, `npm run check` y lint**
- [x] **Step 8: Commit: `fix: remove stored xss from wishlist flows`**

### Task 8: Completar coordinación, filtros y tiempo real

**Files:**

- Create: `src/lib/components/wishlist/WishlistCoordination.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/+page.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/components/WishlistFilters.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/components/WishlistCards.svelte`
- Modify: `src/routes/(protected)/family/[familyId]/wishlist/components/WishlistTable.svelte`
- Test: `tests/e2e/wishlist.spec.ts`

- [x] **Step 1: Escribir E2E con owner del regalo, comprador y usuario externo**
- [x] **Step 2: Implementar filtros por miembro, categoría, prioridad y estado con query string compartible**
- [x] **Step 3: Implementar coordinación sobre las RPC y mostrar cantidades restantes solo a no-owners**
- [x] **Step 4: Reconciliar eventos Realtime por ID/version para evitar duplicados**
- [x] **Step 5: Añadir deep link seguro `/family/:familyId/wishlist?item=:itemId`**
- [x] **Step 6: Añadir exportación del wishlist propio sin datos de coordinación**
- [x] **Step 7: Verificar desktop, móvil, teclado y lector de pantalla básico**
- [x] **Step 8: Ejecutar test DB, unitario, E2E, check, lint y build**
- [x] **Step 9: Commit: `feat: complete wishlist coordination experience`**

**Gate Wishlist:** no empezar Gastos hasta que Wishlist tenga cero hallazgos P0/P1, todos los comandos de verificación estén verdes y el flujo E2E de tres usuarios pase.

---

## 7. Gastos: especificación funcional

### Modelo de datos

```sql
create table public.expense_collections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_collection_members (
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'contributor', 'viewer')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'revoked', 'left')),
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  removed_at timestamptz,
  primary key (collection_id, user_id)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  name text not null,
  color text,
  icon text,
  unique (collection_id, name),
  unique (collection_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.expense_collections(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  paid_by uuid not null references public.profiles(id),
  description text not null check (char_length(trim(description)) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null,
  notes text,
  receipt_path text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (collection_id, created_by)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, paid_by)
    references public.expense_collection_members(collection_id, user_id),
  foreign key (collection_id, category_id)
    references public.expense_categories(collection_id, id)
);
```

Índices mínimos:

- `expense_collection_members(user_id, status, collection_id)`.
- `expenses(collection_id, occurred_on DESC, id DESC)` para filtros y paginación cursor.
- `expenses(collection_id, category_id, occurred_on)`.
- `expenses(collection_id, paid_by, occurred_on)`.
- Índice parcial de colecciones activas por miembro si el plan de consulta lo justifica.

### Filtros del dashboard

Un único tipo compartido:

```ts
export type ExpensePeriod =
	| { preset: 'month'; anchor: string }
	| { preset: 'quarter'; anchor: string }
	| { preset: 'year'; anchor: string }
	| { preset: 'custom'; from: string; to: string };
```

El dashboard mostrará:

- Total del periodo y comparación con el periodo anterior equivalente.
- Desglose por categoría.
- Desglose por pagador.
- Evolución diaria o mensual según amplitud.
- Últimos gastos con paginación cursor.
- Filtros por colección, miembro y categoría.
- Exportación CSV del intervalo visible.

### Task 9: Crear colecciones y ACL de Gastos

**Files:**

- Create: `supabase/migrations/20260805110000_expenses_module.sql`
- Create: `supabase/tests/database/020_expenses_rls.test.sql`
- Create: `src/lib/server/expenses/schemas.ts`
- Create: `src/lib/server/expenses/commands.ts`

- [x] **Step 1: Escribir pgTAP para owner/manager/contributor/viewer, invitado y miembro no invitado**
- [x] **Step 2: Crear las cuatro tablas y todos los índices/FK descritos**
- [x] **Step 3: Crear RPC transaccional `create_expense_collection` que active al creador como owner**
- [x] **Step 4: Crear RPC `invite_expense_collection_member` y `accept_expense_collection_invitation`**
- [x] **Step 5: Crear RPC `change_expense_collection_role` y `transfer_expense_collection_ownership`**
- [x] **Step 6: Aplicar RLS: solo miembros activos leen; los cambios de membresía/rol pasan exclusivamente por RPC; contributor muta solo gastos propios; viewer solo lee**
- [x] **Step 7: Revocar o abandonar mediante cambio de estado para conservar referencias históricas y retirar acceso inmediatamente**
- [x] **Step 8: Validar que family owner sin membresía no puede ver la colección**
- [x] **Step 9: Fijar `search_path`, revocar ejecución no necesaria y regenerar tipos**
- [x] **Step 10: Ejecutar `npm run test:db`**
- [x] **Step 11: Commit: `feat: add private expense collections and acl`**

### Task 10: Implementar gestión de colecciones y gastos

**Files:**

- Create: `src/lib/server/expenses/queries.ts`
- Create: `src/routes/(protected)/family/[familyId]/expenses/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/expenses/+page.svelte`
- Create: `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+layout.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/+page.svelte`
- Create: `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/settings/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/expenses/[collectionId]/settings/+page.svelte`

- [x] **Step 1: Escribir tests unitarios de moneda, importe, fecha, participante y permisos**
- [x] **Step 2: Implementar listado de colecciones accesibles con invitaciones pendientes**
- [x] **Step 3: Implementar alta, edición y archivo de colección**
- [x] **Step 4: Implementar gestión de participantes y roles según la matriz**
- [x] **Step 5: Implementar categorías personalizadas con un conjunto inicial doméstico**
- [x] **Step 6: Implementar CRUD de gastos con control optimista por `version`**
- [x] **Step 7: Subir recibos a bucket privado y entregar URLs firmadas de corta duración**
- [x] **Step 8: Añadir paginación cursor `(occurred_on, id)`**
- [x] **Step 9: Ejecutar `svelte-autofixer` y tests**
- [x] **Step 10: Commit: `feat: implement expense collection management`**

### Task 11: Implementar dashboard temporal de Gastos

**Files:**

- Create: `src/lib/server/expenses/filters.ts`
- Create: `src/lib/components/expenses/ExpenseFilters.svelte`
- Create: `src/lib/components/expenses/ExpenseSummary.svelte`
- Create: `src/lib/components/expenses/ExpenseBreakdown.svelte`
- Create: `src/lib/components/expenses/ExpenseTable.svelte`
- Test: `supabase/tests/database/021_expenses_aggregates.test.sql`
- Test: `tests/e2e/expenses.spec.ts`

- [x] **Step 1: Escribir tests de límites de mes, trimestre, año, bisiesto y rango personalizado**
- [x] **Step 2: Implementar cálculo UTC/fecha local sin convertir `DATE` a instantes ambiguos**
- [x] **Step 3: Crear funciones agregadas `SECURITY INVOKER` que respeten RLS**
- [x] **Step 4: Implementar total, comparación, categoría, pagador y serie temporal**
- [x] **Step 5: Sincronizar filtros con query string**
- [x] **Step 6: Implementar CSV con las mismas reglas de acceso y filtros**
- [x] **Step 7: Probar que viewer puede consultar/exportar y no puede mutar**
- [x] **Step 8: Probar 1.000+ gastos y revisar `EXPLAIN (ANALYZE, BUFFERS)` de consultas críticas**
- [x] **Step 9: Ejecutar test DB, unitario, E2E, check, lint y build**
- [x] **Step 10: Commit: `feat: add expense analytics and period filters`**

### Task 12: Añadir reparto y recurrencia a Gastos

**Files:**

- Create: `supabase/migrations/20260805111000_expense_splits_recurring.sql`
- Create: `src/lib/components/expenses/ExpenseSplitEditor.svelte`
- Create: `src/lib/components/expenses/RecurringExpenseForm.svelte`
- Test: `supabase/tests/database/022_expense_splits.test.sql`

- [x] **Step 1: Añadir `expense_splits(expense_id, user_id, amount)` con suma exacta igual al gasto**
- [x] **Step 2: Permitir reparto equitativo o importes manuales entre participantes activos**
- [x] **Step 3: Añadir reglas recurrentes mensuales/semanales sin llamadas externas dentro de transacciones**
- [x] **Step 4: Generar ocurrencias idempotentes con clave única por regla y fecha**
- [x] **Step 5: Mostrar balances informativos por miembro sin introducir pagos ni liquidaciones**
- [x] **Step 6: Probar redondeo, cambio de participantes e idempotencia**
- [x] **Step 7: Commit: `feat: add expense splits and recurring entries`**

**Gate Gastos:** aislamiento de colección demostrado, dashboard exacto en todas las ventanas temporales, exportación consistente y cero dependencia del rol owner de familia.

---

## 8. Módulos organizativos

Cada módulo reutiliza autorización familiar, validación, auditoría, notificaciones y convenciones de tests. No debe reutilizar ACL mediante claves polimórficas sin FK.

### Task 13: Calendario

**Files:**

- Create: `supabase/migrations/20260805120000_calendar_module.sql`
- Create: `src/lib/server/calendar/schemas.ts`
- Create: `src/lib/server/calendar/queries.ts`
- Create: `src/lib/server/calendar/commands.ts`
- Create: `src/routes/(protected)/family/[familyId]/calendar/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/calendar/+page.svelte`
- Test: `supabase/tests/database/030_calendar_rls.test.sql`
- Test: `tests/e2e/calendar.spec.ts`

- [x] **Step 1: Modelar eventos con inicio/fin `timestamptz`, zona horaria IANA, all-day y participantes**
- [x] **Step 2: Implementar visibilidad `family` o `selected_members`**
- [x] **Step 3: Implementar repetición diaria/semanal/mensual con horizonte acotado**
- [x] **Step 4: Crear vistas mensual y agenda, más filtros por participante**
- [x] **Step 5: Añadir recordatorios internos y deep links seguros**
- [x] **Step 6: Permitir vínculo opcional entre categoría Wishlist y evento sin fusionar ambos conceptos**
- [x] **Step 7: Probar DST, eventos cruzando medianoche, RLS y recurrencia**
- [x] **Step 8: Commit: `feat: add shared family calendar`**

### Task 14: Tareas y listas de compra

**Files:**

- Create: `supabase/migrations/20260805121000_tasks_and_lists_modules.sql`
- Create: `src/lib/server/tasks/schemas.ts`
- Create: `src/lib/server/tasks/queries.ts`
- Create: `src/lib/server/tasks/commands.ts`
- Create: `src/lib/server/lists/schemas.ts`
- Create: `src/lib/server/lists/queries.ts`
- Create: `src/lib/server/lists/commands.ts`
- Create: `src/routes/(protected)/family/[familyId]/tasks/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/tasks/+page.svelte`
- Create: `src/routes/(protected)/family/[familyId]/lists/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/lists/+page.svelte`
- Test: `supabase/tests/database/040_tasks_lists_rls.test.sql`
- Test: `tests/e2e/tasks-lists.spec.ts`

- [x] **Step 1: Modelar grupos de tareas, responsables, vencimiento, prioridad, estado y recurrencia**
- [x] **Step 2: Modelar listas compartidas con items, cantidad, unidad, orden y completado por**
- [x] **Step 3: Permitir listas privadas o seleccionadas mediante membresía explícita**
- [x] **Step 4: Implementar vistas `mías`, `familia`, vencidas y próximas**
- [x] **Step 5: Implementar lista de compra móvil con actualización optimista y reconciliación Realtime**
- [x] **Step 6: Enviar notificaciones al asignar, vencer o mencionar, nunca mediante inserción arbitraria cliente**
- [x] **Step 7: Probar recurrencia, concurrencia al marcar y aislamiento**
- [x] **Step 8: Commit: `feat: add family tasks and shared lists`**

### Task 15: Notas seguras

**Files:**

- Create: `supabase/migrations/20260805122000_notes_module.sql`
- Create: `src/lib/server/notes/schemas.ts`
- Create: `src/lib/server/notes/queries.ts`
- Create: `src/lib/server/notes/commands.ts`
- Create: `src/routes/(protected)/family/[familyId]/notes/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/notes/+page.svelte`
- Test: `supabase/tests/database/050_notes_rls.test.sql`

- [x] **Step 1: Crear `family_notes` con título, contenido de texto/Markdown seguro, autor y visibilidad**
- [x] **Step 2: Mantener la tabla polimórfica antigua solo como legado hasta confirmar que no contiene datos**
- [x] **Step 3: Renderizar Markdown con parser configurado sin HTML o mostrar texto plano**
- [x] **Step 4: Añadir búsqueda Postgres sobre título/contenido con `tsvector` generado e índice GIN**
- [x] **Step 5: Implementar archivo, edición optimista y filtros**
- [x] **Step 6: Probar XSS, RLS, búsqueda y conflictos de versión**
- [x] **Step 7: Commit: `feat: add secure family notes`**

### Task 16: Planner e inicio familiar

**Files:**

- Create: `src/routes/(protected)/family/[familyId]/planner/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/planner/+page.svelte`
- Modify: `src/routes/(protected)/dashboard/+page.server.ts`
- Modify: `src/routes/(protected)/dashboard/+page.svelte`
- Test: `tests/e2e/planner.spec.ts`

- [ ] **Step 1: Definir el planner como read model, sin crear otra fuente de verdad**
- [ ] **Step 2: Agregar próximos eventos, tareas vencidas/próximas, listas activas y resumen de gastos accesibles**
- [ ] **Step 3: Mostrar solo bloques cuyos módulos estén disponibles y habilitados**
- [ ] **Step 4: Añadir acciones rápidas para regalo, gasto, tarea, evento y lista**
- [ ] **Step 5: Evitar N+1 mediante consultas agrupadas/RPC específicas**
- [ ] **Step 6: Probar usuario con varias familias y colecciones privadas**
- [ ] **Step 7: Commit: `feat: add unified family planner dashboard`**

### Task 17: Comidas y hábitos

**Files:**

- Create: `supabase/migrations/20260805123000_meals_and_habits_modules.sql`
- Create: `src/lib/server/meals/schemas.ts`
- Create: `src/lib/server/meals/queries.ts`
- Create: `src/lib/server/meals/commands.ts`
- Create: `src/lib/server/habits/schemas.ts`
- Create: `src/lib/server/habits/queries.ts`
- Create: `src/lib/server/habits/commands.ts`
- Create: `src/routes/(protected)/family/[familyId]/meals/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/meals/+page.svelte`
- Create: `src/routes/(protected)/family/[familyId]/habits/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/habits/+page.svelte`

- [ ] **Step 1: Modelar plan semanal de comidas y recetas sencillas**
- [ ] **Step 2: Permitir copiar ingredientes a una lista de compra seleccionada**
- [ ] **Step 3: Modelar hábitos como privados por defecto y compartibles con miembros seleccionados**
- [ ] **Step 4: Registrar cumplimiento diario sin puntos, rachas públicas ni rankings**
- [ ] **Step 5: Probar privacidad, límites de fecha e integración con listas**
- [ ] **Step 6: Commit: `feat: add meal planning and private habits`**

### Task 18: Documentos familiares

**Files:**

- Create: `supabase/migrations/20260805124000_documents_module.sql`
- Create: `src/lib/server/documents/schemas.ts`
- Create: `src/lib/server/documents/queries.ts`
- Create: `src/lib/server/documents/commands.ts`
- Create: `src/routes/(protected)/family/[familyId]/documents/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/documents/+page.svelte`
- Test: `supabase/tests/database/060_documents_rls.test.sql`

- [ ] **Step 1: Crear bucket privado y tabla de metadatos con propietario, miembros autorizados y caducidad opcional**
- [ ] **Step 2: Validar tamaño, MIME permitido y nombre; no confiar en extensión**
- [ ] **Step 3: Entregar descargas mediante URL firmada de corta duración**
- [ ] **Step 4: Registrar subida, descarga sensible, cambio de permiso y borrado**
- [ ] **Step 5: Implementar carpetas lógicas sin rutas proporcionadas directamente por el usuario**
- [ ] **Step 6: Probar que un owner de familia no puede abrir documentos privados sin permiso explícito**
- [ ] **Step 7: Commit: `feat: add private family documents`**

---

### Task 19: Activación de módulos sin billing

**Files:**

- Create: `supabase/migrations/20260805130000_module_preferences.sql`
- Modify: `src/lib/config/modules.ts`
- Modify: `src/lib/server/modules/availability.ts`
- Create: `src/routes/(protected)/family/[familyId]/settings/modules/+page.server.ts`
- Create: `src/routes/(protected)/family/[familyId]/settings/modules/+page.svelte`
- Test: `supabase/tests/database/070_module_preferences_rls.test.sql`

- [ ] **Step 1: Migrar `family_modules.module_name` al catálogo objetivo sin usarlo como entitlement**
- [ ] **Step 2: Marcar Wishlist/Members como core y no deshabilitables**
- [ ] **Step 3: Permitir a owner/admin habilitar módulos `available`**
- [ ] **Step 4: Mantener Juegos `disabled` aunque exista una fila familiar habilitada**
- [ ] **Step 5: Aplicar guardas servidor a todas las rutas de módulo**
- [ ] **Step 6: Probar matriz global/preferencia familiar y acceso por URL directa**
- [ ] **Step 7: Documentar la futura interfaz `module entitlement provider` sin implementar pagos**
- [ ] **Step 8: Commit: `feat: centralize module availability and preferences`**

### Task 20: Cierre de producto

**Files:**

- Modify: `README.md`
- Modify: `docs/PROJECT_AUDIT_2026-08-05.md` o crear una auditoría fechada nueva
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/PERMISSIONS.md`
- Create: `docs/MODULES.md`
- Modify: `messages/es.json`
- Modify: `messages/en.json`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Eliminar de la portada promesas de módulos aún no terminados**
- [ ] **Step 2: Documentar arquitectura, roles familiares, ACL de Gastos y privacidad anti-spoiler**
- [ ] **Step 3: Completar traducciones y evitar cadenas mezcladas**
- [ ] **Step 4: Ejecutar auditoría de accesibilidad, rendimiento, SEO y mejores prácticas**
- [ ] **Step 5: Ejecutar `npm run verify`, `npm run test:db` y `npm run test:e2e`**
- [ ] **Step 6: Reiniciar Supabase desde cero y aplicar todas las migraciones**
- [ ] **Step 7: Verificar backup/restore, exportación y borrado de cuenta**
- [ ] **Step 8: Realizar prueba manual con tres usuarios, dos familias y dos colecciones privadas**
- [ ] **Step 9: Publicar una auditoría final con riesgos residuales explícitos**
- [ ] **Step 10: Commit: `docs: close functional product roadmap`**

## 9. Definition of Done para cualquier módulo

Un módulo solo se marca como terminado cuando cumple todo:

- `npm run check`, `npm run lint`, unit tests y build pasan.
- Tests pgTAP incluyen acceso permitido y denegado con al menos dos familias.
- Existe un E2E del recorrido principal y del error crítico.
- RLS es la frontera final; ocultar botones no cuenta como autorización.
- Las mutaciones multi-paso son atómicas e idempotentes cuando corresponde.
- No usa `{@html}` con contenido de usuario.
- Funciona a 390 px y 1280 px, con teclado y foco visible.
- Cadenas en español e inglés pasan por Paraglide.
- Tiene estados loading, vacío, error y reintento.
- Las listas crecientes usan paginación cursor.
- Toda FK usada para joins/RLS está indexada.
- Datos sensibles no se guardan en URLs públicas ni logs.
- README y documentación de permisos reflejan el comportamiento real.

## 10. Orden de ejecución recomendado

1. Tasks 1–4: línea base, Juegos, RLS y familia.
2. Tasks 5–8: Wishlist completa y cerrada.
3. Tasks 9–12: Gastos completo.
4. Tasks 13–16: calendario, tareas/listas, notas y planner.
5. Tasks 17–18: comidas, hábitos y documentos.
6. Tasks 19–20: activación consolidada y cierre.

No ejecutar varias fases de dominio a la vez. Cada gate debe cerrar seguridad, tests y documentación antes de abrir el siguiente módulo.

## 11. Revisión de cobertura

- Juegos queda desactivado sin perder trabajo existente.
- Wishlist queda definida como uso principal y recibe el primer bloque funcional.
- Gastos soporta colecciones independientes, participantes, roles y privacidad administrada por el creador.
- Los dashboards cubren mes, trimestre, año y rango personalizado.
- Se incluyen categorías, recibos, exportación, reparto y recurrencia.
- Los módulos organizativos declarados o anunciados tienen una secuencia concreta.
- Gamificación, Juegos y pagos quedan separados para una fase posterior.
- El diseño conserva una frontera limpia para entitlements futuros sin introducir billing antes de tiempo.
