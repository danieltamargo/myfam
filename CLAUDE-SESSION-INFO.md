# MyFamily - Claude Session Info

> **Última actualización**: 2025-12-29
> **Versión del proyecto**: 0.1.0 (Beta Development)

## 📋 ¿Qué es el proyecto?

**MyFamily** es un ERP familiar/grupal - una plataforma de gestión colaborativa diseñada para familias y grupos pequeños.

### Propósito
Permitir a familias o grupos organizarse mediante módulos personalizables:
- **Eventos**: Calendario compartido de actividades familiares
- **Gastos**: Gestión de gastos compartidos y divisiones
- **Miembros**: Gestión de usuarios con roles y permisos (IMPLEMENTADO ✅)
- **Wishlist**: Listas de regalos colaborativas con sistema anti-spoiler (IMPLEMENTADO ✅)
- **Notas, Planner, Fitness, Tasks, Lists**: Módulos planificados

### Características Clave
- Sistema multi-familia: Un usuario puede pertenecer a múltiples familias
- Roles jerárquicos: Owner → Admin → Member
- Módulos activables/desactivables por familia
- Familia activa en contexto (se guarda en localStorage)
- Autenticación completa con 2FA y recuperación de contraseña
- Sistema de notificaciones en tiempo real

---

## 🏗️ Arquitectura y Stack Tecnológico

### Frontend
- **Framework**: SvelteKit 2 + Svelte 5 (con runes: `$state`, `$derived`, `$props`)
- **Estilos**: TailwindCSS 4 + DaisyUI 5.5.5
- **Internacionalización**: Paraglide
- **Routing**: File-based routing de SvelteKit

### Backend
- **Base de datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth (OAuth + Email/Password + 2FA)
- **ORM**: Supabase JS Client
- **RLS**: Row Level Security habilitado (con funciones helper)
- **Realtime**: Supabase Realtime habilitado para wishlist y notificaciones

### Seguridad
- **RLS (Row Level Security)**: Habilitado en todas las tablas
- **Funciones helper**: `is_family_member()`, `has_family_role()` (SECURITY DEFINER)
- **Cliente Admin**: `supabaseAdmin` solo para operaciones críticas server-side
- **Validación**: Server-side en `+page.server.ts`
- **2FA**: TOTP con QR code enrollment

### Deployment
- Variables de entorno en `.env` (`.gitignore` configurado ✅)
- Service key protegida server-side

---

## 📂 Estructura del Proyecto

```
src/
├── lib/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── TwoFactorCard.svelte         # Gestión completa de 2FA ✅
│   │   │   └── TwoFactorSetup.svelte        # Setup 2FA con QR ✅
│   │   ├── layout/
│   │   │   ├── Header.svelte                # Navbar + Notificaciones ✅
│   │   │   └── NotificationBell.svelte      # Campana de notificaciones ✅
│   │   ├── modals/
│   │   │   ├── ConfirmationModal.svelte     # Modal reutilizable con 2FA ✅
│   │   │   └── ConfirmationModal.README.md  # Documentación del modal ✅
│   │   ├── wishlist/
│   │   │   └── GiftComments.svelte          # Comentarios con @menciones ✅
│   │   ├── ui/
│   │   │   └── Avatar.svelte                # Avatar con iniciales ✅
│   │   └── magic/                           # Componentes visuales
│   ├── stores/
│   │   └── familyStore.ts                   # Store de familia activa
│   ├── supabase.ts                          # Cliente Supabase (con RLS)
│   ├── supabase-admin.ts                    # Cliente admin ⚠️ Server-only
│   └── types/
│       └── database.ts                      # Tipos generados
│
├── routes/
│   ├── (protected)/                         # Layout con auth
│   │   ├── +layout.server.ts                # Carga familias + notificaciones ✅
│   │   ├── dashboard/                       # Dashboard + invitaciones ✅
│   │   ├── families/                        # CRUD familias
│   │   ├── profile/                         # Perfil + 2FA ✅
│   │   └── family/[familyId]/
│   │       ├── members/                     # Gestión miembros ✅
│   │       │   ├── +page.server.ts          # CRUD + transferencia ownership ✅
│   │       │   └── +page.svelte             # UI + modales críticos ✅
│   │       └── wishlist/                    # Wishlist completa ✅
│   │           ├── +page.server.ts          # Actions + comentarios ✅
│   │           ├── +page.svelte             # UI refactorizada ✅
│   │           └── components/              # Componentes modulares ✅
│   │               ├── WishlistHeader.svelte
│   │               ├── WishlistFilters.svelte
│   │               ├── WishlistCards.svelte
│   │               ├── WishlistTable.svelte
│   │               ├── WishlistItemModal.svelte
│   │               └── WishlistEditModal.svelte
│   ├── +error.svelte                        # Página de error personalizada ✅
│   ├── login/                               # Login (email + OAuth + 2FA)
│   ├── register/                            # Registro
│   ├── forgot-password/                     # Recuperar contraseña ✅
│   ├── reset-password/                      # Reset con token ✅
│   ├── verify-2fa/                          # Verificación 2FA ✅
│   └── auth/callback/                       # OAuth callback
```

