# MyFamily - Claude Session Info

> **Última actualización**: 2025-12-20
> **Versión del proyecto**: 0.0.1 (Early Development)

## 📋 ¿Qué es el proyecto?

**MyFamily** es un ERP familiar/grupal - una plataforma de gestión colaborativa diseñada para familias y grupos pequeños.

### Propósito
Permitir a familias o grupos organizarse mediante módulos personalizables:
- **Eventos**: Calendario compartido de actividades familiares
- **Gastos**: Gestión de gastos compartidos y divisiones
- **Miembros**: Gestión de usuarios con roles y permisos (IMPLEMENTADO ✅)
- **Notas, Planner, Fitness, Tasks, Lists**: Módulos planificados

### Características Clave
- Sistema multi-familia: Un usuario puede pertenecer a múltiples familias
- Roles jerárquicos: Owner → Admin → Member
- Módulos activables/desactivables por familia
- Familia activa en contexto (se guarda en localStorage)

---

## 🏗️ Arquitectura y Stack Tecnológico

### Frontend
- **Framework**: SvelteKit 2 + Svelte 5 (con runes: `$state`, `$derived`, `$props`)
- **Estilos**: TailwindCSS 4 + DaisyUI 5.5.5
- **Internacionalización**: Paraglide
- **Routing**: File-based routing de SvelteKit

### Backend
- **Base de datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth (OAuth con Google, GitHub)
- **ORM**: Supabase JS Client
- **RLS**: Row Level Security habilitado (con funciones helper)

### Seguridad
- **RLS (Row Level Security)**: Habilitado en todas las tablas
- **Funciones helper**: `is_family_member()`, `has_family_role()` (SECURITY DEFINER)
- **Cliente Admin**: `supabaseAdmin` solo para operaciones críticas server-side (crear familias)
- **Validación**: Server-side en `+page.server.ts`

### Deployment
- Variables de entorno en `.env` (`.gitignore` configurado ✅)
- Service key protegida server-side

---

## 📂 Estructura del Proyecto

```
src/
├── lib/
│   ├── components/
│   │   ├── layout/
│   │   │   └── Header.svelte          # Navbar con selector de familia + menú avatar
│   │   ├── magic/                     # Componentes visuales (Particles, WordRotate)
│   │   └── util/                      # ThemeToggler, ToastManager
│   ├── stores/
│   │   └── familyStore.ts             # Store de familia activa (Svelte store + localStorage)
│   ├── supabase.ts                    # Cliente Supabase normal (con RLS)
│   ├── supabase-admin.ts              # Cliente admin (bypasses RLS) ⚠️ Solo server-side
│   └── types/
│       └── database.ts                # Tipos generados de Supabase
│
├── routes/
│   ├── (protected)/                   # Layout con autenticación obligatoria
│   │   ├── +layout.server.ts          # Verifica auth + carga familias del usuario
│   │   ├── +layout.svelte             # Incluye Header común
│   │   ├── dashboard/                 # Dashboard principal
│   │   ├── families/                  # CRUD de familias
│   │   │   ├── +page.server.ts        # Actions: createFamily (usa supabaseAdmin)
│   │   │   └── +page.svelte           # Lista familias + modal crear
│   │   ├── profile/                   # Configuración de perfil
│   │   │   ├── +page.server.ts        # Actions: updateProfile, deleteAccount
│   │   │   └── +page.svelte           # Formularios de perfil
│   │   └── family/[familyId]/         # Workspace de familia individual
│   │       ├── +layout.server.ts      # Verifica membresía de familia
│   │       ├── +layout.svelte         # Tabs de módulos (Members, Events, Expenses)
│   │       ├── +page.server.ts        # Redirect a /members
│   │       └── members/               # Módulo de miembros ✅
│   │           ├── +page.server.ts    # Actions: inviteMember, updateRole, removeMember
│   │           └── +page.svelte       # Lista miembros + invitaciones
│   ├── login/                         # Página de login
│   ├── auth/callback/                 # OAuth callback
│   └── +page.svelte                   # Landing page (redirige a /dashboard si autenticado)
│
├── hooks.server.ts                    # Middleware: Paraglide + Supabase session
└── app.html                           # HTML base
```

---

## 🗄️ Esquema de Base de Datos

### Tablas Principales

