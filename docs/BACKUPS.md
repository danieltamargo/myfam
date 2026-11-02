# Copias y recuperación

Para el primer despliegue, el propietario ha elegido copias **dentro del mismo VPS**. La vía guiada de [GUIDED_DEPLOYMENT.md](GUIDED_DEPLOYMENT.md) prepara estas copias; el destino externo se pospone. Los apartados sobre transferencia externa describen una ampliación posterior, no un requisito previo de esta instalación. Las copias locales no cubren pérdida del VPS o del disco.

Además de los dos volúmenes de datos, el formato admite una tercera fuente explícita `database-config` para configuración y claves PostgreSQL persistidas en un volumen separado. Esa tercera fuente es necesaria para el Supabase self-hosted descrito aquí.

El comando `scripts/backup.mjs` copia en frío dos volúmenes Docker: el clúster PostgreSQL completo (datos de aplicación, Auth, roles y metadatos Storage) y los archivos de Storage. Necesita Node 24 y Docker. No lee `.env`, no ejecuta SQL y no detiene ni arranca servicios. Cada archivo tar se cifra con AES-256-GCM y una clave derivada mediante scrypt; el manifiesto registra imágenes exactas, fecha, tamaño, SHA-256, salt, IV, etiquetas de autenticación y UID/GID/permisos del directorio raíz. Un HMAC con sal y clave derivada propias autentica también el manifiesto completo, incluidas las imágenes y la asignación de cada archivo.

## Alcance y requisitos

Este procedimiento admite volúmenes Docker locales completos y PostgreSQL detenido limpiamente. Las imágenes originales deben incluir `/bin/sh`, `stat`, `chown`, `chmod` y `tar` compatible con `--numeric-owner -xpf`, ejecutado como usuario 0 durante la extracción para conservar propietarios. No admite Supabase gestionado, Storage S3, bind mounts, tablespaces externos ni WAL fuera del volumen capturado. PostgreSQL requiere todos los archivos del clúster y la misma versión, arquitectura, extensiones y configuración al recuperar. Para otra instalación, preparar antes un procedimiento específico; una copia parcial no sirve como recuperación.

Para una instalación Supabase self-hosted nueva, [VPS_OPERATIONS.md](VPS_OPERATIONS.md) explica cómo aplicar `compose.supabase-volumes.yaml` después del Compose oficial para preparar esos dos volúmenes, conservando los demás montajes. No aplicar ese override a una instancia con datos: los volúmenes nuevos vacíos ocultarían sus datos existentes.

Inventariar los montajes con `docker inspect --format '{{json .Mounts}}' CONTENEDOR` y las imágenes con `docker inspect --format '{{json .Image}}' CONTENEDOR`. Estos formatos excluyen las variables de entorno. Confirmar que el volumen PostgreSQL contiene PGDATA y WAL. En Supabase self-hosted, declarar también `database-config` para el volumen `db-config` montado en `/etc/postgresql-custom`, que conserva la clave raíz pgsodium necesaria para recuperar datos cifrados. Si ese montaje existe y no se declara correctamente, el script rechaza la captura. No leer ni imprimir las claves; el volumen se copia directamente al archivo cifrado. Claves alojadas en otras ubicaciones requieren un procedimiento específico.

Conservar por separado, cifrados y con acceso restringido, la configuración Supabase, las claves JWT/Auth/Storage y de cifrado de extensiones, los secretos OAuth/SMTP y la configuración del despliegue. Las imágenes identificadas por SHA deben mantenerse disponibles (registro privado o `docker image save` protegido). Los secretos no van en el JSON de fuentes ni en Git. No imprimir `docker inspect` completo o `docker compose config` sobre la instalación real.

## Captura

1. Preparar un fichero de contraseña aleatoria de al menos 32 bytes, fuera del repositorio. En Linux usar directorio `0700` y fichero `0600`; en Windows restringir la ACL al operador. Guardar una copia de recuperación de esa contraseña en un gestor separado del VPS.
2. Crear fuera del repositorio un JSON sin credenciales. Sustituir los nombres y destinos con el inventario real; cada ruta debe coincidir exactamente con el destino del volumen, no con una subcarpeta:

   ```json
   {
     "database": { "container": "database-container", "path": "/var/lib/postgresql/data" },
     "storage": { "container": "storage-container", "path": "/var/lib/storage" },
     "database-config": { "container": "database-container", "path": "/etc/postgresql-custom" }
   }
   ```

   Las fuentes `database` y `storage` son obligatorias; `database-config` es opcional para instalaciones genéricas y obligatoria en el despliegue Supabase descrito. No se admiten otros tipos. Cada fuente se cifra, verifica y restaura por separado; el manifiesto v2 admite dos o tres entradas.

