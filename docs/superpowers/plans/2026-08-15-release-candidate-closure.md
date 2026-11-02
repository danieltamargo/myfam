# Plan de cierre de la release candidate local

> Alcance histórico. El MVP solicitado el 31 de octubre de 2026 se sigue en [2026-10-31-mvp.md](2026-10-31-mvp.md); este cierre no acredita sus requisitos nuevos.

- **Fecha:** 15 de agosto de 2026
- **Rama:** `codex/functional-roadmap`
- **Estado:** completado

## Objetivo

Cerrar los dos fallos de autenticación detectados, alinear la documentación, retirar artefactos locales y dejar MyFamily como release candidate local reproducible para la prueba manual final.

## Arquitectura aplicada

Una utilidad universal valida destinos internos antes de redirigir. El layout SSR protegido consulta el AAL de Supabase y envía únicamente sesiones AAL1 elevables a la pantalla pública de challenge, conservando un retorno validado. Las operaciones críticas siguen exigiendo AAL2 en servidor, RPC o Edge Function y las políticas RLS mantienen la autorización de datos.

## Trabajo ejecutado

- [x] Verificar rama, commit base, falsos positivos del índice y cambios ajenos.
- [x] Añadir pruebas positivas y negativas del destino `next`.
- [x] Bloquear URLs absolutas, protocol-relative, backslashes, controles y codificación ambigua.
- [x] Aplicar el fallback `/dashboard` sin romper callback PKCE ni registro.
- [x] Añadir la matriz de pruebas MFA para cuentas sin TOTP, AAL1 elevable, AAL2 y acceso directo.
- [x] Aplicar la guarda MFA antes de cargar datos protegidos.
- [x] Evitar bucles de verificación y validar el retorno tras el challenge.
- [x] Actualizar guías de MFA, auth, emails y `ConfirmationModal`.
- [x] Archivar la auditoría previa y actualizar la auditoría final con cifras recientes.
- [x] Adaptar pgTAP al guard actual de Supabase Storage.
- [x] Evitar la caducidad temporal y la carrera de hidratación del E2E de calendario.
- [x] Actualizar `ws` a una versión sin vulnerabilidades de producción conocidas.
- [x] Retirar cachés y temporales versionados y ampliar `.gitignore`.
- [x] Versionar las skills compartidas confirmadas por el usuario en un commit independiente.
- [x] Verificar Node 24, check, lint, unitarias, build, migraciones, pgTAP y E2E.
- [x] Confirmar Juegos deshabilitado y ausencia de billing, gamificación y paywall.
- [x] Crear únicamente commits locales, sin push ni pull request.

## Criterio de cierre

La rama queda apta para prueba manual cuando todas las suites están verdes, `git status` no contiene cambios, los artefactos regenerados están ignorados y la auditoría separa con claridad la RC local de los requisitos P2/P3 previos a producción.