#### `profiles`
```sql
- id (UUID, FK a auth.users)
- display_name (TEXT)
- avatar_url (TEXT)
- email (TEXT, synced con auth.users) ✅
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
- invited_user_id (UUID, FK a profiles) ✅ Actualizado
- status (ENUM: 'pending', 'accepted', 'rejected')
- created_at, updated_at
- UNIQUE(family_id, invited_user_id)
```

#### `gift_event_categories` (Wishlist)
```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- name (TEXT) - "Navidad", "Cumpleaños", etc.
- icon (TEXT) - Emoji del evento
- color (TEXT) - Color hex para UI
- event_date (DATE) - Opcional
- is_system (BOOLEAN) - true para eventos predefinidos
- created_by (UUID, FK a profiles)
- UNIQUE(family_id, name)
```

#### `gift_items` (Wishlist)
```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- owner_id (UUID, FK a profiles)
- name (TEXT) - Nombre del regalo
- description (TEXT)
- links (TEXT[]) - Array de URLs ✅ Actualizado
- price (DECIMAL)
- priority (INTEGER) - -1 a 2
- image_url (TEXT) - Imagen principal
- created_at, updated_at
```

#### `gift_item_events` (Wishlist)
```sql
- id (UUID, PK)
- item_id (UUID, FK a gift_items)
- event_category_id (UUID, FK a gift_event_categories)
- UNIQUE(item_id, event_category_id)
```

#### `gift_purchases` (Wishlist - Anti-spoiler!)
```sql
- id (UUID, PK)
- item_id (UUID, FK a gift_items)
- purchased_by (UUID, FK a profiles) ⚠️ INVISIBLE al owner
- quantity_purchased (INTEGER)
- purchased_at (TIMESTAMPTZ)
- notes (TEXT) - Notas privadas del comprador
- UNIQUE(item_id, purchased_by)
```

#### Otras tablas
- `family_modules`: Configuración de módulos por familia
- `notes`: Notas polimórficas
- `external_connections`: OAuth de Google Calendar, etc.
- `audit_logs`: Logs de auditoría

### Funciones Helper (SECURITY DEFINER)
```sql
-- Evitan recursión infinita en RLS
is_family_member(family_uuid UUID, user_uuid UUID) RETURNS BOOLEAN
has_family_role(family_uuid UUID, user_uuid UUID, required_roles TEXT[]) RETURNS BOOLEAN
```

---

## ✅ Estado Actual - Lo que está IMPLEMENTADO

### Autenticación ✅
- Login con Google OAuth
- Login con GitHub OAuth
- Session management con Supabase
- Protected routes con layout `(protected)/`

### Sistema de Familias ✅
- Crear familias (usa `supabaseAdmin` para bypass RLS inicial)
- Listar familias del usuario
- Selector de familia activa en Header
- Navegación a workspace de familia

### Módulo de Miembros ✅
- Ver todos los miembros de una familia
- Invitar nuevos miembros por email
- Cambiar roles (solo owners)
- Eliminar miembros (owners y admins)
- Visualización de roles con badges
- Sistema de permisos funcional

### Módulo Wishlist (Listas de Regalos) ✅
- **Sistema anti-spoiler**: El owner NO ve quién compró sus regalos
- **Vista dual**: Tarjetas (grid) y Tabla
- **Filtros**: Por miembro y por evento
- **Gestión de items**:
  - Crear/editar/eliminar regalos
  - Campos: nombre, descripción, precio, prioridad
  - Enlaces múltiples (colapsable)
  - Imágenes múltiples (colapsable, primera imagen es la principal)
- **Sistema de eventos**: Navidad, Cumpleaños, Reyes, San Valentín, Todos
  - Chips seleccionables con colores
  - Lógica automática: al seleccionar evento específico, "Todos" se desmarca
  - Siempre mínimo uno seleccionado
- **Compras**:
  - Botón toggle "Marcar como comprado"
  - Solo el comprador ve su propia compra
  - El owner NUNCA ve las compras (RLS garantizado)
- **Reservas "Yo lo miro"** ✅:
  - Sistema de coordinación para compras
  - Los miembros pueden reservar items que están mirando
  - Visible a TODOS los miembros (a diferencia de compras)
  - Ayuda a evitar compras duplicadas
  - Indicador visual en tarjetas y detalles
  - RLS garantiza que solo se puedan reservar items de otros