3. Abrir una ventana de mantenimiento. Detener aplicación, funciones, trabajos, API, Auth y Storage antes de detener PostgreSQL limpiamente (`docker stop --time 120 CONTENEDOR`). Anotar qué servicios estaban activos para reanudarlos. Suspender automatismos que puedan reiniciarlos. No usar `docker kill`, `down -v`, comandos de reset ni eliminar volúmenes. Con Supabase CLI inventariar los contenedores por la etiqueta `com.supabase.cli.project`; no asumir que pertenecen a un proyecto Compose.
4. Confirmar que PostgreSQL terminó con código 0. El script también rechaza fuentes activas y otros contenedores activos que monten los mismos volúmenes. Coordinar el acceso administrativo: otro operador no debe arrancarlos durante la captura.
5. Ejecutar con una carpeta de destino nueva y fuera del repositorio:

   ```sh
   node scripts/backup.mjs backup /srv/private-backups/2026-10-31 /srv/private-secrets/backup-password /srv/private-secrets/backup-sources.json
   node scripts/backup.mjs verify /srv/private-backups/2026-10-31 /srv/private-secrets/backup-password
   ```

6. Tras finalizar o fallar, reanudar explícitamente PostgreSQL, servicios Supabase y aplicación, en ese orden; comprobar su salud. El script deja las fuentes detenidas incluso si falla. Una carpeta sin manifiesto completo es una captura incompleta y no debe conservarse como copia válida.

El manifiesto permite comprobar corrupción y GCM autentica el contenido cifrado. No prueba por sí solo que PostgreSQL arranque o que se haya escogido el volumen correcto. La validación completa exige el ensayo siguiente.

## Restauración aislada

El comando crea únicamente volúmenes nuevos para las fuentes declaradas. Verifica todos los archivos antes de crear destinos, rechaza destinos existentes y exige tanto un prefijo de recuperación como una confirmación literal. No acepta nombres de volúmenes de producción, no publica puertos, no arranca la base y no cambia la instalación actual.

```sh
node scripts/backup.mjs restore-volumes /srv/private-backups/2026-10-31 /srv/private-secrets/backup-password myfamily-recovery-20261031trial CREATE_ISOLATED_VOLUMES
```

Los volúmenes resultantes terminan en `-database` y `-storage`. Los auxiliares usan la imagen exacta registrada en el manifiesto, carecen de red y ejecutan solamente herramientas de archivos: `stat` con montaje de origen de solo lectura durante la captura, y `tar --numeric-owner -xpf` para conservar propietarios y permisos de todos los archivos restaurados, seguido de `chown`/`chmod` del directorio raíz del volumen nuevo. `--same-owner` no es compatible con BusyBox `tar`; la extracción se ejecuta como usuario 0, que conserva los propietarios del archivo sin esa opción. La extracción recibe el archivo ya verificado por entrada estándar; no usa `docker cp` hacia el destino porque esa ruta puede cambiar los propietarios. PostgreSQL nunca se inicia automáticamente. La versión 2 del manifiesto exige los metadatos de raíz autenticados; las capturas anteriores sin esos metadatos se rechazan y deben repetirse. Si falla la extracción, conservar los destinos para investigar; usar un prefijo nuevo al reintentar. No reutilizar un destino parcialmente extraído.

Para ensayar, crear otro proyecto Docker con nombre distinto, red separada, las mismas imágenes y los nuevos volúmenes como volúmenes externos explícitos. Mantener los servicios de correo, webhooks, trabajos y acceso a terceros deshabilitados. No conectar ese proyecto a la red del original. No publicar Studio, PostgreSQL o APIs de administración. Si hace falta comprobar HTTP desde el equipo, enlazar a `127.0.0.1` con puertos distintos y credenciales solo de ensayo. Arrancar PostgreSQL con PGDATA, usuario, claves y configuración originales; comprobar arranque, migraciones, recuentos y filas conocidas de aplicación y Auth. Arrancar Storage aislado con sus metadatos restaurados y verificar descargas contra los bytes originales. Registrar fecha, identificador de copia, imágenes, consultas de comprobación sin datos personales y hashes de archivos. La creación de volúmenes por sí sola no es un ensayo completo.

Cuando se incluye `database-config`, se crea además el volumen con sufijo `-database-config`. Montarlo en `/etc/postgresql-custom` del PostgreSQL aislado, sustituyendo allí el volumen `db-config` original. Storage e imgproxy deben compartir el mismo volumen recuperado `-storage`. No regenerar las claves de cifrado durante la recuperación: comprobar la lectura de datos cifrados de ensayo antes de considerar recuperable Vault.

Al terminar, retirar únicamente los contenedores/redes/volúmenes identificados del ensayo tras verificar sus nombres. Nunca ejecutar limpieza global de Docker. La promoción de una recuperación a producción necesita un plan explícito aparte.

## Programación en Linux

