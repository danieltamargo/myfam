# Recuperación, operación y listas: plan de implementación

> **For agentic workers:** usar subagent-driven-development para bloques independientes. El proceso principal aplica migraciones y ejecuta las comprobaciones integradas; no restablecer bases con datos existentes.

**Goal:** cerrar recuperación MFA y herramientas de operación sin credenciales externas, y añadir tipos, sugerencias e iconos a las listas.

**Architecture:** mantener SvelteKit, servicios de dominio y Supabase/RLS. Sugerencias deterministas calculadas exclusivamente sobre recursos visibles; operaciones sensibles solo en servidor. Copias y restauración aislada mediante herramientas oficiales, sin incluir secretos en Git.

**Tech Stack:** Svelte 5, TypeScript, PostgreSQL/Supabase, Node 24, pnpm, Docker Compose.

## 1. Recuperación MFA

- [x] Revisar flujos actuales y acordar un diseño que no permita saltarse MFA con una sesión AAL1 ni exponga códigos o secretos.
- [x] Implementar recuperación, controles de reutilización/concurrencia, revocación y auditoría pertinentes; documentar el procedimiento y sus límites.
- [x] Probar recuperación válida, rechazo de entradas inválidas, reutilización y aislamiento; verificar que no se debilita la política MFA existente. Evidencia focal confirmada: MFA funcional en escritorio y móvil; dos consumos simultáneos aceptan exactamente uno. La ejecución completa terminó con 35/36; el caso fallido por navegación pasó 2/2 al repetirlo sin cambios.

## 2. Copias y preparación del VPS

- [x] Añadir copia de PostgreSQL y Storage con manifiesto, verificación y protección de secretos; documentar conservación, cifrado y copia fuera del VPS. La copia externa aún requiere configuración.
- [x] Preparar restauración explícita en destino aislado y realizar un ensayo local sin sobrescribir datos del usuario. Ensayo focal confirmado: `output/backup-drill-da01740a/result-v3.json`; cubre arranque PostgreSQL, roles, mockAuth, UTF-8 y hash/tamaño de Storage. No valida una API completa de Supabase.
- [x] Añadir configuración Docker/proxy HTTPS, arranque, salud y operación para VPS; validar sin emitir certificados ni desplegar fuera de este ordenador. Caddy 2.11.7 y Compose validados; no afirmar despliegue VPS ni temporizadores activos. Imagen endurecida construida y 6/6 recorridos con Caddy aprobados en HTTP local.

## 3. Listas por tipo y sugerencias

- [x] Añadir tipos compra, casa y otros con migración incremental compatible y posibilidad de selección.
- [x] Sugerir listas prehechas y elementos relacionados a partir del histórico visible y del tipo; evitar duplicados y conservar cantidades/unidades cuando proceda.
- [x] Asignar emojis por coincidencias de palabras normalizadas; sin coincidencia, dejar sin icono. No enviar texto a terceros.
- [x] Mantener privacidad, MFA, versiones, orden, deshacer y tiempo real; verificación focal confirmada: DB 900/30 PASS (incluye 18 pruebas de listas y 26 de MFA), E2E focal de listas en escritorio/móvil y MFA funcional en ambos. `pnpm verify` exit 0 (294 pruebas unitarias/50 archivos y 4 de backups), comprobación 0 errores/17 avisos, lint 0 errores/78 avisos y build exit 0. Docker build actualizado aprobado; detalle E2E y límites en la auditoría principal.

## 4. Integración y cierre

- [x] Revisar cambios de cada bloque y aplicar migraciones nuevas una sola vez.
- [x] Ejecutar pruebas focales, SQL y E2E relevantes; analizar Svelte con el analizador oficial local y completar revisión antislop.
- [x] Actualizar plan MVP, guías y auditorías distinguiendo preparación local de despliegue real y copia externa.

Responsables: agente de seguridad para MFA; agente de infraestructura para copias/VPS; agente de listas para su dominio e interfaz. Tipos compartidos y aplicación SQL coordinados por el proceso principal. No hacer commits ni publicar durante este trabajo.

Estado: alcance implementado y preparación local cerrada. El despliegue VPS/TLS real, SMTP/OAuth real, temporizadores y copia externa siguen pendientes. La tercera fuente `database-config` pasó bytes, modo 0600 y rechazo de configuración ausente en `output/backup-config-drill-d69040ff/result.json`. El analizador oficial Svelte revisó 37 archivos sin incidencias. Evidencia y límites completos: [auditoría principal](../../PROJECT_AUDIT_2026-10-31.md).