- **Realtime** ✅:
  - Supabase Realtime habilitado en todas las tablas del wishlist
  - Actualizaciones en vivo cuando cualquier usuario crea/edita/elimina items
  - Actualizaciones en vivo cuando se marcan compras o reservas
  - Suscripción vía PostgreSQL Change Data Capture (CDC)
- **UX moderna**:
  - Formulario con secciones colapsables
  - Loading states en botones
  - Iconos SVG personalizados (Feather Icons) en TODOS los botones de añadir
  - Precio sin steps (input text con inputmode decimal)
  - Modal de detalles mejorado: descripción solo si existe (grisácea), precio muestra "Desconocido" si no hay
  - Diseño responsive y profesional

### UI/UX ✅
- Header con:
  - Logo "MyFamily"
  - Selector de familia activa (centro) - **ARREGLADO**: Ahora usa click en vez de hover
  - Avatar con dropdown menú (derecha)
  - Todos los links en el menú del avatar
  - Iconos SVG en todos los botones de añadir/crear
- Dashboard:
  - Enlaces funcionales a Families, Wishlist y Profile
  - Cards modernos con hover effects
- Página de familias:
  - Loading skeletons mientras cargan los datos ✅
  - Mejor UX durante la carga asíncrona
- Tema claro/oscuro (ThemeToggler)
- Diseño responsive con DaisyUI
- Avatares con CORS fix (`referrerpolicy="no-referrer"`)

### Seguridad ✅
- RLS habilitado en todas las tablas
- Validación server-side
- Service key protegida
- No hay privilege escalation
- No hay broken access control

---

## 🚧 Pendiente / TODO

### Corto Plazo
- [ ] **Wishlist**: Sistema de subida de imágenes (Supabase Storage)
- [ ] **Wishlist**: Notificaciones cuando se añaden regalos
- [ ] Módulo de Eventos (calendario compartido)
- [ ] Módulo de Gastos (división de gastos)
- [ ] Sistema de notificaciones (invitaciones pendientes)
- [ ] Aceptar/rechazar invitaciones
- [ ] Transferir ownership de familia

### Medio Plazo
- [ ] Configuración de módulos (activar/desactivar por familia)
- [ ] Dashboard con widgets personalizables
- [ ] Búsqueda de usuarios para invitar
- [ ] Avatares subidos (no solo URLs)

### Largo Plazo
- [ ] Módulos adicionales (Notes, Planner, Fitness, Tasks, Lists)
- [ ] Integraciones externas (Google Calendar)
- [ ] App móvil (React Native / Capacitor)
- [ ] Rate limiting
- [ ] Audit logs UI

---

## 🐛 Problemas Resueltos (Historia)

### 1. Recursión Infinita en RLS ✅ RESUELTO
**Problema**: Políticas RLS causaban `infinite recursion detected in policy for relation "family_members"`

**Causa**: Las políticas referenciaban `family_members` dentro de sí mismas con `EXISTS`

**Solución**: Funciones `SECURITY DEFINER` que bypasean RLS:
```sql
CREATE FUNCTION is_family_member(...) SECURITY DEFINER STABLE
CREATE FUNCTION has_family_role(...) SECURITY DEFINER STABLE
```

### 2. "new row violates row-level security policy for table families" ✅ RESUELTO
**Problema**: No se podían crear familias incluso con políticas RLS correctas

**Causa**: El cliente de Supabase server-side no pasaba correctamente el JWT del usuario autenticado

**Solución**: Usar `supabaseAdmin` (service role key) solo para crear familia + añadir owner inicial
```typescript
// src/routes/(protected)/families/+page.server.ts
const { data: family } = await supabaseAdmin.from('families').insert(...)
```

### 3. Avatares no cargaban (CORS) ✅ RESUELTO
**Problema**: Imágenes de Google (`lh3.googleusercontent.com`) no cargaban

**Solución**: Añadir atributos CORS al `<img>`:
```svelte
<img
  src={avatarUrl}
  referrerpolicy="no-referrer"
  crossorigin="anonymous"
/>
```

---

## 🔧 Configuración y Variables de Entorno

