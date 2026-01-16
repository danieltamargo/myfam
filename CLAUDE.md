# MyFamily - Claude Session Info

> **Última actualización**: 2026-01-16
> **Versión del proyecto**: 0.2.0 (Beta Development - Games Module Added)

## 📋 ¿Qué es el proyecto?

**MyFamily** es un ERP familiar/grupal - una plataforma de gestión colaborativa diseñada para familias y grupos pequeños.

### Propósito

Permitir a familias o grupos organizarse mediante módulos personalizables:

- **Eventos**: Calendario compartido de actividades familiares
- **Gastos**: Gestión de gastos compartidos y divisiones
- **Miembros**: Gestión de usuarios con roles y permisos (IMPLEMENTADO ✅)
- **Wishlist**: Listas de regalos colaborativas con sistema anti-spoiler (IMPLEMENTADO ✅)
- **Games**: Juegos multijugador en tiempo real con bots AI (IMPLEMENTADO ✅)
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
- **Realtime**: Supabase Realtime habilitado para wishlist, notificaciones y games

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
│   │   ├── games/
│   │   │   ├── GameResultModal.svelte       # Modal de resultado del juego ✅
│   │   │   ├── LeaveGameConfirmModal.svelte # Confirmación de abandono ✅
│   │   │   ├── PlayerMiniCard.svelte        # Tarjeta jugador compacta ✅
│   │   │   ├── TicTacToeBoard.svelte        # Tablero Tic-Tac-Toe ✅
│   │   │   └── GameRoomCard.svelte          # Tarjeta de sala en lobby ✅
│   │   ├── ui/
│   │   │   └── Avatar.svelte                # Avatar con iniciales ✅
│   │   └── magic/                           # Componentes visuales
│   ├── stores/
│   │   └── familyStore.ts                   # Store de familia activa
│   ├── games/
│   │   ├── ai/
│   │   │   └── tic-tac-toe-ai.ts            # AI con minimax (3 niveles) ✅
│   │   └── tic-tac-toe.ts                   # Lógica del juego ✅
│   ├── supabase.ts                          # Cliente Supabase (con RLS)
│   ├── supabase-admin.ts                    # Cliente admin ⚠️ Server-only
│   └── types/
│       ├── database.ts                      # Tipos generados
│       └── games.ts                         # Tipos de juegos ✅
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
│   │       ├── wishlist/                    # Wishlist completa ✅
│   │       │   ├── +page.server.ts          # Actions + comentarios ✅
│   │       │   ├── +page.svelte             # UI refactorizada ✅
│   │       │   └── components/              # Componentes modulares ✅
│   │       │       ├── WishlistHeader.svelte
│   │       │       ├── WishlistFilters.svelte
│   │       │       ├── WishlistCards.svelte
│   │       │       ├── WishlistTable.svelte
│   │       │       ├── WishlistItemModal.svelte
│   │       │       └── WishlistEditModal.svelte
│   │       └── games/                       # Módulo de juegos ✅
│   │           ├── +page.server.ts          # CRUD salas + bots ✅
│   │           ├── +page.svelte             # Lobby de juegos ✅
│   │           └── play/[roomId]/
│   │               ├── +page.server.ts      # Lógica del juego + AI ✅
│   │               └── +page.svelte         # UI del tablero ✅
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

#### `game_rooms` (Salas de juego) ✅ NUEVO

```sql
- id (UUID, PK)
- family_id (UUID, FK a families)
- created_by (UUID, FK a profiles)
- game_type (ENUM: 'tic_tac_toe') - Extensible para otros juegos
- name (TEXT) - Nombre de la sala
- max_players (INTEGER) - Máximo de jugadores
- status (ENUM: 'waiting', 'in_progress', 'finished')
- created_at, started_at, finished_at
- REALTIME enabled
```

#### `room_participants` (Participantes en salas) ✅ NUEVO

```sql
- id (UUID, PK)
- room_id (UUID, FK a game_rooms)
- user_id (UUID, FK a profiles, NULLABLE) - NULL para bots
- player_number (INTEGER) - Número de jugador (1, 2, etc.)
- is_ready (BOOLEAN) - ¿Listo para empezar?
- is_active (BOOLEAN) - ¿Activo en la sala?
- is_bot (BOOLEAN) - ¿Es un bot?
- bot_difficulty (ENUM: 'easy', 'medium', 'hard') - Solo para bots
- joined_at
- UNIQUE(room_id, player_number)
- REALTIME enabled
```

#### `game_sessions` (Sesiones de partida) ✅ NUEVO

