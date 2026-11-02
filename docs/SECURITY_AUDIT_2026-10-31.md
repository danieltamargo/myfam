# Auditoría de seguridad: 31 de octubre de 2026

Revisión del repositorio con correcciones locales, pruebas focales y recorridos de integración locales. No equivale a un pentest de producción ni a una certificación OWASP. No se han expuesto credenciales ni ejecutado ataques, cambios remotos o pruebas de carga. El borrado de cuenta se ha probado con usuarios sintéticos locales.

## Resultado

La aplicación tenía una barrera MFA situada en el layout, que no protegía por sí sola las acciones POST ni los endpoints. Se ha añadido al hook de servidor para ejecutarla antes de resolver cualquier petición del grupo `(protected)`, conservando también la comprobación del layout existente. La autorización familiar, las ACL de dominio y RLS siguen siendo necesarias.

El acceso directo a Supabase y la protección contra abuso necesitan trabajo adicional antes de vender el servicio: la aplicación no aporta una cuota distribuida, un servicio de entitlements comerciales ni evidencia de protección DDoS en el despliegue real. El [informe de wishlist](WISHLIST_MVP_AUDIT_2026-10-31.md) documenta también el cierre de la filtración por inferencia de reservas al modificar la cantidad deseada.

## Hallazgos y correcciones

Se identificó y corrigió además un problema de disponibilidad en la frontera RPC: las comprobaciones de versión y otros conflictos de negocio emitían `40001`, reservado para fallos transitorios de serialización. En PostgREST 14 esto puede provocar reintentos indefinidos. La migración `20261031200000_optimistic_conflict_http_409.sql` cambia únicamente los raises intencionales de 19 firmas explícitas del repositorio a `PT409`. No modifica errores de serialización reales ni recorre funciones de extensiones. Los clientes aceptan ambos códigos durante la transición. La [nota oficial de Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions) describe el problema y aclara que las peticiones ya atrapadas deben detenerse selectivamente por separado.

Después de aplicar la corrección, una petición HTTP real de conflicto determinista respondió `409`/`PT409` en 24 ms con cancelación máxima de cuatro segundos; no creó datos de prueba. El caso pgTAP de lease no disponible pasó con rollback y 18 pruebas unitarias verificaron la traducción HTTP 409 con ambos códigos. La consulta de catálogo local no encontró raises intencionales `errcode = '40001'` restantes. Esta evidencia demuestra una respuesta acotada de la petición probada, no una medición global de CPU ni resistencia DDoS.

También se reprodujeron y corrigieron filtraciones de eventos, notas, documentos, hábitos y listas privados a través de `audit_logs`: un propietario o administrador ajeno a la audiencia podía conocer UUID y metadatos, incluidos títulos de elementos de listas borrados. Las migraciones `20261031231000_calendar_audit_privacy.sql` y `20261031233000_audit_resource_privacy.sql` añaden políticas SELECT restrictivas para acciones y recursos explícitos. Mantienen la política familiar de roles existente y exigen ser actor o poder consultar actualmente el recurso. Los recursos borrados quedan accesibles solo al actor sujeto a esa política base, salvo el registro de borrado de eventos cuya visibilidad familiar se conserva explícitamente. Los históricos sin audiencia comprobable no se amplían ni se completan con datos inventados. Revocar la membresía familiar elimina también el acceso del actor a su historial.

