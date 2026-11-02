# Ensayo local de operaciones: 1 de noviembre de 2026

Ensayo aislado local cerrado con restauración, caídas/reinicios y carga aprobados. No acredita capacidad ni disponibilidad de un VPS real.

## Alcance y entorno

- Proyecto y etiquetas Docker propios: `myfamily.ops=20261101` y prefijo `myfamily-ops-20261101`. No se modificaron la base de datos principal ni sus variables de entorno. Se usaron 11 usuarios sintéticos: 10 en familias y una cuenta externa.
- El repositorio contiene 72 migraciones aplicables en el fixture del ensayo. Servicios observados: PostgreSQL 17.6.1.071, Auth 2.185, REST 14.3, Realtime 2.69.2 y Kong 2.8.1.
- Se generaron tres archivos cifrados de captura en frío (base de datos, Storage y configuración de base de datos) y se autenticaron.
- Las cuatro pruebas criptográficas focales pasaron. La extracción desde un archivo GNU tar hacia BusyBox tar conservó el UID 12345, GID 23456, modo `0640` y bytes. Se retiró `--same-owner`, incompatible con BusyBox; la extracción corre como usuario 0 y conserva `--numeric-owner`.

## Flujos comprobados

- Login y renovación de sesión por Auth; lectura de familias, listas y wishlist mediante REST con RLS.
- Descarga de un objeto privado de Storage de 256 KiB; SHA-256 coincidió con el original.
- Descifrado de un secreto de Vault.
- Actualización de un regalo por Realtime con autenticación, antes de la captura en frío.
- Captura de base de datos y Storage detenidos correctamente y restauración de archivos con metadatos comprobados.

**Restauración completa R3: aprobada.** Se restauraron los mismos tres archivos autenticados en volúmenes nuevos, sin intervención. La parada en frío, verificación y extracción tardaron 13 167 ms; el ciclo completo hasta el arranque de seis servicios y la comprobación de todas las API y metadatos de raíz tardó 30 926 ms. La captura ya existía; estos tiempos no incluyen crearla. Auth renovó una sesión con el refresh token persistido en la base restaurada. El ensayo confirmó 72 migraciones, 11 usuarios sintéticos (10 familias y una cuenta externa) y el objeto privado de Storage de 256 KiB, además de Auth, REST, Storage, Vault, Realtime autenticado y metadatos de raíz.

## Incidencia de parada de Storage

La imagen antigua `supabase/storage-api:v1.33.5` registraba el cierre, pero mantenía un temporizador que impedía terminar; agotó una espera de 120 segundos y salió por `SIGKILL` (código 137). El proceso de copia rechazó esa fuente, como corresponde. La imagen oficial `supabase/storage-api:v1.84.32` terminó con código 0 en la captura fría real. Solo se cambió el fixture aislado; no se alteró la CLI local existente. La guía oficial advierte que algunas migraciones de Storage solo permiten avanzar, así que este resultado no autoriza actualizar datos existentes sin plan y ensayo propios: [registro de cambios de Supabase Docker](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md).

## Aplicación, escaneo y carga

- El runtime de funciones Edge 1.74.2 arrancó en `127.0.0.1:55345`. Su sondeo GET devolvió 405, respuesta esperada; las comprobaciones funcionales se detallan abajo.
- La aplicación aislada usa límite de 768 MiB y 1 CPU, raíz de solo lectura y capacidades retiradas; Caddy tiene límite de 128 MiB. La configuración de Kong del fixture fija un worker para evitar 32 workers en el host de 32 CPU. ClamAV 1.5.4 usó la versión 28170 de la base de firmas, fechada el 31 de octubre, copiada desde el volumen público principal en modo de solo lectura; las actualizaciones quedaron desactivadas en el fixture. El contenedor tiene límite de memoria de 4 GiB, 1 CPU, `MaxThreads=1` y `MaxQueue=4`.
- Docker dispone de 32 CPU y 30,9 GiB, compartidos con otros proyectos. Se aplicaron límites individuales de CPU/memoria a los diez contenedores; no se ensayó una máquina limitada globalmente a los recursos de un VPS.
- **Caída y recuperación: aprobada.** Seis escenarios pasaron: recuperación automática de app (7 032 ms), parada ordenada de diez contenedores (24 473 ms), y recuperación tras caída abrupta de PostgreSQL (3 936 ms), Storage (3 880 ms), app (6 944 ms) y proxy (2 315 ms). Estos tiempos miden la acción hasta la comprobación funcional; no son duración exacta de indisponibilidad HTTP. En el caso automático, el contador de reinicios de app pasó de 0 a 1; se verificó identidad del proceso sin añadir capacidades. Las seis filas comprobaron datos/listas, hash de Storage, login y renovación Auth, sesión de app persistida; cero OOM.
- Una comprobación completa posterior al fallo también pasó: Auth, REST, Storage, Vault y actualización única autenticada de Realtime. El helper de reinicio maneja healthchecks ausentes explícitamente; siete pruebas simuladas cubren guardas de fallo de arranque/comprobación.
- **Prueba funcional del runtime de funciones: aprobada.** El handler del repositorio rechazó sin autenticar (401) y un JWT falso (401), respondió 405 a GET, denegó con AAL1 (403) y aceptó con TOTP real AAL2 (200) una operación administrativa de borrado de una cuenta sintética descartable, verificada después. Se eliminó esa cuenta. El runtime Edge 1.74.2 se probó en loopback puerto 55345; no se probó una ruta por Kong. El código desplegado procede del repositorio y no forma parte de la copia de base de datos.
- **Carga local: aprobada, sin errores.** El arnés midió 12 fases de 20 segundos, incluida una de reposo, y excluyó 11 calentamientos de 2 segundos. Las pausas fueron de 100 ms y el timeout por solicitud de 5 segundos. Hubo 6 471 operaciones medidas: 5 979 HTTP (lecturas, RPC de escritura y SSR autenticado) y 492 análisis ClamAV `INSTREAM`. Los diez inicios de sesión iniciales se midieron aparte. Fixture pequeño: 10 familias, cada una con una lista, un elemento y un regalo, más una cuenta externa. No incluyó renderizado de navegador, WAN ni carga concurrente de Realtime. Las peticiones de escaneo enviaron PDF de 77 B, PNG de 67 B, 1 MiB y 8 MiB; las fases de 1 y 2 escaneos concurrentes usaron `INSTREAM` directo, no subidas HTTP.