```sql
- id (UUID, PK)
- room_id (UUID, FK a game_rooms)
- game_type (ENUM: 'tic_tac_toe')
- game_state (JSONB) - Estado del juego (tablero, turno, ganador)
- status (ENUM: 'active', 'finished')
- started_at, finished_at
- winner_id (UUID, FK a profiles, NULLABLE) - Ganador humano
- winner_player_number (INTEGER, NULLABLE) - Ganador bot
- is_draw (BOOLEAN)
- final_state (JSONB) - Estado final cuando termina
- has_bots (BOOLEAN) - ¿Partida con bots?
- REALTIME enabled
```

#### `game_moves` (Movimientos de juego) ✅ NUEVO

```sql
- id (UUID, PK)
- session_id (UUID, FK a game_sessions)
- player_id (UUID, FK a profiles, NULLABLE) - NULL para bots
- player_number (INTEGER) - Número de jugador que hizo el movimiento
- move_data (JSONB) - Datos del movimiento (posición, etc.)
- move_number (INTEGER) - Orden del movimiento
- created_at
```

#### `game_stats` (Estadísticas de jugadores) ✅ NUEVO

```sql
- id (UUID, PK)
- user_id (UUID, FK a profiles)
- family_id (UUID, FK a families)
- game_type (ENUM: 'tic_tac_toe')
- games_played (INTEGER) - Total de partidas
- games_won (INTEGER) - Victorias
- games_lost (INTEGER) - Derrotas
- games_drawn (INTEGER) - Empates
- games_abandoned (INTEGER) - Abandonos
- current_streak (INTEGER) - Racha actual
- best_streak (INTEGER) - Mejor racha
- UNIQUE(user_id, family_id, game_type)
```

#### `game_achievements` (Logros) ✅ NUEVO

```sql
- id (UUID, PK)
- user_id (UUID, FK a profiles)
- family_id (UUID, FK a families)
- achievement_type (TEXT) - Tipo de logro
- unlocked_at (TIMESTAMPTZ)
- metadata (JSONB) - Datos adicionales del logro
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

#### `handle_player_leave() TRIGGER` ✅ NUEVO

```sql
-- Se ejecuta después de UPDATE en room_participants
-- Detecta cuando un jugador activo abandona (is_active: true → false)
-- Si queda solo 1 jugador humano o menos:
  - Marca la sesión como 'finished'
  - Asigna victoria al jugador restante
  - Actualiza game_state.winner y game_state.isDraw
  - Actualiza el estado de la sala a 'finished'
-- Maneja correctamente bots vs humanos en winner_id/winner_player_number
```

#### `auto_delete_empty_rooms() TRIGGER` ✅ NUEVO

```sql
-- Se ejecuta después de UPDATE/DELETE en room_participants
-- Detecta salas sin participantes activos
-- Auto-elimina salas vacías en estado 'waiting'
-- No toca salas en progreso o finalizadas
```

#### `update_game_stats_after_session() TRIGGER` ✅ NUEVO

```sql
-- Se ejecuta después de UPDATE en game_sessions
-- Cuando una sesión cambia a 'finished':
  - Actualiza estadísticas de todos los participantes humanos
  - Incrementa games_played
  - Incrementa games_won/lost/drawn según resultado
  - Actualiza current_streak y best_streak
  - Solo cuenta partidas sin bots (has_bots = false)
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

### Módulo Games (Juegos) ✅ NUEVO

- **Sistema de salas multijugador**:
  - Crear/unirse a salas de juego
  - Lobby en tiempo real con Supabase Realtime
  - Sistema de "listo" (is_ready) para empezar partida
  - Auto-start cuando todos están listos
  - Auto-eliminación de salas vacías
  - Solo se muestran salas 'waiting' e 'in_progress'
  - Salas 'finished' desaparecen automáticamente

- **Sistema de bots AI**:
  - Agregar/quitar bots en slots vacíos
  - 3 niveles de dificultad (easy, medium, hard)
  - Hard usa algoritmo Minimax (invencible)
  - Medium con movimientos semialeatorizados
  - Easy totalmente aleatorio
  - Bots con avatar 🤖 y nombres personalizados
  - Partidas con bots NO cuentan para estadísticas

- **Juego: Tic-Tac-Toe**:
  - Tablero 3x3 interactivo
  - Turnos alternados con indicador visual
  - Detección automática de ganador o empate
  - Animaciones y feedback visual
  - Modal de resultado con resumen del juego
  - Sistema de abandono con confirmación

