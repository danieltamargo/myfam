# Estado del MVP: 31 de octubre de 2026

## Dictamen

El MVP funcional está implementado y verificado en local; **el lanzamiento sigue abierto**. La release candidate de agosto cerró un alcance distinto: excluía juegos, calendarios conectados y facturación, y no incluía el ciclo de regalos recibidos. Sus resultados son históricos y no sustituyen la evidencia actual resumida abajo.

La arquitectura existente es adecuada para continuar: SvelteKit organiza rutas y servicios por dominio; Supabase concentra identidad, Postgres con RLS, Storage y Realtime. Mantenerla evita una migración innecesaria. El trabajo pendiente para el lanzamiento se concentra en servicios externos, límites remotos y operación del despliegue.

## Cobertura de requisitos

| Requisito | Estado observado en código | Falta para el objetivo |
| --- | --- | --- |
| Login y registro | Pantallas, Supabase Auth, PKCE, recuperación por contraseña/código y TOTP | Verificar SMTP/OAuth real y límites remotos |
| Familias e invitaciones | RPC atómicas, roles y nuevas capacidades delegables de miembros/configuración | Validación de correo externo y operación real |
| Configuración de módulos | Catálogo, preferencias familiares y capacidades delegables owner-only; integración verificada | Derechos comerciales futuros |
| Wishlist sin spoilers | Recibido, histórico privado paginado y revelado explícito; oráculos de cantidad/estado corregidos; edición atómica de categorías | Importador Excel futuro sujeto a archivo y mapeo |
| Wishlist y eventos | Vínculo opcional con eventos reales implementado y verificado en E2E | Mantener privacidad al añadir nuevas integraciones |
| Importación familiar | Sin importador | Excel, emails, mapeo, tachados, comprador desconocido e idempotencia |
| Finanzas | Colecciones privadas con ACL, gastos, repartos, categorías, recurrencias, CSV y reembolsos registrados idempotentemente | Solo registra los reembolsos; no ejecuta transferencias bancarias |
| Lista de compra | Visibilidad familiar/privada/seleccionada, versiones, deshacer, tipos compra/casa/otros, plantillas y sugerencias del histórico visible, emojis locales; E2E focal aprobado | Ningún bloqueo funcional local identificado |
| Calendario | Integraciones Google y Outlook con tokens protegidos y sincronización manual | OAuth de producción sin cuentas reales; jobs/webhooks automáticos pendientes |
| Juegos | Cuatro juegos con autoridad de servidor; E2E desktop y móvil aprobados | Ningún bloqueo funcional local identificado |
| Otros módulos | Tareas, notas, planner, comidas, hábitos y documentos | Mantenerlos sin desplazar prioridad de Wishlist ni ampliar alcance |
| Filtros por familiar | Filtros por avatar en wishlist, calendario, gastos, listas, tareas, notas, hábitos y documentos; teclado y distribución comprobados en navegador | Ningún bloqueo funcional local identificado |
| SaaS futuro | Frontera de entitlement separada de preferencias | Proveedor comercial real; ahora NO_BILLING permite módulos publicados |
| Docker y VPS | Imagen endurecida, Caddy y herramientas de copia/restauración validados localmente | TLS real, SMTP, copias programadas/externas y operación de producción |

Evidencia principal: `src/lib/config/modules.ts`, `src/lib/server`, rutas `(protected)/family/[familyId]`, `supabase/migrations` y pruebas de dominio. El detalle de regalos y dominios relacionados está en [WISHLIST_MVP_AUDIT_2026-10-31.md](WISHLIST_MVP_AUDIT_2026-10-31.md); los riesgos de seguridad, en [SECURITY_AUDIT_2026-10-31.md](SECURITY_AUDIT_2026-10-31.md).

## Decisiones aplicadas

- Migrar npm a pnpm con lock real, conservar Node 24 y adaptar CI/Playwright.
- Desplegar SvelteKit mediante adapter-node y contenedor sin privilegios. La aplicación sigue necesitando Supabase; un Compose con el servicio web no es todo el sistema.
- Aplicar comprobación de sesión y MFA antes de resolver peticiones protegidas, incluidas acciones POST y endpoints. Mantener la barrera del layout como defensa adicional.
- Restringir borrado de cuenta a POST y detenerlo si falla la consulta de propiedad. La Edge Function de borrado pasó pruebas locales AAL2 y casos negativos; el despliegue remoto no está verificado.
- Añadir mejoras concretas de listas y cabeceras defensivas sin rediseñar el producto.
- Verificar el flujo de los cuatro juegos en E2E desktop y móvil: QA local del hito anterior aprobada; evidencia actual al final.
- Registrar el plan actualizado en [2026-10-31-mvp.md](superpowers/plans/2026-10-31-mvp.md).

## Seguridad y dependencias

Las nuevas comprobaciones cerraron hallazgos de autorización/filtración de metadatos en calendario, notas, documentos, hábitos y listas con auditoría de RLS y UUID. También se corrigió la autenticación de la Edge Function de borrado: service key ES256, AAL2 obligatorio y respuestas negativas para credenciales ausentes/falsas, AAL1 y GET. La migración `20261031235500_direct_supabase_mfa.sql` aplica MFA al acceso directo a Supabase; siguen pendientes verificar los límites remotos de Auth/API y la operación de producción.

