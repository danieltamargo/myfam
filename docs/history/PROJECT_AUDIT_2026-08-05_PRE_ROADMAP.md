> **Documento histórico reemplazado.** Esta auditoría describe el estado anterior al roadmap funcional y no representa el producto actual. Consulta [`../PROJECT_AUDIT_2026-08-07.md`](../PROJECT_AUDIT_2026-08-07.md) para la auditoría vigente.

# Auditoría integral del proyecto (pre-roadmap)

**Proyecto:** MyFamily / MyFamKit
**Fecha:** 5 de agosto de 2026
**Alcance:** código, rutas, componentes, migraciones, tipos, configuración, dependencias, documentación y comprobación local de la interfaz
**Naturaleza:** análisis estático y dinámico local; no se modificaron código, configuración, migraciones ni datos

## Veredicto ejecutivo

El proyecto está en una fase **MVP/alpha avanzada en cantidad de código, pero temprana en fiabilidad**. Existe una base coherente de SvelteKit + Supabase, la aplicación pública carga, el build termina y los flujos principales tienen bastante implementación. Sin embargo, no puede considerarse funcional de extremo a extremo ni apto para producción por cuatro razones:

1. Hay vulnerabilidades críticas de autorización y XSS.
2. El sistema de tipos no está sincronizado con las migraciones y `svelte-check` falla.
3. No existe ninguna suite de pruebas del producto ni CI.
4. La portada anuncia módulos que no existen y dos de sus enlaces principales terminan en 404.

La recomendación es **no desplegar con usuarios o datos reales** hasta resolver los bloqueos P0 de seguridad, volver a poner en verde `check` y lint, y cubrir los flujos críticos con pruebas automatizadas.

## Foto del repositorio

- Rama observada: `main`, siguiendo `origin/main`.
- Último commit observado: `aa3ee51`, de 16 de enero de 2026.
- Aproximadamente 111 archivos relevantes y 17.800 líneas entre Svelte, TypeScript, SQL, JSON y Markdown.
- El árbol ya contenía cambios locales de usuario en `project.inlang/cache/plugins/2sy648wh9sugi`, `supabase/.temp/*` y `supabase/snippets/`. No se tocaron.
- No hay workflows en `.github`.
- No hay archivos `*.test.*` o `*.spec.*` del producto.

## Evaluación por área

| Área | Evaluación | Conclusión |
| --- | --- | --- |
| Arquitectura base | Razonable para un MVP | Buen uso inicial de rutas SvelteKit, server loads/actions y Supabase; falta una capa de dominio y transacciones |
| Compilación | Parcial | `npm run build` pasa, pero no valida los errores de tipos detectados por `svelte-check` |
| Calidad estática | No aceptable | 29 errores, 49 advertencias y lint bloqueado |
| Seguridad | Crítica | RLS permisiva, XSS almacenado, 2FA no aplicado y funciones privilegiadas sin autorización suficiente |
| Funcionalidad | Parcial | Familias y wishlist son las áreas más completas; juegos, módulos y varios flujos tienen huecos |
| UX/UI | Base visual buena | Responsive y sin errores de consola en páginas públicas; contenido, idioma, SEO y accesibilidad no están cerrados |
| Base de datos | Rica pero frágil | Buen intento de modelado y RLS, pero políticas y funciones exponen capacidades excesivas |
| Pruebas/CI | Ausente | Storybook solo contiene ejemplos iniciales; Vitest no encuentra pruebas |
| Operación/despliegue | No definido | `adapter-auto` no detecta destino local y no hay pipeline ni estrategia de entorno |
| Documentación previa | Desfasada | Marcaba 2FA como pendiente o seguro según el archivo y citaba migraciones eliminadas |

## Arquitectura actual

### Lo bien planteado