- **Sistema de abandono**:
  - Trigger detecta cuando jugador abandona (is_active: false)
  - Victoria automática para el jugador restante
  - Actualiza game_state.winner correctamente
  - Modal de confirmación con advertencia
  - Cuenta como derrota para quien abandona

- **Estadísticas y leaderboard**:
  - Tracking de victorias/derrotas/empates
  - Sistema de rachas (current_streak, best_streak)
  - Contador de abandonos
  - Solo partidas sin bots cuentan
  - Actualización automática con triggers

- **Realtime completo**:
  - Canal único consolidado por contexto
  - Sincronización bidireccional de movimientos
  - Updates de estado de sala en vivo
  - Participantes se actualizan en tiempo real
  - Estado del juego se sincroniza automáticamente

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

### Migraciones Originales (Renombradas con timestamp)

- **`20260116050346_complete_schema.sql`**: Esquema inicial (profiles, familias, miembros)
- **`20260116050347_wishlist_module.sql`**: Módulo wishlist con anti-spoiler
- **`20260116050348_wishlist_improvements.sql`**: Múltiples links
- **`20260116050349_remove_aniversario.sql`**: Elimina evento
- **`20260116050350_enable_realtime.sql`**: Habilita Realtime
- **`20260116050351_gift_reservations.sql`**: Sistema "Yo lo miro"
- **`20260116050352_enable_email_auth.sql`**: Docs email/password
- **`20260116050353_allow_invited_users_view_families.sql`**: RLS invitados
- **`20260116050354_allow_accepting_invitations.sql`**: Aceptar invitaciones
- **`20260116050355_gift_comments_and_status_system.sql`**: Sistema comentarios
- **`20260116050356_fix_family_rls_policies.sql`**: Fix políticas familia
- **`20260116050357_fix_extract_mentions_function.sql`**: Fix función menciones
- **`20260116050358_update_mentions_extraction.sql`**: Menciones con UUIDs
- **`20260116050359_fix_ambiguous_column.sql`**: Fix columnas ambiguas
- **`20260116050360_improve_notification_links.sql`**: Links con ?item=id
- **`20260116050361_fix_gift_purchases_visibility.sql`**: Fix visibilidad compras

### Migraciones del Módulo Games ✅ NUEVO

- **`20260116050362_games_module.sql`**: Esquema completo del módulo games
  - Tablas: game_rooms, room_participants, game_sessions, game_moves
  - Tablas: game_stats, game_achievements
  - Tipos ENUM: game_type, bot_difficulty
  - Políticas RLS completas

- **`20260116050363_enable_realtime_games.sql`**: Habilita Realtime para games
  - Realtime en game_rooms
  - Realtime en room_participants
  - Realtime en game_sessions

- **`20260116050364_fix_game_sessions_constraint.sql`**: Fix constraint sessions

- **`20260116050365_auto_delete_empty_rooms.sql`**: Auto-eliminación de salas vacías
  - Trigger auto_delete_empty_rooms()
  - Se ejecuta en UPDATE/DELETE de room_participants

- **`20260116050366_add_bot_support.sql`**: Soporte completo para bots
  - Columnas: is_bot, bot_difficulty en room_participants
  - Columna: has_bots en game_sessions
  - user_id nullable para bots

- **`20260116050367_game_abandonment_system.sql`**: Sistema de abandono
  - Función handle_player_leave()
  - Trigger en room_participants
  - Asigna victoria automática

- **`20260116050368_add_missing_game_session_columns.sql`**: Columnas faltantes
  - Agrega game_type, status, has_bots con conditional checks

- **`20260116050369_fix_oauth_profile_sync.sql`**: Sync profiles con OAuth

- **`20260116050370_add_active_family_to_profiles.sql`**: Familia activa en profiles

- **`20260116051000_fix-abandonment-game-state.sql`**: Fix abandono game_state ✅ CRÍTICO
  - Actualiza game_state.winner cuando jugador abandona
  - Actualiza game_state.isDraw correctamente
  - Maneja bots vs humanos en winner_id/winner_player_number

- **`20260116052000_fix_game_stats_constraint.sql`**: Fix ON CONFLICT constraint ✅ CRÍTICO
  - Corrige ON CONFLICT para incluir family_id
  - Antes: `ON CONFLICT (user_id, game_type)` ❌
  - Ahora: `ON CONFLICT (user_id, family_id, game_type)` ✅
  - Agrega games_lost y games_drawn correctamente

- **`20260116053000_remove_abandonment_notification.sql`**: Elimina notificación de abandono
  - Usuarios ven el resultado en el modal del juego
  - No necesitan notificación adicional
  - Evita notificaciones duplicadas/innecesarias

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