`scripts/backup-cycle.sh` prepara la ventana de mantenimiento de un único proyecto Compose declarado. Requiere Bash, `flock` y el comando `node` accesible para systemd. Comprueba que todas las fuentes pertenecen a ese proyecto antes de detenerlo e impide ciclos concurrentes con un bloqueo. Conserva los identificadores de los contenedores originalmente activos, incluidas sus réplicas; no inicia réplicas que estaban detenidas. Ordena las dependencias mediante las etiquetas de Compose, detiene primero los dependientes y reanuda primero sus dependencias. Configurar correctamente esas dependencias de PostgreSQL, Auth/API y Storage. El proyecto debe contener todos sus escritores. Si app o trabajos viven en otro proyecto, preparar su mantenimiento coordinado antes de habilitar el timer. El wrapper no admite la instalación local Supabase CLI; allí usar el procedimiento manual.

El trap intenta reanudar todos los contenedores originales tanto al terminar como ante errores o señales INT/TERM, aunque falle la recuperación de uno. Después de cada arranque comprueba que siga activo y, si existe un healthcheck, espera a que esté sano. El helper maneja explícitamente servicios sin healthcheck; estos solo acreditan estado activo, no disponibilidad funcional. Un estado `unhealthy`, un contenedor detenido, un error de inspección o el vencimiento del plazo hace fallar el ciclo. La espera predeterminada es de 120 segundos por contenedor; `BACKUP_READY_TIMEOUT_SECONDS` admite entre 1 y 600 segundos. Cada inspección Docker tiene un máximo adicional de 15 segundos. Definir comprobaciones de salud apropiadas para los servicios reales. El código de error de la captura se conserva aunque la recuperación posterior tenga éxito.

`node --test scripts/backup-cycle.test.mjs` ensaya el wrapper en Linux con comandos simulados, sin parar servicios reales ni generar copias. Cubre el orden y los identificadores de recuperación, fallos de parada/captura/verificación/arranque, salud fallida o vencida, fuentes ajenas, señales y concurrencia. En Windows esas pruebas se omiten y deben ejecutarse en el entorno Linux de CI. No sustituyen el ensayo del despliegue completo.

Las plantillas `infra/systemd/myfamily-backup.service` y `.timer` programan una copia diaria a las 03:15 UTC. Revisar todas las rutas, nombre de proyecto, orden de dependencias y duración de la ventana antes de copiarlas a `/etc/systemd/system/`. Ejecutar primero el servicio manualmente y comprobar recuperación y salud. Solo después activar `systemctl enable --now myfamily-backup.timer`; comprobar `systemctl list-timers myfamily-backup.timer` y las salidas de cada ejecución con `journalctl -u myfamily-backup.service`. Un apagado abrupto del host o `SIGKILL` no permite ejecutar el trap: comprobar servicios tras cualquier incidente. La programación permanece desactivada en el repositorio y no configura la copia externa.

## Conservación y copia externa

Política inicial propuesta: una copia diaria durante 7 días, una semanal durante 4 semanas y una mensual durante 6 meses. Ajustarla al volumen y a la pérdida de datos tolerable; una copia diaria admite hasta 24 horas de pérdida. El tiempo de recuperación se mide con el ensayo, no se presupone.

Tras verificar, copiar la carpeta cifrada completa a un destino fuera del VPS y de su proveedor cuando sea posible, con cuenta independiente y versionado o retención inmutable. Usar SSH/SFTP o el almacenamiento ya contratado; este repositorio no solicita ni configura credenciales externas. Verificar de nuevo el contenido descargado desde ese destino. Una copia en otro directorio del mismo VPS no cubre su pérdida. No borrar generaciones anteriores hasta confirmar la transferencia y disponer de una restauración ensayada. La purga queda manual para evitar eliminaciones accidentales.

Ensayar al menos mensualmente y después de cambiar PostgreSQL, extensiones o configuración. Mantener alertas externas de copia ausente, espacio insuficiente y verificación fallida; su proveedor y programación quedan pendientes de la instalación real.

## Ensayo anterior

El ensayo de integración `backup-drill-da01740a`, con resultado local en `output/backup-drill-da01740a/result-v3.json` (artefacto ignorado por Git), completó captura cifrada, verificación y extracción numérica a volúmenes nuevos. PostgreSQL restaurado arrancó sin red y confirmó roles, tablas de Auth simuladas y texto UTF-8; los bytes de un archivo de Storage conservaron su hash. Se comprobaron propietarios y permisos de raíz e interiores. Las cuatro pruebas focales de Node cubren cifrado y rechazo de contraseña incorrecta/manipulación, autenticación del manifiesto, validación de los metadatos de raíz y admisión estricta de dos o tres fuentes.

Ese informe anterior es histórico y no acredita el ensayo operativo actual. El nuevo ensayo aislado del 1 de noviembre de 2026 y los resultados completados y pendientes se registran en [LOCAL_OPERATIONS_2026-11-01.md](LOCAL_OPERATIONS_2026-11-01.md). La copia periódica y la transferencia externa siguen pendientes de configurar en un servidor elegido.

Fuentes: [copia física PostgreSQL](https://www.postgresql.org/docs/current/backup-file.html), [volúmenes Docker](https://docs.docker.com/engine/storage/volumes/), [archivos con docker cp](https://docs.docker.com/reference/cli/docker/container/cp/).