- La separación por rutas y funcionalidades de SvelteKit es fácil de seguir.
- Las operaciones sensibles se intentan concentrar en `+page.server.ts` y `+layout.server.ts`.
- El cliente SSR de Supabase usa cookies y valida al usuario con `getUser()` en `src/hooks.server.ts`.
- TypeScript está configurado en modo estricto.
- Las migraciones modelan familias, miembros, invitaciones, regalos, comentarios, notificaciones, juegos, estadísticas y logros.
- RLS está habilitado en las tablas importantes, aunque varias políticas concretas sean incorrectas.
- La interfaz usa un sistema de diseño consistente basado en Tailwind/daisyUI y responde correctamente en 1280 px y 390 px.

### Lo que limita la mantenibilidad

- Archivos servidor de 400-700 líneas mezclan autorización, validación, dominio y persistencia.
- Las operaciones multi-paso no están encapsuladas en transacciones. Crear una familia, transferir propiedad, actualizar relaciones de regalos o registrar una jugada puede quedar a medias.
- Hay lógica de seguridad duplicada entre UI, acciones de servidor y RLS, sin una política única verificable.
- `src/lib/types/database.ts` no representa las últimas migraciones: faltan, entre otros, `profiles.active_family_id`, columnas de bots y RPC recientes.
- Se usan numerosos `any` para atravesar desajustes de tipos.
- `$components` apunta a `src/components`, directorio que no existe.
- `.prettierignore` excluye `*.svelte` con una nota obsoleta sobre Svelte 5.
- `eslint.config.js` contiene un error de sintaxis entre las reglas `no-undef` y `no-unused-vars`.
- No se ha fijado versión de Node ni plataforma de despliegue.

## Funcionalidad real

### Portada y páginas públicas

La portada carga sin errores de consola, no tiene desbordamiento horizontal en móvil y presenta una base visual sólida. No obstante:

- `/features` y `/contact`, enlazadas desde hero, CTA y footer, devuelven la página 404.
- No hay `<title>` en portada ni login; el navegador muestra la dirección local.
- No se detectaron landmarks `main` o `nav` en la portada.
- Los mensajes mezclan español e inglés (`Multi-family`, `Real-time sync`, `Secure & private`).
- Login y 404 están en inglés mientras el documento declara `lang="es"`.
- Los inputs de login no declaran `name` ni `autocomplete`.
- `robots.txt` permite rastrear todo y no existe una estrategia visible de sitemap/canonical/OG.
- La portada promete calendario, finanzas, tareas, comidas, objetivos, documentos, cifrado y prueba gratuita, funcionalidades que no están implementadas.

### Autenticación

- Registro, login con contraseña, OAuth, callback, recuperación de contraseña y actualización de contraseña tienen UI y código.
- Las rutas protegidas redirigen a `/login` cuando no hay sesión; se verificó dinámicamente con `/dashboard`.
- No se pudo ejecutar un flujo real de alta/login/email porque Supabase local no estaba activo y no se realizaron mutaciones en el proyecto remoto.
- El callback acepta `next` sin validar el destino. Un valor con doble barra puede producir una redirección externa relativa al esquema en `src/routes/auth/callback/+server.ts:6-16`.

### 2FA/MFA

El proyecto implementa enrollment TOTP, listado de factores, challenge y verificación. Eso no equivale todavía a una protección 2FA efectiva:

- Login redirige a `/verify-2fa`, pero el layout protegido solo exige usuario y sesión.
- Una sesión `aal1` puede navegar directamente a rutas protegidas.
- El callback OAuth redirige al dashboard sin forzar challenge.
- `ConfirmationModal` verifica el código en el cliente, pero la acción POST que realiza el cambio no exige AAL2.
- No hay políticas RLS restrictivas basadas en el claim `aal`.
- No hay códigos de recuperación ni flujo administrativo documentado/implementado para una pérdida del autenticador.

Según la documentación oficial de Supabase, la UI de MFA por sí sola no aumenta la seguridad: debe aplicarse AAL2 también en SSR, APIs y/o políticas RLS.

### Familias, miembros e invitaciones

Los flujos CRUD, roles, invitaciones y familia activa están implementados. Sus bloqueos principales son:

