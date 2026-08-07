# Auditoría de cierre de MyFamily

- **Fecha:** 7 de agosto de 2026
- **Rama:** `codex/functional-roadmap`
- **Alcance:** roadmap funcional completo, desde `40ee083` hasta el commit de cierre
- **Entorno verificado:** Node.js 24, Supabase local y Chromium de escritorio/móvil

## Veredicto ejecutivo

El roadmap funcional queda implementado y reproducible desde una base vacía. MyFamily dispone de autorización por capas, módulos familiares configurables, espacios privados por dominio y recorridos de aceptación para los casos críticos. La aplicación está preparada para una validación de despliegue controlada, pero no debe considerarse lista para almacenar datos familiares reales hasta cerrar los riesgos de operación y dependencias descritos al final.

## Alcance funcional cerrado

- Miembros, invitaciones y roles familiares con operaciones de ownership atómicas y protegidas por AAL2.
- Wishlist con cantidades, reservas, compras, comentarios y garantías anti-spoiler.
- Gastos por colecciones privadas con ACL independiente, categorías, recibos, análisis, exportación CSV, repartos y recurrencias.
- Calendario, tareas, listas, notas, planner familiar, comidas, hábitos y documentos privados.
- Catálogo central de módulos y preferencias familiares. Miembros y Wishlist son núcleo; Juegos permanece deshabilitado y sus URLs responden como no disponibles.
- Portada final bilingüe, sin promesas de billing, tiempo real, prueba gratuita ni módulos no publicados.

La arquitectura, los permisos y el catálogo vigente se detallan en [ARCHITECTURE.md](ARCHITECTURE.md), [PERMISSIONS.md](PERMISSIONS.md) y [MODULES.md](MODULES.md).

## Evidencia de verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run db:reset` | Correcto; 42 migraciones aplicadas desde cero hasta `20260805130000_module_preferences.sql` |
| `npm run verify` | Correcto: check, formato/ESLint, unitarias y build de producción |
| `npm run check` | 0 errores; 30 avisos preexistentes en 12 archivos |
| `npm run lint` | 0 errores; 132 avisos preexistentes |
| Unitarias | 24 archivos, 105 pruebas correctas |
| `npm run test:db` | 14 archivos pgTAP, 457 pruebas correctas |
| `npm run test:e2e` | 22/22 correctas; 11 escenarios en Chromium y los mismos 11 en viewport móvil |
| `supabase db lint --level warning` | Sin errores de esquema en `extensions`, `private` y `public` |
| Svelte autofixer de la portada | Sin incidencias ni sugerencias |

La suite E2E cubre acceso permitido y denegado, separación entre familias, visibilidad seleccionada, XSS almacenado, concurrencia de wishlist, URLs de módulos desactivados, adjuntos privados, exportación y operaciones sensibles.

## Auditoría web de la portada

Lighthouse se ejecutó sobre el build de producción local, no sobre el servidor de desarrollo:

| Perfil | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
| --- | :---: | :---: | :---: | :---: |
| Escritorio | 100 | 100 | 100 | 100 |
| Móvil | 97 | 100 | 100 | 100 |

También se comprobó visualmente la portada a 1440 px y 390 px, sin desbordamiento horizontal. El rediseño se apoyó en evidencia de producto y en el [informe de Lazyweb](https://www.lazyweb.com/report/lazyweb/461effb9-714d-4040-9dad-cb2bd87fd2da/?source=create); la recomendación principal aplicada fue explicar la privacidad mediante los tres ámbitos Familia → Colección → Contenido.

## Recuperación, exportación y eliminación

- **Backup/restore:** se creó un volcado lógico de los esquemas de aplicación `public`, `private`, `auth` y `storage`, se restauró en una base aislada y se comparó con el origen. Ambos contenían 10 usuarios, 10 familias, 15 membresías, 52 tablas públicas y 77 funciones públicas. La base temporal y los volcados se eliminaron después de la prueba. Los esquemas gestionados `realtime` y `vault` se excluyeron deliberadamente: su recuperación corresponde a la plataforma Supabase.
- **Exportación:** el E2E de Gastos descarga el CSV desde el endpoint autorizado y el escenario de cierre verifica el contenido exportado de la colección privada.
- **Borrado de cuenta:** una llamada AAL1 es rechazada; tras enrolar y verificar TOTP, la sesión AAL2 elimina la cuenta mediante la Edge Function y se comprueba que el usuario ya no existe. Supabase local queda configurado con enrolamiento y verificación TOTP habilitados.

## Aceptación de privacidad

El escenario reproducible `product-closure.spec.ts` crea tres personas, dos familias y dos colecciones privadas dentro de una misma familia:

- Alice solo puede leer su colección.
- Bob solo puede leer la suya.
- Carol, miembro explícito de ambas, puede leer las dos.
- Una segunda familia no hereda acceso a ninguna colección.

El mismo escenario comprueba un gasto real, su representación CSV y el borrado AAL2. Se ejecutó de forma aislada y como parte de la matriz completa en escritorio y móvil.

## Riesgos residuales explícitos

1. **Despliegue y operación:** aún no hay adaptador/hosting de producción elegido, backups programados, alertas, métricas, rotación de secretos ni simulacro de recuperación sobre un entorno remoto.
2. **Dependencias:** `npm audit --omit=dev` informa de una vulnerabilidad alta transitiva en `ws`; el árbol completo de desarrollo informa 25 avisos (1 bajo, 4 moderados, 16 altos y 4 críticos). Deben actualizarse y volver a validarse las dependencias antes de desplegar, sin aplicar cambios automáticos incompatibles a ciegas.
3. **Avisos estáticos:** permanecen 30 avisos de Svelte y 132 de ESLint, concentrados sobre todo en Juegos deshabilitado y pantallas heredadas de autenticación, familias y perfil. No bloquean el build, pero representan deuda de accesibilidad y tipado.
4. **Internacionalización heredada:** la portada final tiene catálogos paralelos español/inglés mediante Paraglide; varias pantallas autenticadas antiguas todavía contienen texto literal y necesitan una migración de i18n completa.
5. **Autenticación SSR:** el servidor de pruebas emite avisos por consumo de objetos procedentes de `getSession()` en código heredado. Las fronteras sensibles verifican usuario y RLS, pero conviene migrar las lecturas restantes a `getUser()`/`getClaims()`.
6. **Validación externa:** las pruebas de seguridad son automatizadas y locales; faltan una revisión independiente, pruebas de carga, escaneo DAST y validación con configuración real de correo, OAuth, Storage y Edge Functions remotas.
7. **Métricas web:** Lighthouse es una medición de laboratorio local; no sustituye Core Web Vitals de usuarios reales.

## Decisión de cierre

El roadmap funcional se cierra como **implementado y verificable localmente**, con los riesgos anteriores aceptados únicamente como trabajo previo al despliegue productivo. No se declara disponibilidad general ni operación de producción.