El antivirus ClamAV analiza el mismo buffer antes de Storage y el flujo verifica autorización/ACL; RLS deniega INSERT/UPDATE en tres buckets. Se fijaron plazos de 30 segundos para Storage y 35 segundos para el scanner. La prueba EICAR benigna pasó tras el último cambio de plazo, junto con 21 pruebas de seguridad. El informe `docs/UPLOAD_SECURITY.md` recomienda 3 a 4 GiB para el motor; una medición idle de 955.9 MiB no garantiza ese dimensionamiento. Supabase local midió cerca de 1.9 GiB adicionales, incluidos Studio y analytics. MIME o firma de archivo no garantizan por sí solos ausencia de malware.

Las actualizaciones compatibles de pnpm y Paraglide 2.29.3 eliminaron los 32 avisos altos. La auditoría actual registra 8 avisos: 0 críticos, 0 altos, 4 moderados y 4 bajos, según `output/pnpm-audit-final.json`. `pnpm check` terminó con 0 errores y 17 avisos; ESLint terminó con 0 errores y 78 avisos. El filtro de producción no demuestra ausencia de riesgo de ejecución, porque herramientas clasificadas como devDependencies producen código desplegado.

No se ejecuta `audit fix --force`, no se cambia de framework y no se publican servidores de desarrollo en Internet para probarlos.

## Planificación anterior y nueva

Los planes `2026-08-05-functional-modules-roadmap.md` y `2026-08-15-release-candidate-closure.md` se conservan como historial de trabajo terminado según su alcance. Esta auditoría sustituye su conclusión de adecuación al MVP actual. El plan nuevo ordena infraestructura/seguridad, Wishlist, permisos, listas/finanzas, calendario/juegos y operación.

El futuro SaaS se prepara mediante permisos y límites adecuados, pero los cobros se implementarán en un hito posterior. El botón de reembolso registra una liquidación; una transferencia bancaria exige integración y autorización distintas.

La frase incompleta sobre eventos privados se interpreta conservadoramente: solo la audiencia autorizada ve el evento y sus detalles. La importación inicial real depende del Excel y los emails que aportará el usuario.

## Skills y delegación

Se aplicó antislop durante la implementación y revisión. El MCP local oficial de Svelte 0.1.28 analizó 37 archivos, registró 0 incidencias y dejó 26 heurísticas I/O de la página de juegos revisadas y conservadas. También pasaron 20 pruebas de esquema de filtros. Se consultaron las guías pertinentes de Supabase/Svelte.

Se separó infraestructura de auditoría de dominios y seguridad. Se usó GPT 6.1 Sol ligero para infraestructura, Sol medio para tareas de permisos/seguridad y Luna para actualizar esta documentación. No se necesitó Astra.

## Alcance de la revisión antislop

La comprobación de entrega realizada por el proceso principal está en [ANTISLOP_REVIEW_2026-10-31.md](ANTISLOP_REVIEW_2026-10-31.md), con evidencia y alcance por regla.

Revisión de código y copy existente, sin rediseño: mantener patrones y componentes actuales, no añadir controles sin comportamiento, no prometer pagos ni sincronización inexistente y distinguir datos de ejemplo de datos reales. Los avisos de accesibilidad heredados no quedan resueltos por esta revisión. No se afirma una auditoría visual completa de todas las pantallas, temas o estados sin recorridos reales.

## Recuperación y preparación operativa

La recuperación MFA para cuentas con contraseña está implementada: genera ocho códigos de 128 bits únicamente con AAL2, conserva hashes SHA-256 y exige contraseña actual, código y una nueva contraseña distinta para recuperar. El lote es de un solo uso; dos consumos concurrentes aceptan exactamente uno. La barrera de sesión invalida el acceso anterior y obliga a configurar un TOTP nuevo. OAuth exclusivo, ausencia de códigos y fallo tras consumirlos requieren el procedimiento de operador de [mfa-recovery.md](mfa-recovery.md).

Las herramientas `scripts/backup.mjs`, `scripts/backup-cycle.sh` y las plantillas systemd preparan copias en frío de volúmenes Docker PostgreSQL y Storage, más `database-config` con las claves pgsodium cuando existe ese montaje. AES-256-GCM cifra cada archivo y HMAC autentica el manifiesto. La restauración crea destinos aislados y conserva UID/GID y permisos de raíz y de todos los archivos mediante propietarios numéricos. El ensayo real PostgreSQL pasó arranque, roles, mockAuth, UTF-8 y hash/tamaño de Storage (`output/backup-drill-da01740a/result-v3.json`). La tercera fuente pasó comparación de bytes, modo 0600 y rechazo de configuración ausente (`output/backup-config-drill-d69040ff/result.json`). No demuestra una API Supabase completa ni recuperación de Vault con datos reales.