- La política `can_insert_family_members` permite que cualquier usuario autenticado se inserte como `owner` en cualquier familia cuyo UUID conozca.
- Las invitaciones son globalmente legibles por cualquier usuario autenticado debido a una política `USING (true)`. La política posterior de “propias invitaciones” no la restringe porque las políticas permisivas se combinan con OR.
- Todos los perfiles son legibles por todos los usuarios autenticados, incluyendo email y nombre visible.
- La transferencia de propietario hace actualizaciones separadas y puede dejar un estado parcial.
- La creación de una familia también usa varios pasos; el intento de rollback puede ser bloqueado por RLS.
- El estado de familia activa se duplica entre base de datos y `localStorage`; además se intenta limpiar una cookie que no se encontró establecida.

### Wishlist

Es la funcionalidad más desarrollada: items, eventos, reservas, comentarios, menciones y estados. Hay un bloqueo crítico:

- `GiftComments.svelte` transforma el contenido con expresiones regulares y lo renderiza mediante `{@html}` sin escapar primero el texto. Un miembro puede guardar HTML ejecutable que se reproducirá para otros miembros.
- `ConfirmationModal` renderiza `message` con `{@html}`. La pantalla de miembros interpola nombres de perfil no saneados dentro de ese mensaje, creando otro camino de XSS almacenado.
- `WishlistEditModal.svelte` contiene un formulario dentro de otro formulario, marcado por Svelte como HTML inválido y riesgo de hidratación.
- Varias actualizaciones de item/eventos/enlaces se hacen como delete + insert sin transacción.

### Notificaciones

- La lectura y actualización están limitadas al usuario propietario.
- La inserción permite `WITH CHECK (true)` a cualquier rol `authenticated`.
- Un usuario puede crear notificaciones para otro usuario, y los IDs son descubribles mediante perfiles globales.
- Al pulsar una notificación, el código asigna directamente `notification.link` a `window.location.href`; no hay lista de rutas permitidas ni rechazo de protocolos peligrosos.

La combinación de inserción arbitraria y enlace arbitrario es un bloqueo crítico.

### Juegos

- El modelo declara `tic_tac_toe`, `connect_four` y `wordle`.
- La pantalla de juego y la acción `makeMove` siempre trabajan con un tablero 3x3 y reglas de tres en raya.
- Conecta 4 se comporta como una variante rota del tablero 3x3.
- Wordle crea un estado diferente, pero la UI intenta leer `gameState.board`; además la palabra objetivo queda serializada al cliente.
- El inicio de partida consulta participantes sin seleccionar `is_bot` ni `bot_difficulty`, por lo que la detección de bots no funciona de forma fiable.
- Una acción directa puede intentar jugar después de finalizar porque `makeMove` no valida el estado terminal de sesión/sala.
- Conteo de movimientos, inserción y actualización de sesión no son atómicos; dos solicitudes concurrentes pueden pisarse.
- El borrado automático de salas vacías puede eliminar sesiones y movimientos, haciendo desaparecer historial y replay.
- Las políticas `system_can_manage_sessions` y `system_can_manage_stats` conceden `FOR ALL ... USING (true)` a cualquier usuario autenticado.
- `add_bot_to_room` y `get_game_leaderboard` son `SECURITY DEFINER` y no comprueban adecuadamente creador/pertenencia antes de operar o devolver datos.

### Módulos incompletos o inactivos

- `family_modules`, notas, conexiones externas y utilidades de auditoría existen en esquema o código, pero no forman un flujo completo visible.
- El enum de módulos familiares no incluye wishlist ni juegos, a pesar de ser las funcionalidades activas.
- `external_connections` contempla tokens de acceso y refresh en texto de tabla; antes de habilitarlo requiere cifrado/gestión de secretos y políticas específicas.
- `/demo` y las stories iniciales de Storybook son material de plantilla que no documenta el producto real.

## Hallazgos de seguridad priorizados

### P0 — bloquean cualquier producción