| Prioridad | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- |
| Alta | MFA en layout no es una barrera previa a acciones y endpoints | Antes: `src/routes/(protected)/+layout.server.ts`; ahora: `src/lib/server/auth/protected.ts` y `src/hooks.server.ts` | Corregido para peticiones de la aplicación; 12 pruebas de guardia |
| Alta | MFA de la aplicación no cubría acceso directo a Supabase | `20261031235500_direct_supabase_mfa.sql`: políticas restrictivas en tablas de dominio y Storage; guardias en RPC y helpers privilegiados | Corregido en DB local; `095_direct_mfa.test.sql` aporta 68 aserciones aprobadas; integración focal Auth/MFA 4/4 aprobada en escritorio y móvil |
| Alta | Inferencia de reservas ocultas a través del límite de cantidad | El trigger consultaba coordinación oculta al bajar `desired_quantity` | Corregido con `20261031012000_wishlist_quantity_privacy.sql`; reducción uniforme sin consultar reservas ni compras; regresión `013_wishlist_quantity_privacy.test.sql` aprobada |
| Alta antes de comercializar | No existe concesión comercial efectiva de módulos | `NO_BILLING_ENTITLEMENT_PROVIDER.isEntitled` devuelve siempre `true` | Comportamiento explícito actual; pendiente proveedor comercial y enforcement también en acceso directo a datos |
| Alta operativa | No se acredita protección distribuida contra abuso/DDoS | Límites locales de escrituras por IP y cuenta verificada; login/registro llaman directamente a Supabase | Mitigación local aplicada; pendientes cuotas acumuladas por familia y controles de las APIs directas y del perímetro |
| Alta | Dependencias con avisos de seguridad | `pnpm audit` inicial: 5 críticos, 46 altos, 46 moderados y 11 bajos | Actualizaciones compatibles eliminan críticos y altos; quedan 4 moderados y 4 bajos; no equivale a una auditoría limpia |
| Media | Borrado de cuenta aceptaba cualquier método distinto de OPTIONS | `supabase/functions/delete-account/index.ts` | Corregido: solo POST ejecuta la operación; otros métodos devuelven 405 |
| Media | Borrado de cuenta continuaba si fallaba la consulta de propietarios | La consulta interior ignoraba el error | Corregido: error/null devuelve 500 antes del borrado |
| Media | Faltaban cabeceras de seguridad en código de la aplicación | Revisión inicial de hooks y configuración | Añadidos `nosniff`, política de referrer, `X-Frame-Options: DENY`, Permissions-Policy y CSP con scripts nonce, `object-src 'none'` y `frame-ancestors 'none'`; verificados por HTTP y navegador local. TLS/HSTS reales dependen del despliegue |
| Media | Validación de imágenes wishlist basada en MIME declarado | Se añade comprobación de firma y análisis ClamAV de los bytes antes de subir | Mitigado; no equivale a decodificar o reconstruir imágenes, y faltan cuotas acumuladas |
| Media | Faltaba análisis antimalware de archivos | ClamAV en servidor para imágenes, recibos y documentos; RLS bloquea INSERT/UPDATE directos en los tres buckets | Corregido localmente y probado con EICAR sintético; configuración y disponibilidad remotas sin verificar; cuotas acumuladas pendientes |
| Media | Recuperación de MFA sin procedimiento terminado | `docs/mfa-recovery.md`, códigos y barrera de sesión | Corregida y verificada localmente; casos sin recuperación automática requieren operador |

Los cambios de la Edge Function requieren desplegarse expresamente para afectar al servicio remoto. No se ha desplegado nada. La comprobación de propietarios continúa siendo una secuencia de consultas y borrado, por lo que no garantiza exclusión frente a cambios concurrentes de propiedad.

El recorrido local `productclosure` verificó que `delete-account` devuelve 200 con un usuario sintético AAL2, 401 sin autenticación o con token falso, 403 con AAL1 y 405 ante GET. El handler verifica el usuario mediante `getUser` y exige AAL2; desactivar la comprobación JWT heredada del gateway local no sustituye esas verificaciones. Para el cliente administrativo admite la clave del diccionario estándar `SUPABASE_SECRET_KEYS` bajo `default`, además de las alternativas de configuración compatibles; no expone las claves al navegador. Esto resolvió la incompatibilidad local entre Auth con firma ES256 y la clave administrativa JWT heredada HS256.

## Autenticación, registro y sesión

`safeGetSession()` obtiene sesión y valida el usuario mediante `auth.getUser()`. El callback usa intercambio PKCE y `safeInternalPath()` limita el destino de retorno. Las pruebas existentes cubren destinos internos, externos y variantes codificadas. No se han validado proveedores OAuth remotos, rotación de claves, duración de sesiones, revocación ni configuración SMTP.