---

## 🗄️ Esquema de Base de Datos

### Tablas Principales

#### `profiles`
```sql
- id (UUID, FK a auth.users)
- display_name (TEXT)
- avatar_url (TEXT)
- email (TEXT)
- created_at, updated_at
```

#### `families`
```sql
- id (UUID, PK)
- name (TEXT)
- created_by (UUID, FK a profiles)
- created_at, updated_at
```

#### `family_members`
```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- user_id (UUID, FK a profiles)
- role (ENUM: 'owner', 'admin', 'member')
- joined_at
- UNIQUE(family_id, user_id)
```

#### `family_invitations`
```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- invited_by (UUID, FK a profiles)
- invited_user_id (UUID, FK a profiles)
- status (ENUM: 'pending', 'accepted', 'rejected')
- created_at, updated_at
- UNIQUE(family_id, invited_user_id)
```

#### `gift_items` (Wishlist)
```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- owner_id (UUID, FK a profiles)
- name (TEXT)
- description (TEXT)
- links (TEXT[]) - Array de URLs
- price (DECIMAL)
- priority (INTEGER) - -1 a 2
- image_url (TEXT)
- created_at, updated_at
```

#### `gift_purchases` (Anti-spoiler)
```sql
- id (UUID, PK)
- item_id (UUID, FK a gift_items)
- purchased_by (UUID, FK a profiles) - INVISIBLE al owner
- quantity_purchased (INTEGER)
- purchased_at (TIMESTAMPTZ)
- notes (TEXT)
- UNIQUE(item_id, purchased_by)
```

#### `gift_reservations` (Coordinación)
```sql
- id (UUID, PK)
- item_id (UUID, FK a gift_items)
- reserved_by (UUID, FK a profiles)
- reserved_at (TIMESTAMPTZ)
- status (ENUM: 'considering', 'reserved')
- notes (TEXT)
- UNIQUE(item_id, reserved_by)
```

#### `gift_item_comments` (Sistema de comentarios) ✅ NUEVO
```sql
- id (UUID, PK)
- item_id (UUID, FK a gift_items)
- author_id (UUID, FK a profiles)
- content (TEXT) - Puede contener @menciones
- created_at, updated_at
- CONSTRAINT: content no vacío
```

#### `gift_comment_mentions` (Menciones) ✅ NUEVO
```sql
- id (UUID, PK)
- comment_id (UUID, FK a gift_item_comments)
- mentioned_user_id (UUID, FK a profiles)
- created_at
- UNIQUE(comment_id, mentioned_user_id)
```

#### `notifications` (Sistema de notificaciones) ✅ NUEVO
```sql
- id (UUID, PK)
- user_id (UUID, FK a profiles)
- type (ENUM: 'mention', 'comment', 'invitation', 'gift_status', 'family_join')
- title (TEXT)
- message (TEXT)
- link (TEXT) - URL para navegar al hacer click
- read (BOOLEAN) - default false
- created_at
- reference_type (TEXT) - 'gift_item', 'family', 'comment'
- reference_id (UUID)
```

### Funciones PostgreSQL ✅ NUEVO

#### `extract_mentions_from_comment(TEXT) RETURNS UUID[]`
```sql
-- Extrae UUIDs de menciones en formato @{{user_id:display_name}}
-- Permite menciones con nombres que tienen espacios
-- Retorna array de UUIDs de usuarios mencionados
```

#### `handle_comment_mentions() TRIGGER`
```sql
-- Se ejecuta después de INSERT en gift_item_comments
-- Extrae menciones del contenido
-- Valida que sean miembros de la familia
-- Crea registros en gift_comment_mentions
-- Crea notificaciones con link directo al item
-- Link incluye ?item={item_id} para abrir modal automáticamente
```

### Funciones Helper (SECURITY DEFINER)
```sql
is_family_member(family_uuid UUID, user_uuid UUID) RETURNS BOOLEAN
has_family_role(family_uuid UUID, user_uuid UUID, required_roles TEXT[]) RETURNS BOOLEAN
```

---

## ✅ Estado Actual - Lo que está IMPLEMENTADO

### Autenticación ✅
- **Email/Password Auth:**
  - Login/Registro con Email/Password ✅
  - Confirmación de email ✅
  - Recuperación de contraseña completa ✅
  - Reset de contraseña con token ✅