1. **Escalada a propietario de familia.** `family_members` permite auto-inserción como owner sin relacionarla con `families.created_by` ni con una invitación.
2. **XSS almacenado en comentarios.** Contenido controlado por usuarios llega a `{@html}` sin escape/sanitización.
3. **Notificaciones arbitrarias con destino arbitrario.** Cualquier autenticado puede insertar para cualquier usuario y definir un enlace consumido por `window.location.href`.
4. **RLS de juegos equivalente a acceso total.** Cualquier autenticado puede gestionar todas las sesiones y estadísticas.
5. **2FA no aplicado como autorización.** Las rutas, acciones y RLS no exigen `aal2`.

### P1 — resolver inmediatamente después

1. XSS mediante `display_name` interpolado en `ConfirmationModal`.
2. Lectura global de invitaciones.
3. Lectura global de perfiles y emails.
4. Open redirect en callback de autenticación.
5. Funciones `SECURITY DEFINER` expuestas sin comprobaciones completas, `search_path` fijo ni revisión de permisos `EXECUTE`.
6. Tokens de conexiones externas almacenables en texto claro.
7. Ausencia de CSP y cabeceras de endurecimiento observables en el proyecto.

### P2 — endurecimiento

- Validación de payloads centralizada y esquemas explícitos.
- Rate limiting específico para acciones de aplicación.
- Auditoría de eventos sensibles real y verificable.
- Restricción de columnas de perfil visibles mediante tabla pública separada o privilegios mínimos.
- Rotación/revisión de secretos y estrategia de incidentes antes de operar.

## Resultados de comprobaciones

| Comando/comprobación | Resultado observado |
| --- | --- |
| `npm run build` | Pasa; genera build cliente/servidor con advertencias Svelte |
| `npm run check` | Falla: 29 errores y 49 advertencias en 25 archivos |
| `npm run lint` | Falla: error de sintaxis en `eslint.config.js` y formato pendiente |
| `npm exec vitest -- run` | Falla: no se encontraron archivos de prueba |
| `npm run build-storybook` | Pasa, pero las 3 stories son ejemplos iniciales sin cobertura del producto |
| `npm audit --omit=dev` | 1 vulnerabilidad alta en dependencias de producción (`ws`, transitiva de Supabase Realtime) |
| `npm audit` | 25 vulnerabilidades: 4 críticas, 16 altas, 4 moderadas y 1 baja |
| `npm outdated` | Dependencias principales desactualizadas, incluidas SvelteKit, Svelte, Supabase, Vite, Vitest, Storybook y Paraglide |
| Supabase local | No disponible: Docker Desktop no estaba operativo |
| `supabase db lint --linked` / lista remota | No verificable por timeout/credencial de base de datos; no se cambió estado remoto |
| Portada desktop/móvil | Carga, responsive y sin errores de consola |
| `/features` y `/contact` | 404 |
| `/dashboard` sin sesión | Redirige a `/login` |

El build avisó además que `adapter-auto` no detectó un entorno de producción. Debe elegirse el adaptador del destino real y fijarlo en el lockfile.

## Errores de tipos y advertencias destacadas

- `active_family_id` no existe en el tipo generado de `profiles`.
- `is_bot`, `bot_difficulty` y `add_bot_to_room` no existen en los tipos generados.
- Hay incompatibilidades entre `Json`, estados de juego y tipos de inserción/actualización.
- Existen IDs potencialmente nulos usados donde se requiere `string`.
- Svelte detecta estado que captura el valor inicial de props en componentes de layout, juegos y notificaciones.
- Hay múltiples avisos de accesibilidad: elementos estáticos con click, labels incorrectos, `tabindex`, autofocus e iconos sin nombre accesible.
- `ConfirmationModal` no implementa el focus trap ni cierre con Escape que afirmaba su documentación.

## Dependencias y cadena de suministro

Las versiones instaladas están por detrás de las versiones admitidas por los rangos o de las actuales. Ejemplos observados:

