# Pruebas operativas locales del MVP

> Ejecución: skills de planificación, desarrollo por subagentes, PostgreSQL y verificación. No modificar datos ni detener contenedores de otros proyectos o del entorno habitual.

**Objetivo:** comprobar recuperación tras caída y reinicio, restauración completa de los servicios Supabase usados por MyFamily y consumo con carga familiar sintética.

**Arquitectura:** crear un proyecto Docker de ensayo con credenciales nuevas, datos ficticios y puertos de loopback distintos. Utilizar las imágenes disponibles y las herramientas de copia cifrada existentes. Mantener separados la medición de APIs, la aplicación y el análisis antivirus.

## 1. Restauración completa aislada

Responsable: `supabase_restore_ops`. Archivo: `scripts/test-supabase-recovery.mjs` y configuración auxiliar estrictamente necesaria. Resultados y secretos sintéticos bajo `output/`, excluidos de Git; los informes no contienen credenciales.

- [x] Crear Auth, PostgreSQL, REST, Storage, Realtime y gateway aislados, con 72 migraciones y 11 usuarios ficticios (10 familias y una cuenta externa).
- [x] Verificar acceso permitido y denegado por RLS, login/refresh, archivo privado y recepción Realtime antes de copiar.
- [x] Capturar PostgreSQL, Storage y configuración de cifrado en frío con `scripts/backup.mjs`, autenticar tres archivos y restaurar en volúmenes nuevos. Corregida la extracción incompatible con BusyBox, conservando propietarios numéricos y permisos.
- [x] Ejecución final sin intervención: 13,167 s para parada/verificación/extracción y 30,926 s hasta las APIs verificadas. Auth renovó una sesión persistida del archivo; REST/RLS, SHA-256 de Storage, Vault y un evento Realtime con marcador único pasaron. Evidencia: `output/supabase-recovery-ops20261101/result.json`. El archivo cifrado ya existía: estos tiempos excluyen su creación inicial.

## 2. Caída y reinicio

Responsable: proceso principal, después de disponer del entorno aislado. No interferir con la captura ni la carga.

- [x] Comprobar caída abrupta conservando filas y bytes: app se recuperó automáticamente al matar su proceso (7,032 s); caída y arranque manual de DB (3,936 s), Storage (3,880 s), app (6,944 s) y proxy (2,315 s) pasaron.
- [x] Parar y arrancar ordenadamente los diez contenedores: 24,473 s hasta las comprobaciones funcionales. Login/refresh, permisos, archivos y cookie de app persistieron en los seis escenarios; se repitió además la verificación completa de APIs y Realtime.
- [x] Registrar tiempos, reinicios y salud sin confundir tiempo hasta verificación con indisponibilidad HTTP exacta. Corregidas la política de reinicio de dependencias y la inspección de servicios sin healthcheck. Borrado de cuenta desechable validado con TOTP AAL2 real, más respuestas 401/403/405 esperadas. Evidencias: `output/ops-local-restart-result.json` y `output/ops-functions-result.json`.

## 3. Recursos bajo carga

Responsable: `local_load_ops` implementa `scripts/test-operational-load.mjs`; el proceso principal coordina su ejecución.

- [x] Medir reposo y fases de 20 s con 1, 5 y 10 usuarios. Diez logins iniciales separados y calentamientos de 2 s excluidos: 5.979 operaciones HTTP medidas, todas correctas.
- [x] Medir 492 análisis limpios por INSTREAM con concurrencia 1 y 2 y muestras PDF/PNG, 1 MiB y 8 MiB; no equivale a carga de subidas HTTP ni archivos complejos.
- [x] Registrar cero errores, OOM o reinicios inesperados. Pico conjunto: 2.024,20 MiB y 2,05 núcleos. Con diez usuarios: p95 REST lectura 20,57 ms, escritura RPC 26,15 ms y páginas autenticadas 599,09 ms. Evidencia: `output/ops-local-load-result.json`.
- [x] Proponer inicialmente 4 vCPU/8 GiB para Supabase self-hosted más antivirus, con margen de sistema y crecimiento. REST llegó a 253,3/256 MiB: se propone 512 MiB, aún no ensayados. No se certifica capacidad de un VPS ni se reduce el límite de ClamAV por su consumo actual. Detalle y límites en [el informe](../../LOCAL_OPERATIONS_2026-11-01.md).

## 4. Revisión y cierre

- [x] Revisar aislamiento, secretos y limpieza con revisión independiente. Guardas de nombres, etiquetas, redes, volúmenes y loopback; estados de recuperación reanudables.
- [x] Aprobar 4 pruebas criptográficas, 11 de fallos/señales del ciclo en Linux y 7 de guardas/recuperación con comandos simulados; extracción GNU/BusyBox con UID/GID/modo reales preservados. Formato y ESLint focales sin errores; no cambió código de interfaz.
- [x] Actualizar este plan, el plan MVP y las guías con resultados y pendientes externos.
- [x] Retirar 10 contenedores, 12 volúmenes, 4 redes y 17 archivos de secretos sintéticos. El Supabase habitual sigue activo y se conservó el volumen original de firmas. Sin limpieza global. Evidencia: `output/ops-local-cleanup-result.json`.

No activar temporizadores, publicar servicios, emitir certificados, configurar cuentas externas ni desplegar un VPS.