- **OAuth Providers:**
  - Google OAuth ✅
  - GitHub OAuth ✅
- **Two-Factor Authentication (2FA):**
  - TOTP con QR code enrollment ✅
  - Verificación en login ✅
  - UI para gestionar 2FA en perfil ✅
  - Compatible con Google Authenticator, Authy, etc. ✅

### Sistema de Familias ✅
- Crear/listar/navegar familias
- Selector de familia activa en Header
- Sistema de invitaciones completo
- Aceptar invitaciones desde dashboard
- Redirección automática post-aceptación

### Módulo de Miembros ✅
- **CRUD completo**:
  - Ver/invitar/gestionar miembros ✅
  - Sistema de roles (Owner/Admin/Member) ✅
  - Cambiar roles con confirmación 2FA ✅
  - Eliminar miembros con modal crítico ✅
  - Salir de familia (non-owners) con 2FA ✅
- **Transferencia de ownership**:
  - Modal crítico con 2FA requerido ✅
  - Intercepta cambio a owner en selector ✅
  - Actualiza ambos usuarios (nuevo owner + demote actual) ✅
  - Icono de transferencia personalizado ✅
- **Seguridad**:
  - RLS garantiza permisos correctos ✅
  - Validación server-side ✅
  - Owner no puede auto-eliminarse ✅
  - Owner debe transferir antes de salir ✅

### Módulo Wishlist (Completo) ✅
- **Arquitectura refactorizada**:
  - Componentes modulares en `components/` ✅
  - WishlistHeader, WishlistFilters, WishlistCards, WishlistTable ✅
  - WishlistItemModal, WishlistEditModal ✅
  - Reducido de 1167 a 410 líneas ✅
- **Sistema anti-spoiler**: Owner no ve compras ✅
- **Vista dual**: Tarjetas y Tabla ✅
- **Filtros laterales (sidebar)**:
  - Sticky positioning en tablet+ ✅
  - Grid 3 columnas para avatares de miembros ✅
  - Filtro por evento vertical ✅
- **CRUD completo** de items ✅
- **Eventos categorizables**: Navidad, Cumpleaños, Reyes, etc. ✅
- **Sistema de compras** (invisible al owner) ✅
- **Sistema de reservas** "Yo lo miro" (visible a todos) ✅
- **Realtime** con Supabase ✅
- **Comentarios con @menciones** ✅
- **Iconos SVG** en lugar de emojis:
  - Ojo (ver), Lápiz (editar), Carrito (comprar), Check (comprado) ✅
  - Consistencia con Feather Icons ✅
- **Loading states** en todos los botones ✅
- **Resaltado visual**: Ring y fondo para items propios ✅

### Sistema de Comentarios y Menciones ✅ NUEVO
- **Comentarios en items de wishlist**:
  - Solo miembros (no el owner) pueden comentar
  - Sistema de @menciones con autocompletado
  - Formato especial: `@{{user_id:display_name}}`
  - Soporta nombres con espacios
  - Dropdown con avatares al escribir @
  - Render con @menciones resaltadas
  - Eliminar propios comentarios

- **Sistema de menciones**:
  - Detección automática de @menciones en comentarios
  - Validación: solo miembros, no al owner, no a ti mismo
  - Extracción de UUIDs desde formato especial
  - Trigger PostgreSQL automático

- **Notificaciones en tiempo real**:
  - Campana en header con badge rojo
  - Contador de notificaciones sin leer
  - Toggle: "Sin leer" / "Todas"
  - Click en notificación:
    - Marca como leída ✅
    - Navega a la página ✅
    - Abre modal del item automáticamente ✅
  - Historial de últimas 50 notificaciones
  - Supabase Realtime actualiza en vivo
  - Botones para marcar todas como leídas / eliminar

### UI/UX ✅
- Header con:
  - Logo "MyFamily"
  - Selector de familia activa
  - **Campana de notificaciones** con badge ✅ NUEVO
  - Avatar con dropdown menú
- Dashboard con invitaciones pendientes
- Loading skeletons
- Avatares con componente Avatar.svelte
- Tema claro/oscuro
- Diseño responsive

---

## 🚧 Pendiente / TODO

### Corto Plazo
- [ ] **Wishlist**: Subida de imágenes (Supabase Storage)
- [ ] **Wishlist**: Expandir status a enum (purchased, reserved, considering)
- [ ] Módulo de Eventos (calendario)
- [ ] Módulo de Gastos
- [ ] Transferir ownership de familia

### Medio Plazo
- [ ] Configuración de módulos por familia
- [ ] Dashboard con widgets
- [ ] Búsqueda de usuarios
- [ ] Avatares subidos