- `@sveltejs/kit` 2.49.2 → 2.70.2 disponible.
- `svelte` 5.46.0 → 5.56.8 disponible.
- `@supabase/supabase-js` 2.89.0 → 2.112.1 disponible.
- `@supabase/ssr` 0.8.0 → 0.12.4 disponible.
- `vite` 7.3.0 → 7.3.6 dentro del major; 8.2.0 como major nuevo.
- `vitest` 4.0.16 → 4.1.10 disponible.
- `storybook` 10.1.10 → 10.5.6 disponible.

No conviene actualizar todo de una vez. Primero deben corregirse lint/tipos y añadirse pruebas mínimas; después, actualizar por lotes con build, check y tests en cada lote.

## Plan recomendado

### Fase 0 — contención

1. No publicar ni invitar usuarios reales.
2. Corregir las cuatro políticas RLS críticas y revisar todas las políticas como conjunto.
3. Eliminar los caminos de `{@html}` para datos de usuario o aplicar escape/sanitización robusta.
4. Restringir notificaciones a funciones/servidor de confianza y validar enlaces internos.
5. Aplicar AAL2 en servidor y como política RLS restrictiva donde corresponda.

### Fase 1 — recuperar una base verificable

1. Regenerar tipos desde una base migrada y resolver todos los errores de `svelte-check`.
2. Corregir ESLint/Prettier y dejar ambos comandos en verde.
3. Levantar Supabase local desde cero y ejecutar todas las migraciones.
4. Crear tests de RLS para dos usuarios y dos familias, incluyendo casos negativos.
5. Añadir tests de auth/MFA, roles, wishlist y jugadas concurrentes.
6. Crear CI con install, check, lint, test, build y auditoría controlada.

### Fase 2 — cerrar funcionalidad

1. Elegir si se terminan o se ocultan Conecta 4 y Wordle.
2. Hacer atómicas las operaciones multi-paso mediante funciones/transacciones de base de datos.
3. Decidir qué módulos pertenecen realmente al MVP y alinear portada, navegación y esquema.
4. Implementar `/features` y `/contact` o eliminar sus enlaces.
5. Completar i18n y unificar `MyFamily`/`MyFamKit`.

### Fase 3 — producción

1. Elegir adaptador/hosting y documentar entornos, secretos, backups y rollback.
2. Añadir metadatos SEO, cabeceras de seguridad, CSP, observabilidad y gestión de errores.
3. Actualizar dependencias por lotes y resolver advisories.
4. Ejecutar revisión de seguridad independiente y pruebas de aceptación sobre staging.

## Criterios mínimos de salida a producción

- Cero hallazgos P0/P1 abiertos.
- `npm run check`, `npm run lint`, tests y build en verde en CI.
- Migraciones reproducibles desde una base vacía y tipos generados sincronizados.
- Tests negativos de RLS para cada tabla expuesta.
- AAL2 aplicado y probado en rutas, acciones y base de datos.
- Flujos principales probados en desktop y móvil.
- Claims de la portada limitados a funcionalidades existentes.
- Plataforma, backups, monitorización, soporte y recuperación documentados.

## Limitaciones de esta auditoría

- No se modificó ni pobló ninguna base de datos.
- Supabase local no pudo arrancar porque Docker Desktop no estaba disponible.
- No se validó el estado real de las migraciones remotas por falta de conexión/credencial de base de datos.
- No se crearon cuentas ni se ejecutaron flujos que enviaran email o mutaran el proyecto remoto.
- El MCP de Svelte configurado en el repositorio no estaba disponible en esta sesión; se usaron `svelte-check`, build y documentación oficial como contraste.
- Lazyweb no estaba disponible, por lo que no se generó un informe comparativo con evidencias externas. La revisión visual se limitó a la aplicación local en desktop y móvil.

## Referencias oficiales usadas para contrastar criterios

- [Supabase: Multi-Factor Authentication](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [SvelteKit: Auth](https://svelte.dev/docs/kit/auth)
- [SvelteKit: adapter-auto](https://svelte.dev/docs/kit/adapter-auto)
- [Svelte: `{@html}`](https://svelte.dev/docs/svelte/@html)