`compose.vps.yaml` y Caddy están preparados y validados sin emitir certificados. La aplicación corre como Node, saludable, con raíz de solo lectura, capacidades eliminadas, 768 MiB, una CPU y tmpfs de 64 MiB. El override de volúmenes para una instalación Supabase nueva hace que Storage e imgproxy compartan volumen; no debe aplicarse sobre una instalación con datos. Consultar [BACKUPS.md](BACKUPS.md) y [VPS_OPERATIONS.md](VPS_OPERATIONS.md). No se ha desplegado un VPS, activado temporizadores, configurado copia externa ni validado SMTP/OAuth con cuentas reales.

## Evidencia de ejecución

La recuperación MFA está implementada para cuentas con contraseña y códigos guardados: cambio de contraseña, sesión nueva autorizada y verificación de un autenticador nuevo. Las cuentas OAuth sin contraseña, sin códigos o con un fallo intermedio tienen un procedimiento de operador. Consulta [la guía de recuperación](mfa-recovery.md) y [la auditoría de seguridad](SECURITY_AUDIT_2026-10-31.md) para los controles y límites.

Las [copias cifradas](BACKUPS.md) de PostgreSQL, Storage y configuración se restauraron en volúmenes aislados con propietarios y permisos preservados. El ensayo comprobó arranque de PostgreSQL, roles, tablas sintéticas de Auth, UTF-8 y bytes de archivos; no sustituye una restauración de la API completa de Supabase. La [preparación del VPS](VPS_OPERATIONS.md) incluye Caddy, recursos limitados, usuario Node, raíz de solo lectura y volúmenes compartidos de Storage e imgproxy.

El cierre anterior pasó con 314 pruebas unitarias en 54 archivos, cuatro pruebas criptográficas de copias, `pnpm check` con 0 errores/17 avisos y lint con 0 errores/73 avisos. El análisis oficial local de Svelte revisó 40 archivos sin incidencias; 26 sugerencias I/O antiguas de juegos se revisaron y conservaron. La suite DB anterior pasó 900 aserciones en 30 archivos. La suite completa final pasó 38/38 E2E en una ejecución sobre Docker endurecido y Caddy (`output/e2e-final-docker-once.log`), 19 desktop y 19 móvil, sin reintentos ni pruebas omitidas.

La ejecución inicial de 36 E2E pasó 36/36 (`output/e2e-navigation-full-once.log`). La suite final de 38 E2E sobre Docker/Caddy pasó una vez completa. La suite diagnóstica previa encontró fallos en CSP para descargas/formularios, avatar antes de hidratación y navegación durante una mutación de Wishlist; se corrigieron antes de la ejecución final. El caso de Wishlist no se describe como un resultado rojo/verde determinista.

La revisión visual de las listas cubrió 393 y 1280 px en ambos temas, sin desbordamiento horizontal: sugerencias con cantidades/unidades, emojis y formulario de plantillas. El analizador oficial local revisó 37 componentes sin incidencias; las 26 sugerencias restantes corresponden a efectos de red y temporizadores de juegos ya revisados. El alcance por regla consta en [la revisión antislop](ANTISLOP_REVIEW_2026-10-31.md).

Quedan por configurar y probar el VPS y su TLS real, SMTP/OAuth, programación y destino externo de las copias, alertas y protección operativa. Los temporizadores son plantillas desactivadas. Excel, sincronización automática y paquetes comerciales mantienen sus hitos futuros; no se ha importado la familia real del usuario.

Actualización del 1 de noviembre: el [ensayo operativo local](LOCAL_OPERATIONS_2026-11-01.md) sí completó restauración de Auth, REST, Storage, Vault y Realtime con las 72 migraciones, sesión persistida, bytes y propietarios preservados. Pasaron seis escenarios de caída/reinicio, la función de cuenta con MFA real y 6.471 operaciones de carga sin errores. Se corrigió la extracción BusyBox de las copias y se usó Storage oficial 1.84.32 únicamente en el ensayo porque 1.33.5 no termina limpiamente. El entorno habitual permanece intacto; estos resultados no acreditan el VPS ni sustituyen sus tareas externas.

Continuación de preparación: cuota de archivos compartida por familia, mensajes Auth/MFA seguros y comprobador de configuración VPS con CI. La verificación actual suma 341 unitarias/55 archivos, 944 aserciones SQL/31 archivos y ocho pruebas de configuración; el ensayo de cuota aislado y la comprobación Linux también pasaron. Tipos: cero errores/17 avisos; lint: cero errores/64 avisos. El [plan de preparación](superpowers/plans/2026-11-01-mvp-release-prep.md) registra el cierre integrado y los límites. Para avanzar al servidor se necesitan las [entradas del despliegue](VPS_DEPLOYMENT_INPUTS.md); la familia real, SMTP, OAuth, certificados y copias externas siguen sin configurar.

La pasada final actual terminó con 40/40 E2E, 20 escritorio y 20 móvil, sin reintentos ni omisiones, en 3,7 minutos (`output/mvp-release-e2e.log`). Se usó una compilación de producción mediante preview local; la evidencia anterior de Docker/Caddy queda identificada como histórica y TLS real sigue pendiente.