| Fase medida | Operaciones/s | p95 |
|---|---:|---:|
| Lecturas, 10 usuarios | 80,50 | 20,57 ms |
| Escrituras, 10 usuarios | 79,97 | 26,15 ms |
| SSR autenticado, 10 usuarios | 17,68 | 599,09 ms |
| ClamAV, 1 escaneo concurrente | 8,15 | 49,93 ms |
| ClamAV, 2 escaneos concurrentes | 16,45 | 49,47 ms |

Pico conjunto observado: **2 024,20 MiB de working set**, frente a 1 700,21 MiB en reposo. El pico agregado de CPU fue 205,46%, aproximadamente 2,05 núcleos. Son máximos muestreados de los contenedores declarados; excluyen el sistema operativo, Docker y otros proyectos.

| Servicio | Máximo de memoria observado |
|---|---:|
| PostgreSQL | 182,60 MiB |
| Auth | 25,28 MiB |
| REST | 253,30 MiB |
| Storage | 88,16 MiB |
| Realtime | 172,10 MiB |
| Kong | 182,90 MiB |
| ClamAV | 956,10 MiB |
| Funciones | 53,46 MiB |
| Aplicación | 116,30 MiB |
| Proxy | 19,29 MiB |

Los máximos individuales no coinciden necesariamente en el tiempo. PostgreSQL alcanzó 104,77% CPU en el muestreo y ClamAV 32,24%. REST quedó cerca de su límite de 256 MiB; conviene reservarle más margen. Kong usó un worker y límite de 256 MiB; con 32 workers había consumido 2,737 GiB en reposo. El consumo observado de ClamAV no demuestra que se pueda reducir su límite de 4 GiB: no se ensayaron recargas de firmas ni archivos complejos. Al terminar no hubo OOM ni reinicios inesperados; Realtime conservó un reinicio anterior de la prueba de fallos.

Como punto de partida para planificar un VPS Supabase self-hosted con antivirus, proponer 4 vCPU y 8 GiB de RAM y elevar REST a 512 MiB. Son márgenes iniciales propuestos, no capacidades certificadas ni límites medidos: la carga usó un fixture pequeño y un host compartido, sin navegador ni tráfico WAN.

## Resultados y alcance pendiente

| Prueba | Estado | Evidencia que falta |
|---|---|---|
| Restauración Supabase R3 | Aprobada | 13 167 ms parada/verificación/extracción; 30 926 ms total hasta seis servicios, API y metadatos de raíz |
| Prueba funcional del runtime de funciones | Aprobada | Sin sesión 401, JWT falso 401, GET 405, AAL1 403, TOTP AAL2 200; cuenta sintética eliminada |
| Caída y recuperación | Aprobada | Seis escenarios, comprobaciones funcionales completas y cero OOM; detalle y tiempos en Aplicación, escaneo y carga |
| Carga local | Aprobada | 12 fases medidas, 6 471 operaciones, cero errores; métricas y límites indicados arriba |
| VPS real y copia externa | No ejecutados | Inventario del host destino, despliegue y verificación de transferencia/restauración |

Limpieza aprobada: retirados únicamente los 10 contenedores, 12 volúmenes, 4 redes y 17 archivos con secretos sintéticos del ensayo. Los servicios habituales de Supabase siguen activos y se conservó el volumen original de firmas. No se utilizó limpieza global de Docker.

Evidencias locales, excluidas de Git: `output/supabase-recovery-ops20261101/result.json`, `output/ops-local-restart-result.json`, `output/ops-functions-result.json`, `output/ops-local-load-result.json` y `output/ops-local-cleanup-result.json`. Pasaron además 4 pruebas criptográficas, 11 del ciclo de copias en Linux y 7 guardas de recuperación/arranque con comandos simulados; formato y ESLint focales terminaron sin errores. No se repitieron los E2E de interfaz al no cambiar su código.
