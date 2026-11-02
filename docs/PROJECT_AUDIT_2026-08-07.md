# Auditoría final de MyFamily

> Informe histórico de agosto. Consultar [PROJECT_AUDIT_2026-10-31.md](PROJECT_AUDIT_2026-10-31.md) para el alcance y estado actuales del MVP.

- **Actualizada:** 15 de agosto de 2026
- **Rama:** `codex/functional-roadmap`
- **Base de cierre:** `dd21158` (`docs: close functional product roadmap`)
- **Entorno verificado:** Node.js 24, Supabase local, Chromium de escritorio y viewport móvil

## Veredicto ejecutivo

MyFamily queda como **release candidate local** limpia y reproducible para una prueba manual final. El roadmap funcional sigue intacto, las dos incidencias P1 detectadas en la revisión final se han corregido y no quedan riesgos P0 o P1 conocidos dentro del alcance local:

- el callback OAuth solo acepta destinos internos validados y usa `/dashboard` como fallback;
- el layout protegido aplica MFA en SSR cuando una cuenta tiene TOTP verificado y la sesión continúa en AAL1;
- la ruta de verificación evita bucles y conserva únicamente destinos de retorno internos;
- las operaciones sensibles mantienen su autorización AAL2 independiente en servidor y RLS.

Esta conclusión **no equivale a producción lista para usuarios reales**. Aún faltan decisiones y controles operativos externos descritos en «Riesgos residuales».

## Alcance funcional conservado

- Miembros, invitaciones y roles familiares con operaciones de ownership atómicas y protegidas por AAL2.
- Wishlist con cantidades, reservas, compras, comentarios y garantías anti-spoiler.
- Gastos por colecciones privadas con ACL independiente, categorías, recibos, análisis, CSV, repartos y recurrencias.
- Calendario, tareas, listas, notas, planner, comidas, hábitos y documentos privados.
- Catálogo central de módulos y preferencias familiares.
- Juegos permanece en el repositorio, pero deshabilitado en catálogo, navegación y acceso directo.
- No se ha añadido billing, gamificación, paywall ni promesas comerciales nuevas.

La arquitectura, los permisos y el catálogo vigente se detallan en [ARCHITECTURE.md](ARCHITECTURE.md), [PERMISSIONS.md](PERMISSIONS.md) y [MODULES.md](MODULES.md).

## Correcciones de cierre

### Callback y MFA

- `next` rechaza URLs absolutas, rutas relativas al protocolo, backslashes, caracteres de control y separadores codificados, incluidas variantes doblemente codificadas.
- Se conservan rutas internas y query strings válidas.
- La comprobación SSR usa el AAL actual y el siguiente nivel requerido ofrecidos por la versión instalada de Supabase.
- Solo se redirige cuando `currentLevel` es `aal1` y `nextLevel` es `aal2`; una cuenta sin factor verificado no queda bloqueada.
- Un error al consultar el AAL falla de forma cerrada con respuesta 503.

### Reproducibilidad

- La prueba pgTAP de borrado de documentos simula correctamente el guard de sesión utilizado por la API actual de Supabase Storage y sigue comprobando la política RLS.
- El E2E de calendario espera la hidratación antes de escribir el formulario y usa una fecha futura determinista, evitando que el fixture caduque.
- `ws` se actualizó de `8.18.3` a `8.21.3`; `npm audit --omit=dev` queda en cero vulnerabilidades.

## Evidencia reciente de verificación

| Comprobación | Resultado |
| --- | --- |
| `node --version` | `v24.18.1` |
| `npm run check` | Correcto: 0 errores; 30 avisos en 12 archivos |
| `npm run lint` | Correcto: Prettier sin diferencias; ESLint 0 errores y 118 avisos |
| `npm run test:unit` | Correcto: 28 archivos y 135 pruebas |
| Pruebas específicas de callback/MFA | Correcto: 4 archivos y 30 pruebas |
| `npm run build` | Correcto; build de producción generado |
| `npm run db:reset` | Correcto; 42 migraciones aplicadas desde cero hasta `20260805130000_module_preferences.sql` |
| `npm run test:db` | Correcto: 14 archivos pgTAP y 457 pruebas |
| `npm run test:e2e` | Correcto: 22/22; 11 escenarios en escritorio y los mismos 11 en móvil |
| `supabase db lint --level warning` | 0 errores; 1 advertencia de volatilidad preexistente |
| `npm audit --omit=dev` | 0 vulnerabilidades de producción |

La matriz E2E cubre accesos permitidos y denegados, separación entre familias, privacidad seleccionada, XSS almacenado, concurrencia de Wishlist, módulos desactivados, documentos privados, exportación, recordatorios y operaciones sensibles.

## Evidencia histórica conservada

El cierre del roadmap del 7 de agosto verificó además:

- backup lógico y restauración aislada de los esquemas de aplicación;
- Lighthouse local sobre build de producción: escritorio 100/100/100/100 y móvil 97/100/100/100;
- revisión visual de la portada a 1440 px y 390 px sin desbordamiento horizontal.

Estas mediciones no se repitieron en este cierre porque no hubo rediseño visual ni cambios de esquema de aplicación. La auditoría previa al roadmap se conserva, marcada como reemplazada, en [PROJECT_AUDIT_2026-08-05_PRE_ROADMAP.md](history/PROJECT_AUDIT_2026-08-05_PRE_ROADMAP.md).

## Riesgos residuales

### P2 — obligatorios antes de producción

1. **Despliegue y operación:** falta elegir un adaptador/hosting de producción y configurar backups programados, restauración remota, alertas, métricas, rotación de secretos y respuesta a incidentes.
2. **Configuración remota de autenticación:** falta validar en el proyecto real SMTP, plantillas, Site URL, allowlist de redirecciones y proveedores OAuth. Los tiempos de expiración deben proceder de la configuración efectiva de Supabase.
3. **Recuperación de MFA:** no existe un flujo propio de recovery codes; debe definirse soporte y recuperación segura antes de exigir MFA a usuarios reales.
4. **Toolchain de desarrollo:** `npm audit` completo informa 25 avisos solo en dependencias de desarrollo (1 bajo, 4 moderados, 16 altos y 4 críticos). Producción informa cero. Deben actualizarse por paquetes y validarse, sin un `audit fix --force` indiscriminado.
5. **Sesión heredada:** el E2E muestra advertencias de Supabase por lecturas de `getSession()` en código heredado. Las fronteras sensibles verifican al usuario, pero conviene migrar las lecturas restantes a `getUser()` o `getClaims()`.
6. **Validación externa:** faltan revisión independiente, DAST, carga y pruebas con correo, OAuth, Storage y Edge Functions remotas.

### P3 — deuda no bloqueante de la RC local

1. **Análisis estático:** permanecen 30 avisos de Svelte y 118 de ESLint, principalmente en pantallas heredadas y Juegos deshabilitado.
2. **Base de datos:** `supabase db lint` advierte que `private.next_recurring_expense_date` está marcada `IMMUTABLE` aunque contiene una expresión `STABLE`; requiere una migración deliberada y revalidación de dependientes.
3. **Internacionalización:** varias pantallas autenticadas conservan texto literal y necesitan completar la migración a Paraglide.
4. **Métricas web:** Lighthouse local no sustituye Core Web Vitals ni observabilidad de usuarios reales.

## Decisión de cierre

La aplicación se considera **release candidate local apta para prueba manual final**. La promoción a producción queda condicionada al cierre de los P2 anteriores y a una validación sobre la infraestructura remota elegida.