### `.env` (⚠️ NUNCA COMMITEAR)
```bash
VITE_SUPABASE_URL=https://wismzxvqrypwqwqpgnfi.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_zqyc7a9hTTb0Mvpl8iXnkw_tCnWMGTQ
SUPABASE_SECRET_KEY=sb_secret_4rt6Xf6e28dd3XKz3RmwKA_bHayhXlD
SUPABASE_PROJECT_ID=wismzxvqrypwqwqpgnfi
SUPABASE_PROJECT_URL=https://wismzxvqrypwqwqpgnfi.supabase.co
PUBLIC_SUPABASE_URL=https://wismzxvqrypwqwqpgnfi.supabase.co
```

### Scripts NPM
```bash
npm run dev          # Desarrollo
npm run build        # Build producción
npm run check        # TypeScript check
npm run format       # Prettier
npm run lint         # ESLint
```

---

## 📝 Notas Importantes para Futuras Sesiones

### Svelte 5 (Runes)
Este proyecto usa **Svelte 5** con runes. NO uses la sintaxis antigua:
```svelte
<!-- ❌ ANTIGUO (Svelte 4) -->
<script>
  export let data;
  let count = 0;
  $: doubled = count * 2;
</script>

<!-- ✅ NUEVO (Svelte 5) -->
<script>
  let { data } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Supabase Client Usage
```typescript
// ✅ CORRECTO: Cliente normal (con RLS)
import { supabase } from '$lib/supabase';
await supabase.from('families').select('*'); // RLS aplicado

// ⚠️ CUIDADO: Cliente admin (bypasses RLS)
import { supabaseAdmin } from '$lib/supabase-admin';
// Solo usar en server-side para operaciones críticas
await supabaseAdmin.from('families').insert(...);
```

### RLS Helper Functions
Al escribir políticas RLS, **SIEMPRE** usa las funciones helper:
```sql
-- ✅ CORRECTO
USING (is_family_member(family_id, auth.uid()))

-- ❌ INCORRECTO (causa recursión)
USING (EXISTS (SELECT 1 FROM family_members WHERE ...))
```

### Database Migrations
- **`001-complete-schema.sql`**: Esquema inicial completo (perfiles, familias, miembros, módulos, etc.)
- **`002-wishlist-module.sql`**: Módulo de wishlist completo con RLS y anti-spoiler
- **`003-wishlist-improvements.sql`**: Mejoras al wishlist (múltiples links, sin quantity)
- **`004-remove-aniversario.sql`**: Elimina evento "Aniversario"
- **`005-enable-realtime.sql`**: Habilita Supabase Realtime para wishlist ✅
- **`006-gift-reservations.sql`**: Sistema de reservas "Yo lo miro" con RLS y Realtime ✅
- Para aplicar: Ejecutar en SQL Editor de Supabase Dashboard en orden secuencial

### TypeScript
- El usuario prefiere NO ejecutar `npm run check` durante desarrollo
- Solo verificar TypeScript al final antes de build
- Confiar en que el código esté correcto

### Testing
- El usuario probará las funcionalidades manualmente
- NO ejecutar `npm run dev` automáticamente
- NO ejecutar `npm run build` hasta que lo pida

---

## 🎯 Próxima Sesión - Contexto Rápido

Si empiezas una nueva sesión, lee esto primero:

1. **El proyecto funciona** ✅ - Autenticación, familias y miembros están implementados
2. **Seguridad validada** ✅ - No hay privilege escalation ni broken access control
3. **RLS configurado** ✅ - Todas las tablas con políticas usando funciones helper
4. **Próximo paso sugerido**: Implementar módulo de Eventos o Gastos
5. **Stack**: SvelteKit 2 + Svelte 5 (runes) + Supabase + TailwindCSS + DaisyUI

### Comandos útiles
```bash
# Ver logs del servidor de desarrollo (si está corriendo)
# Buscar en consola "Creating family for user:" para debug

# Ver migraciones
ls supabase/migrations/

# Ver políticas RLS actuales (en Supabase SQL Editor)
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE tablename IN ('families', 'family_members');
```

---

## 📞 Contacto con Usuario

**Preferencias del usuario**:
- ✅ Explicaciones de seguridad detalladas
- ✅ Análisis de arquitectura
- ✅ Soluciones robustas aunque sean más complejas
- ❌ NO ejecutar builds/checks automáticamente
- ❌ NO crear archivos innecesarios (como docs no pedidos)

---

_Este documento debe actualizarse cada vez que se implementen cambios significativos en el proyecto._