Registro, login y challenge MFA se ejecutan contra Supabase desde el navegador. La configuración versionada de Auth exige un mínimo de 12 caracteres, y los formularios de registro y restablecimiento usan el mismo mínimo. La confirmación de email está activada. Se debe comprobar en el proyecto real la política de contraseñas, confirmación de email, protección frente a contraseñas filtradas, límites de Auth y CAPTCHA. Los errores del proveedor se muestran directamente en varias pantallas; revisar mensajes y respuestas para evitar enumeración y detalles internos.

En concreto, `login`, `register` y `forgot-password` no tienen acciones de servidor: sus formularios llaman a GoTrue mediante el SDK. Añadir una cuota POST a esas páginas no limitaría los intentos de autenticación reales. `supabase/config.toml` declara `auth.rate_limit`: `email_sent = 20`, `token_refresh = 60`, `sign_in_sign_ups = 30` y `token_verifications = 30`. También fija `max_frequency = "1m"` para emails. El entorno efectivo local confirma mínimo 12, autoconfirm desactivado, frecuencia SMTP de un minuto, refresh 60, OTP 30 y verificación 30. Sin SMTP personalizado, la CLI local sustituye `email_sent = 20` por 360000: es un comportamiento de desarrollo, no una cuota de producción. Los valores remotos siguen sin verificar. La [documentación actual de Auth](https://supabase.com/docs/guides/auth/rate-limits) describe límites por IP en `/auth/v1/token`, incluidos los grants de contraseña, refresh, ID token y PKCE, y límites distintos para registro, recuperación y MFA. Son controles del servicio Auth; no se han medido ni confirmado sus valores efectivos remotos. Quedan pendientes CAPTCHA, límites por identidad y configuración del perímetro que cubra la URL pública de Auth, además de las rutas de la aplicación.

MFA sigue siendo opcional. Una sesión AAL1 sin factor verificado puede acceder a funciones generales. Una sesión AAL1 elevable a AAL2 se bloquea en el hook de la aplicación; AAL2 permite continuar. Transferir propiedad, borrar familia y borrar cuenta mantienen comprobaciones AAL2 propias. No se ha añadido una política de frescura temporal del segundo factor.

La migración `20261031235500_direct_supabase_mfa.sql` exige AAL2 si el usuario tiene algún factor verificado, también al consultar REST, Storage y RPC directamente. Sin factor verificado se conserva el acceso general AAL1; los tokens sin claim `aal` se tratan como AAL1. Las políticas restrictivas y las guardias de funciones privilegiadas conservan roles y ACL existentes. La administración y `service_role` mantienen su bypass previsto; sus claves siguen siendo privadas. La regresión `supabase/tests/database/095_direct_mfa.test.sql` pasó 68 aserciones; la suite DB coordinada pasó 856 en 28 archivos también después del reinicio del stack.

Los eventos DELETE de Postgres Changes en Realtime no aplican RLS; esta política no debe presentarse como protección de esos eventos. Las URLs de Storage firmadas previamente siguen siendo válidas hasta su caducidad. La comprobación focal Auth/MFA pasó 4/4 en escritorio y móvil. La evidencia actual de recuperación y contenedores figura en el cierre al final.

## Autorización y módulos

`requireFamilyRole()` comprueba usuario y membresía; las acciones administrativas de miembros consultan el rol y las operaciones críticas usan RPC. La pertenencia comprobada en un layout no debe considerarse suficiente para autorizar una mutación: cada RPC/política debe repetir la frontera adecuada.

`requireModuleAvailable()` y `guardModuleActions()` rechazan módulos apagados según catálogo/preferencia familiar para rutas y acciones que los usan. Los juegos figuran como `available` y admiten desactivación familiar. Los módulos `core` no dependen de preferencias ni de entitlements comerciales. Estas decisiones actuales no constituyen una suscripción o una licencia comercial. Antes de incorporar cobros debe definirse qué datos puede leer un cliente sin licencia y aplicar la misma decisión en REST, RPC, Storage y Realtime, sin confiar en ocultar navegación.

La evidencia y las limitaciones de RLS de wishlist constan en el [informe específico](WISHLIST_MVP_AUDIT_2026-10-31.md). La existencia de archivos pgTAP no demuestra que las políticas estén aplicadas al proyecto remoto ni que hayan pasado en esta sesión.

## Archivos y datos privados

Documentos valida nombre, tamaño máximo de 15 MB, MIME permitido y firmas iniciales de contenido. Los formatos Office se reconocen por cabecera ZIP; no se verifica aquí la estructura completa del documento. La descarga genera una URL firmada de 120 segundos con nombre de descarga. Una URL firmada ya emitida debe tratarse como una credencial temporal; retirar una ACL no demuestra su revocación inmediata.

Wishlist limita imágenes a 5 MB, genera rutas con UUID y comprueba que la ruta anterior pertenece a la familia y propietario esperados antes de sustituirla. El flujo compartido comprueba formato, analiza con ClamAV y sube el mismo buffer con un cliente privilegiado de servidor, sin sobrescritura. Valida identidad y ACL del recurso antes y después del análisis. La migración `20261031230000_antivirus_upload_boundary.sql` impide escrituras directas de clientes autenticados en los buckets de imágenes, recibos y documentos mediante políticas restrictivas, incluso ante otra política permisiva. El análisis falla ante errores, respuestas incompletas o límites excedidos; no demuestra que todo archivo aceptado sea inocuo. Un límite por archivo tampoco limita el consumo acumulado por cuenta o familia.

`src/lib/supabase-admin.ts` contiene un cliente privilegiado sin usos encontrados en las rutas auditadas. Su clave se obtiene de variables privadas; antes de reutilizarlo conviene situarlo en `$lib/server` para que SvelteKit impida importaciones cliente por construcción. No se ha inspeccionado ningún valor de variables de entorno.

## Protección contra abuso y DDoS

Un limitador en memoria de una instancia no ofrece protección distribuida ni cubre Auth, REST, Realtime y Storage expuestos por Supabase. La [documentación de Supabase](https://supabase.com/docs/guides/auth/rate-limits) describe límites propios de Auth; hay que revisar los valores efectivos del proyecto.

Se ha añadido `src/lib/server/security/rate-limit.ts` al hook antes de inicializar Supabase. Admite hasta 120 peticiones de escritura por dirección y ventana fija de 60 segundos por proceso; GET, HEAD y OPTIONS quedan excluidos. Un exceso devuelve 429, `Retry-After` y `Cache-Control: no-store`, sin resolver la acción. El mapa mantiene como máximo 10.000 direcciones y, al llegar a esa capacidad, rechaza direcciones nuevas hasta el siguiente reinicio de ventana sin expulsar las cuotas existentes.

Se conserva el límite de 120/min por IP y se añade uno de 60/min por identidad verificada. La resolución local `safeGetSession` memoiza una única llamada a `getUser(token)`; el usuario de confianza se reemplaza con esa identidad verificada. CSP usa nonce para scripts de Kit, sin `unsafe-inline`/`unsafe-eval` en scripts; `style-src 'unsafe-inline'` se mantiene intencionalmente y las imágenes remotas usan HTTPS. Se eliminó el renderizado dinámico de HTML en los toasts. El ciclo de backup conserva los IDs exactos de contenedores en ejecución, detiene en orden inverso y arranca en orden directo, con health checks y timeouts acotados; evidencia: `output/backup-cycle-linux.log` (11/11 pruebas mock Linux) y ejecución del helper real en Docker, código 0. Las pruebas criptográficas de backup pasaron 4/4.

El limitador usa `event.getClientAddress()` y no interpreta por su cuenta cabeceras reenviadas. En Node sin `ADDRESS_HEADER`, la dirección corresponde al socket. Detrás de un proxy IPv4, todas las personas pueden compartir la dirección del proxy y, con ella, una única cuota. Para identificar al cliente real, debe configurarse `ADDRESS_HEADER` únicamente cuando el proxy confiable sobrescriba la cabecera y el origen esté inaccesible directamente. Si se elige `x-forwarded-for`, también se debe fijar `XFF_DEPTH` al número exacto de saltos confiables; no se debe aceptar una dirección que el cliente pueda inventar. La configuración y sus pruebas deben hacerse conjuntamente con el proxy elegido.

Las direcciones IPv6 se tratan como claves completas, sin agregación por subred. La rotación de direcciones puede eludir una cuota por IP. La ventana fija admite ráfagas alrededor de su frontera, una IP compartida puede bloquear a usuarios legítimos y el contador se reinicia al reiniciar el proceso. La aplicación añade una cuota local de 60 escrituras por minuto por identidad verificada, pero no cubre llamadas directas a Auth, REST, RPC, Realtime o Storage en Supabase, ni cuotas por familia ni protección distribuida.

Para el despliegue real se necesitan controles verificables:

1. TLS y protección del origen: CDN/WAF o proxy con límites de peticiones, conexiones, tiempo de lectura y tamaño de cuerpo, sin permitir saltarse el perímetro mediante la dirección directa del servidor.
2. Auth: límites del proveedor, CAPTCHA compatible, confirmación de email, alertas por abuso y política de recuperación probada. Proteger también las llamadas directas a Supabase.
3. Mutaciones y archivos: cuotas compartidas por cuenta/familia, límites de concurrencia, límites acumulados de almacenamiento y controles en la propia frontera que acepta datos.
4. Coste y observación: alertas de errores, latencia, conexiones, almacenamiento, egress y gasto; un procedimiento de contención y restauración ensayado.
5. Validación: pruebas autorizadas de límites que comprueben 429 y recuperación, con tráfico entre varias instancias y sin provocar una denegación real a usuarios.

No se han elegido umbrales comerciales sin datos de uso ni se ha afirmado una capacidad de resistencia volumétrica.

## Cobertura orientativa OWASP

| Área | Evidencia local / limitación |
| --- | --- |
| Control de acceso | Roles familiares, ACL/RLS y guardias de módulos; inferencia wishlist e historial privado corregidos; MFA directa aplicada en DB local; integración focal Auth/MFA 4/4 aprobada |
| Autenticación | PKCE, validación de usuario, TOTP y recuperación por contraseña/código verificada localmente; configuración remota pendiente |
| Inyección/XSS | Esquemas de entrada y consultas Supabase en archivos revisados; no se ejecutó una batería completa de payloads ni se auditó toda salida HTML |
| Configuración | CSP con nonces de script, `form-action 'self'` y origen Supabase validado para descargas firmadas; HTTP local verificado. TLS, exposición del origen y límites del perímetro requieren validación real |
| Diseño | Sin cuotas comerciales ni política final de entitlements; no se atribuyen garantías SaaS completas |
| Componentes y cadena de suministro | Tras actualizar framework, herramientas y resoluciones transitivas: 4 avisos bajos, 4 moderados, 0 altos y 0 críticos, frente a 11/46/46/5 iniciales. El filtro de producción inicial devolvió cero, pero SvelteKit/Svelte/Vite generan código de ejecución aunque figuren como dependencias de desarrollo; ese filtro no acredita un bundle seguro. Persisten los avisos detallados abajo, incluidos dos bajos de Kit 2 cuyo parche exige Kit 3 |
| Integridad y secretos | Ninguna credencial expuesta o añadida al código; cliente privilegiado y despliegue de Edge requieren vigilancia específica |
| Registro y alertas | Hay errores en consola y auditoría de documentos; no se verificó centralización, retención, redacción ni alertas en producción |
| Disponibilidad y manejo de errores | Fallo de AAL bloquea la petición; errores de propiedad ya no permiten continuar con el borrado; restauración aislada ensayada; sin prueba de carga ni recuperación del servicio completo |

## Verificación histórica del hito previo

- `npm run test:unit -- src/lib/server/auth/protected.test.ts src/lib/server/auth/mfa.test.ts src/routes/auth/callback/callback.test.ts 'src/routes/(protected)/layout.server.test.ts'`: 25 pruebas aprobadas en cuatro archivos. Incluye bloqueo de POST y endpoint antes de `resolve`, sesión ausente, AAL1 sin factor, AAL2, fallo del servicio y rutas públicas, además de conservar la barrera del layout.
- `npx prettier --check src/hooks.server.ts src/lib/server/auth/protected.ts src/lib/server/auth/protected.test.ts supabase/functions/delete-account/index.ts`: formato aprobado.
- `pnpm test:unit` después de actualizar dependencias: 151 pruebas aprobadas en 30 archivos; Vitest 4.1.12.
- `pnpm build` después de actualizar dependencias: código 0 y salida completada con adapter-node. Persisten avisos de accesibilidad/estado en componentes existentes y un aviso de CSS; no se han cambiado componentes ajenos a esta revisión.
- `pnpm audit --json`: la primera actualización redujo 108 avisos a 52. Antes del último refresco, el informe actualizado registró 55 (32 altos, 18 moderados y 5 bajos); después registra 8 (4 moderados, 4 bajos, ningún alto ni crítico), conservados en `output/pnpm-audit-final.json`. El resultado no es una auditoría limpia.
- Revisión independiente de hardening: `pnpm test:unit src/lib/server/security/rate-limit.test.ts src/lib/server/security/headers.test.ts src/lib/server/auth/protected.test.ts 'src/routes/(protected)/layout.server.test.ts'`: 23 pruebas aprobadas en cuatro archivos, incluidas las seis del limitador y cuatro de cabeceras.
- La comprobación HTTP coordinada sobre el build Node obtuvo `/` 200, `/login` 200 y ruta inexistente 404 con las cuatro cabeceras y CSP `frame-ancestors 'none'`. No acredita la configuración HTTPS del VPS.
- `deno check --no-lock supabase/functions/delete-account/index.ts`: no completó por resolución de dependencia npm transitiva de JSR. La ejecución posterior de integración local `productclosure` sí verificó la Edge Function: borrado de usuario sintético AAL2 con 200 y casos negativos 401/403/405 descritos arriba. No acredita el despliegue remoto.
- Validación coordinada por root del conjunto actual: 272 pruebas unitarias en 47 archivos y 856 comprobaciones SQL en 28 archivos aprobadas. La prueba con ClamAV real y EICAR sintético también pasó. No se ejecutaron archivos maliciosos reales.
- Regresiones focales de privacidad: calendario 030–033, 123 comprobaciones SQL aprobadas; recursos privados 034 y regresiones 040/050/055/060, 206 comprobaciones aprobadas. Se probaron audiencia, actor, roles, recursos borrados y revocación, con rollback de fixtures.
- La revisión independiente del antivirus aprobó 20 pruebas unitarias y 10 SQL de bloqueo de escrituras directas; señaló un plazo de escritura en Storage pendiente en ese momento. El autor añadió después la cancelación de esa operación y su prueba de recuperación. La validación final de tipos y build del conjunto se reserva a la entrega principal; no se deduce de esas pruebas focales.
- Las primeras ejecuciones de Vitest no llegaron a ejecutar pruebas por dependencia concurrente ausente y permisos sobre temporales. La ejecución final indicada arriba terminó con código 0.

La comprobación integrada actual de tipos, build y recorridos se registra al final. Los resultados anteriores distinguen verificaciones locales, evidencia coordinada y límites del despliegue remoto.

## Actualización focal de dependencias

Se han actualizado dentro de los rangos mayores existentes SvelteKit 2.49.2 → 2.70.3, Svelte 5.46.0 → 5.57.3, Vite 7.3.0 → 7.3.7, Vitest y sus adaptadores 4.0.16 → 4.1.12, Storybook y addons principales 10.1.10 → 10.6.5, el addon Svelte CSF 5.0.10 → 5.1.6 y plugins Svelte/Storybook compatibles. Se ha actualizado el lockfile pnpm y los mínimos declarados, sin saltos de versión mayor, `force` ni overrides de transitivas.

La primera resolución eliminó los críticos de Vitest Browser y Storybook y los altos de SvelteKit/devalue. El refresco final mantuvo los rangos de los proveedores y actualizó Rollup a 4.67.2, PostCSS a 8.5.32, nanoid a 3.3.20, picomatch a 4.0.7, source-map-js a 1.2.2, minimatch a 3.1.5/9.0.9, brace-expansion a 1.1.21/2.1.7, flatted a 3.4.4 y js-yaml a 4.3.2. También actualizó ajv, yaml, uuid, postcss-selector-parser 7 y `@humanfs/node` dentro de sus rangos. No se añadieron overrides ni dependencias directas.

Paraglide pasó de 2.7.0 a 2.29.3, dentro de su versión mayor y del rango declarado. El proveedor actualizado incorpora SDK 4.1.0 y Kysely 0.28.18, eliminando los tres avisos altos que el SDK anterior no podía resolver dentro de su rango. Las [notas oficiales de Paraglide](https://paraglidejs.com/changelog) mantienen la compatibilidad del proyecto y sus plugins, salvo usos directos del SDK que no se encontraron aquí. Los mensajes y `project.inlang/settings.json` permanecieron idénticos. La comprobación posterior a Paraglide terminó con cero errores y 27 avisos; las validaciones finales posteriores a todos los parches corresponden a la entrega principal.

Quedan cuatro avisos moderados: tres resoluciones de minimatch 3/9/10 cuyo parche exige 11, y postcss-selector-parser 6.0.10, fijado exactamente por `@tailwindcss/typography` 0.5.19. Se comprobó que el proveedor publicado 0.5.20 conserva ese mismo pin, de modo que actualizarlo no corrige el aviso. Los cuatro bajos corresponden a cookie 0.6.0 bajo el rango `^0.6.0` de Kit, dos avisos propios de Kit 2 y deepmerge 4.3.1 sin parche publicado en el aviso. No se han forzado versiones fuera del contrato de esos proveedores.

Dos avisos bajos de SvelteKit 2.70.3 indican parche a partir de Kit 3 y `deepmerge@4.3.1` figura sin parche disponible en el aviso consultado. No se ha impuesto una migración mayor dentro de esta revisión.

## Recuperación y operación: cierre actual

La recuperación MFA para cuentas con contraseña está implementada: genera ocho códigos de 128 bits únicamente con AAL2, conserva hashes SHA-256 y exige contraseña actual, código y una nueva contraseña distinta para recuperar. El lote es de un solo uso; dos consumos concurrentes aceptan exactamente uno. La barrera de sesión invalida el acceso anterior y obliga a configurar un TOTP nuevo. OAuth exclusivo, ausencia de códigos y fallo tras consumirlos requieren el procedimiento de operador de [mfa-recovery.md](mfa-recovery.md).

Las herramientas `scripts/backup.mjs`, `scripts/backup-cycle.sh` y las plantillas systemd preparan copias en frío de volúmenes Docker PostgreSQL y Storage, más `database-config` con las claves pgsodium cuando existe ese montaje. AES-256-GCM cifra cada archivo y HMAC autentica el manifiesto. La restauración crea destinos aislados y conserva UID/GID y permisos de raíz y de todos los archivos mediante propietarios numéricos. El ensayo real PostgreSQL pasó arranque, roles, mockAuth, UTF-8 y hash/tamaño de Storage (`output/backup-drill-da01740a/result-v3.json`). La tercera fuente pasó comparación de bytes, modo 0600 y rechazo de configuración ausente (`output/backup-config-drill-d69040ff/result.json`). No demuestra una API Supabase completa ni recuperación de Vault con datos reales.

`compose.vps.yaml` y Caddy están preparados y validados sin emitir certificados. La aplicación corre como Node, saludable, con raíz de solo lectura, capacidades eliminadas, 768 MiB, una CPU y tmpfs de 64 MiB. El override de volúmenes para una instalación Supabase nueva hace que Storage e imgproxy compartan volumen; no debe aplicarse sobre una instalación con datos. Consultar [BACKUPS.md](BACKUPS.md) y [VPS_OPERATIONS.md](VPS_OPERATIONS.md). No se ha desplegado un VPS, activado temporizadores, configurado copia externa ni validado SMTP/OAuth con cuentas reales.

## Verificación integrada actual

El cierre anterior pasó 314 pruebas unitarias en 54 archivos, `pnpm check` con 0 errores/17 avisos y lint con 0 errores/73 avisos. El análisis oficial local de Svelte revisó 40 archivos sin incidencias; 26 sugerencias I/O antiguas de juegos se revisaron y conservaron. El ciclo backup mock Linux pasó 11/11 (`output/backup-cycle-linux.log`), el helper Docker real terminó con código 0 y las pruebas criptográficas pasaron 4/4. La suite final completa pasó 38/38 E2E en una ejecución sobre Docker endurecido y Caddy, 19 desktop y 19 móvil, sin reintentos ni pruebas omitidas (`output/e2e-final-docker-once.log`). La suite DB previa de 900 aserciones es evidencia histórica, no resultado de esta fase.

La ejecución inicial de E2E pasó 36/36 (`output/e2e-navigation-full-once.log`). La suite diagnóstica posterior descubrió problemas en CSP para formularios/descargas, avatar antes de hidratación y navegación de Wishlist durante una mutación en curso. Tras corregirlos, la suite final pasó 38/38 en una ejecución (`output/e2e-final-docker-once.log`). No se presenta la carrera de Wishlist como un fallo rojo/verde determinista. Estos recorridos usaron Caddy con HTTP local y no acreditan TLS real.

La regresión de recuperación se amplió y pasó 2/2 sobre esa misma imagen: después de completar el nuevo TOTP, el JWT AAL2 anterior recibió 403 tanto al intentar cambiar la contraseña como al registrar un factor directamente en Auth (`output/e2e-recovery-auth-revocation.log`).

La revisión manual de listas cubrió 393 y 1280 px en claro y oscuro, sin desbordamiento, y comprobó autorrelleno de cantidad/unidad y formulario de plantilla (`output/lists-visual-report.json`). El analizador oficial de Svelte revisó 37 archivos sin incidencias; las 26 heurísticas I/O heredadas de juegos se revisaron y conservaron.

Las verificaciones anteriores documentan el hito previo. Persisten la protección distribuida contra abuso/DDoS, la revisión completa de PII/secretos, la observabilidad y los controles remotos. Vector local reinicia porque su fuente Docker no conecta con el host; no se ha habilitado el socket Docker por TCP sin TLS para resolverlo.

La migración `20261031235900_list_type_authorization.sql` autoriza antes de bloquear una lista y devuelve la misma respuesta para UUID inexistentes o inaccesibles. Las tres comprobaciones nuevas cierran la inferencia de existencia en el cambio de tipo; la suite DB final pasó 900/30 (`output/db-recovery-lists-final.log`).

## Preparación adicional del 1 de noviembre

- Cuota combinada de archivos de 1 GiB por familia, con ajuste privado y control transaccional de concurrencia. Pruebas en Storage 1.84.32 aislado: tres buckets, borrado y dos escrituras simultáneas; 44 aserciones SQL focales. La migración se aplicó después mediante `supabase migration up --local`, sin reset. La suite habitual pasó 944 aserciones en 31 archivos (`output/mvp-release-db.log`). No se añade un índice sobre tablas gestionadas por Supabase: la migración usa los permisos estándar de `postgres` y los índices existentes.
- Mensajes de registro/recuperación genéricos; login, contraseña y MFA ya no muestran mensajes internos del proveedor. Se mantiene información útil por códigos permitidos. Esta mitigación visual no cambia las respuestas de la API directa de GoTrue ni sustituye sus límites de producción.
- Comprobador local `pnpm check:vps`, con ocho pruebas sintéticas y ejecución en CI. Revisa formato de configuración, permisos y coherencia de URLs sin mostrar valores privados. No prueba credenciales, puertos, DNS, certificados ni correo.
- Validación integrada: 341 unitarias/55 archivos; tipos con cero errores y 17 avisos. La documentación de entradas externas está en [VPS_DEPLOYMENT_INPUTS.md](VPS_DEPLOYMENT_INPUTS.md). La protección contra abuso, servicios externos y despliegue real mantienen sus tareas pendientes.
- E2E actual: 40/40 en una única pasada de producción sin reintentos ni omisiones (20 escritorio/20 móvil, 3,7 minutos), incluida privacidad de errores con respuestas de proveedor interceptadas y MFA real (`output/mvp-release-e2e.log`). Preview local no acredita TLS, SMTP ni OAuth externos.

## Fuentes

- [Hooks de SvelteKit](https://svelte.dev/docs/kit/hooks): frontera de petición antes de `resolve`.
- [Implicaciones de load para autenticación](https://svelte.dev/docs/kit/load#Implications-for-authentication): la estructura de layouts no sustituye controles en la frontera adecuada.
- [MFA en Supabase](https://supabase.com/docs/guides/auth/auth-mfa): niveles de autenticación y enforcement.
- [Límites de Auth](https://supabase.com/docs/guides/auth/rate-limits): controles del servicio de autenticación.