### Largo Plazo
- [ ] Módulos adicionales (Notes, Planner, etc.)
- [ ] Integraciones externas
- [ ] App móvil

---

## 🗃️ Database Migrations

- **`001-complete-schema.sql`**: Esquema inicial (profiles, familias, miembros)
- **`002-wishlist-module.sql`**: Módulo wishlist con anti-spoiler
- **`003-wishlist-improvements.sql`**: Múltiples links
- **`004-remove-aniversario.sql`**: Elimina evento
- **`005-enable-realtime.sql`**: Habilita Realtime
- **`006-gift-reservations.sql`**: Sistema "Yo lo miro"
- **`007-enable-email-auth.sql`**: Docs email/password
- **`008-allow-invited-users-view-families.sql`**: RLS invitados
- **`009-fix-invitation-duplicates.sql`**: Fix duplicados
- **`010-gift-comments-and-status-system.sql`**: Sistema comentarios ✅ NUEVO
- **`011-fix-family-rls-policies.sql`**: Fix políticas familia
- **`012-fix-extract-mentions-function.sql`**: Fix función menciones
- **`013-update-mentions-extraction.sql`**: Menciones con UUIDs
- **`014-fix-ambiguous-column.sql`**: Fix columnas ambiguas
- **`015-improve-notification-links.sql`**: Links con ?item=id ✅ NUEVO

---

## 🎯 Características Destacadas del Sistema de Notificaciones

### Flujo Completo de Mención
1. Usuario A comenta en item de Usuario B
2. Usuario A escribe `@` → aparece dropdown con miembros
3. Usuario A selecciona "Usuario C" del dropdown
4. Se inserta `@{{uuid-c:Usuario C}}` en el textarea
5. Al enviar, el trigger PostgreSQL:
   - Detecta la mención
   - Valida que Usuario C sea miembro y no sea el owner
   - Crea registro en `gift_comment_mentions`
   - Crea notificación para Usuario C
   - El link incluye `?item={item_id}`
6. Usuario C ve badge rojo en campana
7. Usuario C hace click en la notificación:
   - Se marca como leída
   - Navega a `/family/{id}/wishlist?item={item_id}`
   - El `onMount()` detecta el parámetro
   - Se abre automáticamente el modal del item
   - Se limpia la URL

### Ventajas del Sistema
- ✅ Tiempo real con Supabase Realtime
- ✅ Historial completo de notificaciones
- ✅ Navegación directa al contexto
- ✅ No se pierden notificaciones
- ✅ UX fluida sin recargas
- ✅ Soporta nombres con espacios
- ✅ Validación server-side completa

---

## 📝 Notas Importantes

### Svelte 5 (Runes)
```svelte
<!-- ✅ CORRECTO -->
<script>
  let { data } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Formato de Menciones
```
Formato interno: @{{user_id:display_name}}
Ejemplo: @{{123e4567-e89b-12d3-a456-426614174000:Daniel Tamargo}}
Render visual: @Daniel Tamargo (resaltado en color primary)
```

### RLS Helper Functions
```sql
-- ✅ CORRECTO
USING (is_family_member(family_id, auth.uid()))

-- ❌ INCORRECTO (recursión)
USING (EXISTS (SELECT 1 FROM family_members WHERE ...))
```

---

## 🎯 Próxima Sesión - Contexto Rápido

**El proyecto está COMPLETO en estas áreas**:
1. ✅ Autenticación (email/password + OAuth + 2FA)
2. ✅ Sistema de familias e invitaciones
3. ✅ Módulo de miembros
4. ✅ Módulo de wishlist con anti-spoiler
5. ✅ Sistema de comentarios con @menciones
6. ✅ Sistema de notificaciones en tiempo real
7. ✅ UI/UX moderna y responsive

**Próximos pasos sugeridos**:
- Implementar subida de imágenes (Supabase Storage)
- Expandir gift status a enum completo
- Módulo de Eventos o Gastos

**Stack**: SvelteKit 2 + Svelte 5 + Supabase + TailwindCSS + DaisyUI

### Comandos útiles
```bash
# Regenerar tipos
npx supabase gen types typescript --project-id wismzxvqrypwqwqpgnfi > src/lib/types/database.ts

# Ver migraciones
ls supabase/migrations/

# Ejecutar migración (en Supabase SQL Editor)
# Copiar contenido del archivo .sql y ejecutar
```

---

## 📞 Preferencias del Usuario

- ✅ Explicaciones técnicas detalladas
- ✅ Análisis de arquitectura y seguridad
- ✅ Soluciones robustas
- ❌ NO ejecutar builds automáticamente
- ❌ NO crear docs no pedidos

---

_Documento actualizado: 2025-12-29 - Sistema de notificaciones y comentarios completo_