## 🎮 Características Destacadas del Módulo Games

### Flujo Completo de una Partida

1. **Creación de sala**:
   - Usuario crea sala desde lobby
   - Se inserta en `game_rooms` con status 'waiting'
   - Se crea participante automáticamente con player_number 1
   - Sala aparece en lobby en tiempo real para todos

2. **Preparación**:
   - Otro usuario se une → player_number 2
   - Pueden agregar bots en slots vacíos
   - Usuarios marcan "Listo" (is_ready)
   - Cuando todos listos → auto-start

3. **Inicio de partida**:
   - Status de sala → 'in_progress'
   - Se crea `game_session` con estado inicial
   - game_state incluye: board, currentPlayer, winner, isDraw
   - Se registra started_at

4. **Durante el juego**:
   - Turnos alternados entre jugadores
   - Cada movimiento:
     - Actualiza game_state en game_sessions
     - Se registra en game_moves
     - Realtime sincroniza a todos los jugadores
   - Si hay bot en el turno → executeBotTurn() server-side

5. **Final de partida**:
   - Detección automática de ganador o empate
   - Se actualiza:
     - game_sessions.status → 'finished'
     - game_sessions.winner_id (humano) o winner_player_number (bot)
     - game_sessions.final_state
     - game_state.winner y game_state.isDraw
   - Trigger actualiza estadísticas (si no hay bots)
   - Modal de resultado aparece automáticamente
   - Sala cambia a status 'finished' y desaparece del lobby

6. **Abandono**:
   - Usuario hace click en "Salir"
   - Modal de confirmación con advertencia
   - Al confirmar → is_active = false
   - Trigger handle_player_leave() detecta:
     - Si queda 1 jugador humano o menos
     - Marca sesión como finished
     - Asigna victoria al jugador restante
     - Actualiza game_state.winner correctamente

### Algoritmo Minimax (Bot Hard)

```typescript
// Implementación en src/lib/games/ai/tic-tac-toe-ai.ts
function minimax(board, depth, isMaximizing, botPlayer, humanPlayer) {
  // Caso base: verificar ganador o empate
  if (winner) return winner === botPlayer ? 10 - depth : depth - 10;
  if (isDraw) return 0;

  if (isMaximizing) {
    // Maximizar puntuación del bot
    let bestScore = -Infinity;
    for each empty cell:
      board[cell] = botPlayer;
      score = minimax(board, depth + 1, false, ...);
      bestScore = max(score, bestScore);
    return bestScore;
  } else {
    // Minimizar puntuación del humano
    let bestScore = Infinity;
    for each empty cell:
      board[cell] = humanPlayer;
      score = minimax(board, depth + 1, true, ...);
      bestScore = min(score, bestScore);
    return bestScore;
  }
}
```

### Sincronización Realtime

- **Canal único consolidado**: `game-lobby:${familyId}` en lobby
- **Subscripciones múltiples en un canal**:
  ```typescript
  supabase
    .channel('game-lobby:123')
    .on('postgres_changes', { table: 'game_rooms', filter: 'family_id=eq.123' }, ...)
    .on('postgres_changes', { table: 'room_participants' }, ...)
    .subscribe()
  ```
- **Actualización bidireccional**: User 1 ve cambios de User 2 y viceversa
- **Estado del juego sincronizado**: Movimientos, turnos, resultado

### Ventajas del Sistema

- ✅ Multiplayer en tiempo real sin lag
- ✅ Bots AI con 3 niveles (invencible en hard)
- ✅ Auto-cleanup de salas vacías
- ✅ Sistema de abandono justo
- ✅ Estadísticas automáticas (sin bots)
- ✅ Extensible para más juegos
- ✅ RLS completo en todas las tablas
- ✅ Validación server-side de movimientos

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
3. ✅ Módulo de miembros con roles y transferencia
4. ✅ Módulo de wishlist con anti-spoiler
5. ✅ Sistema de comentarios con @menciones
6. ✅ Sistema de notificaciones en tiempo real
7. ✅ **Módulo de Games multijugador** (Tic-Tac-Toe con bots AI)
8. ✅ UI/UX moderna y responsive

**Próximos pasos sugeridos**:

- Implementar subida de imágenes para wishlist (Supabase Storage)
- Expandir gift status a enum completo
- Agregar más juegos al módulo games (Connect 4, Chess, etc.)
- Implementar leaderboard visual con estadísticas
- Módulo de Eventos (calendario)
- Módulo de Gastos

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

_Documento actualizado: 2026-01-16 - Módulo de Games multijugador completo (Tic-Tac-Toe con bots AI)_
