# Operación en VPS

Para el despliegue guiado solicitado con **nginx y Supabase dentro del proyecto Docker**, utilizar [GUIDED_DEPLOYMENT.md](GUIDED_DEPLOYMENT.md). Lo ejecuta personalmente el operador. Los apartados siguientes documentan la alternativa Caddy anterior; no mezclar sus archivos Compose con la nueva vía. Las copias externas se han pospuesto por decisión del propietario: el primer despliegue usa copias internas.

`compose.vps.yaml` prepara la aplicación, ClamAV y Caddy para un VPS Linux con Docker Compose 2.24.4 o posterior. Se usa como archivo independiente, sin combinarlo con `compose.yaml`; la configuración local permanece intacta. Esta preparación no instala un servidor remoto, no publica DNS y no emite certificados durante la validación local.

## Preparar el servidor

Como presupuesto inicial de planificación para Supabase self-hosted con antivirus, considerar 4 vCPU y 8 GiB de RAM y elevar el límite de REST a 512 MiB. Es una propuesta conservadora a partir de un ensayo local pequeño, no una capacidad certificada; dimensionar memoria para ClamAV (límite probado de 4 GiB), aplicación, Docker y Supabase. REST alcanzó 253,3 MiB con su límite actual de 256 MiB, por lo que conviene ampliar ese margen. Validar el tamaño con tráfico representativo del servidor real antes de contratarlo. Crear un usuario de operación, acceso SSH por clave, actualizaciones del sistema y firewall. Publicar únicamente SSH restringido y HTTP/HTTPS (80/443). Docker puede gestionar reglas de firewall propias: comprobar puertos realmente escuchando desde otro equipo.

La plantilla no instala Supabase. Conectar la aplicación a una instalación configurada y respaldada por separado. Mantener PostgreSQL, Studio, métricas y administración sin puertos públicos; para gestión usar túnel SSH o VPN. Si el navegador usa Supabase directamente, publicar solo su gateway con HTTPS y sus controles de autenticación/RLS. Resolver antes de desplegar cómo accede ClamAV y cómo se verifican los archivos en el servidor.

Para una instalación nueva, usar una configuración e imágenes de Supabase coherentes que se hayan ensayado juntas. El ensayo local del 1 de noviembre usó PostgreSQL 17.6.1.071, Auth 2.185, REST 14.3, Realtime 2.69.2, Kong 2.8.1 y Storage `supabase/storage-api:v1.84.32`; los detalles y límites de evidencia están en [LOCAL_OPERATIONS_2026-11-01.md](LOCAL_OPERATIONS_2026-11-01.md). No actualizar a ciegas una instalación existente: las migraciones nuevas de Storage pueden ser de solo avance y requerir un procedimiento de datos aparte ([registro oficial de cambios](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)). La configuración antigua de la CLI local no representa el conjunto de versiones ensayado.

Para una instalación Supabase self-hosted nueva con su Compose oficial, `compose.supabase-volumes.yaml` sustituye únicamente los destinos `/var/lib/postgresql/data` del servicio `db` y `/var/lib/storage` del servicio `storage` por volúmenes Docker. El merge normal de Compose identifica cada montaje por su destino, por lo que conserva los restantes montajes oficiales de configuración, claves e inicialización. Usar siempre primero el archivo oficial y después este override, con el mismo nombre de proyecto y su fichero de variables protegido:

El servicio `imgproxy` usa también `supabase-storage` en `/var/lib/storage`, para que sus transformaciones lean los mismos archivos. El volumen oficial `db-config` en `/etc/postgresql-custom` permanece intacto: incluirlo como fuente `database-config` de las copias para preservar la clave raíz de pgsodium. El JSON de tres fuentes está en [BACKUPS.md](BACKUPS.md); la clave nunca se añade al JSON ni se imprime.

```sh
docker compose --project-name myfamily-data --env-file /srv/private-secrets/data-compose.env -f /srv/supabase/docker/docker-compose.yml -f /srv/myfamily/compose.supabase-volumes.yaml config --quiet
docker compose --project-name myfamily-data --env-file /srv/private-secrets/data-compose.env -f /srv/supabase/docker/docker-compose.yml -f /srv/myfamily/compose.supabase-volumes.yaml up -d --wait
```

Estos comandos se reservan para el servidor nuevo preparado por el operador. No aplicar el override a una instalación existente: montar un volumen vacío en esos destinos oculta los datos actuales. Migrar una instancia con datos necesita un procedimiento independiente, copia verificada y ensayo previo. El override no configura secretos, TLS del gateway ni seguridad de puertos del Compose oficial; revisarlos antes del arranque. Confirmar el inventario final de montajes sin imprimir variables de entorno. La copia incluye la clave de pgsodium cuando se declara la fuente `database-config`; conservar además los ficheros de entorno y las demás claves del despliegue cifrados y separados, según [BACKUPS.md](BACKUPS.md).

Para usar el ciclo programado de copia en ese proyecto Supabase, el argumento `COMPOSE_FILE` de `backup-cycle.sh` debe apuntar a un archivo de composición que incorpore ambos archivos. Puede usarse un fichero protegido fuera del repositorio con `include` de los dos archivos como conjunto de merge (Compose 2.24.4 o posterior):

```yaml
include:
  - path:
      - /srv/supabase/docker/docker-compose.yml
      - /srv/myfamily/compose.supabase-volumes.yaml
    env_file: /srv/private-secrets/data-compose.env
```

Guardar ese fichero como `/srv/myfamily-data/compose.yaml`, mantener el proyecto `myfamily-data` y usarlo de forma consistente en mantenimiento y arranque. Revisar su resolución con `config --quiet` antes de habilitar el timer. El fichero `backup-sources.json` declara las tres fuentes: los volúmenes de datos PostgreSQL y Storage, y `database-config` del contenedor `db` en `/etc/postgresql-custom`. La aplicación puede vivir en `myfamily-vps`, sin acceso directo a los volúmenes ni a PostgreSQL: durante la copia sus llamadas API y Storage no estarán disponibles. Coordinar la ventana, detener trabajos/reintentos y mantener cerradas las escrituras hasta recuperar la salud de esos servicios. El wrapper solo detiene y reanuda el proyecto Supabase declarado.

Construir la aplicación con el Dockerfile existente, sus argumentos públicos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y un tag inmutable por versión. Nunca pasar claves de servicio como argumentos de compilación. Guardar la imagen anterior para rollback. Las variables de compilación pertenecen al destino: cambiar Supabase requiere reconstruir.

Crear fuera del repositorio un fichero de aplicación protegido (`0600`) con las variables de `.env.example` que requiera ese destino. No copiar el `.env` del equipo personal ni guardar secretos en imágenes. Crear aparte un fichero de interpolación para Compose con `APP_IMAGE`, `APP_DOMAIN`, `ACME_EMAIL` y `APP_ENV_FILE` (ruta absoluta al fichero protegido). El dominio debe tener DNS dirigido al VPS antes de activar Caddy. Configurar las URLs públicas y redirecciones Auth/OAuth con ese mismo origen HTTPS.

## Validar y arrancar

Con datos ficticios, validar la estructura sin expandir valores reales:

```sh
docker compose --env-file /srv/myfamily/compose.env -f compose.vps.yaml config --quiet
```

Para validar el Caddyfile sin iniciar servidor, publicar puertos ni pedir certificados:

```sh
docker run --rm --network none -e APP_DOMAIN=example.invalid -e ACME_EMAIL=ops@example.invalid -v "${PWD}/infra/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.11.7-alpine caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile --validate
```

El operador ejecuta estos comandos de arranque únicamente en el VPS preparado:

```sh
docker compose --project-name myfamily-vps --env-file /srv/myfamily/compose.env -f compose.vps.yaml pull
docker compose --project-name myfamily-vps --env-file /srv/myfamily/compose.env -f compose.vps.yaml up -d --wait --wait-timeout 900
docker compose --project-name myfamily-vps --env-file /srv/myfamily/compose.env -f compose.vps.yaml ps
```

Caddy obtiene certificados al arrancar con el dominio real y los guarda en `caddy-data`; conservar ese volumen para renovaciones. Su API de administración está desactivada. La aplicación y ClamAV carecen de puertos publicados. El proxy limita el cuerpo HTTP a 16 MB y espera hasta 90 segundos las cabeceras de respuesta, compatible con análisis de subidas. La aplicación mantiene sus propios límites; el sobre multipart también ocupa espacio. No se añade CSP desde el proxy para evitar duplicar la política de la aplicación.

El proxy concede 10 segundos para cabeceras, 2 minutos para recibir el cuerpo, 30 segundos sin progreso durante esa recepción y 2 minutos entre peticiones de una conexión persistente. No impone un límite total de escritura que corte conexiones de tiempo real. HSTS dura un día (`max-age=86400`) para recordar HTTPS en visitas posteriores al dominio configurado; no incluye subdominios ni solicita preload.

La aplicación recibe `ADDRESS_HEADER=x-forwarded-for` y `XFF_DEPTH=1` para que `getClientAddress()` y los límites por IP identifiquen al cliente. Este valor supone que Caddy es el único proxy delante de app y recibe directamente la conexión pública. Caddy ignora de forma predeterminada los encabezados reenviados del cliente, y app no publica puertos que permitan eludirlo. No conectar contenedores ajenos a esa red. Si se añade CDN o balanceador, revisar explícitamente sus rangos de confianza y la profundidad antes de desplegar; no confiar en encabezados arbitrarios.

El servicio app usa usuario sin privilegios del Dockerfile, raíz de solo lectura y `/tmp` limitado. Los contenedores tienen límites de memoria, CPU, procesos y rotación de logs. ClamAV conserva sus firmas y debe estar saludable antes del arranque de app. Su inicialización puede tardar varios minutos. La comprobación HTTP de app detecta un proceso que no responde o devuelve 5xx; no garantiza disponibilidad de Supabase ni valida una sesión real.

Después del arranque, comprobar HTTPS, inicio de sesión, MFA, carga/descarga de archivos y rechazo de archivos peligrosos con una cuenta de ensayo. Revisar salud, consumo, espacio y caducidad de certificados. No registrar tokens, URLs firmadas o datos de usuarios en tickets. Configurar monitor externo antes de considerar operativo el servicio; la plantilla no contrata alertas.

## Actualizar y volver atrás

Antes de cambiar versión, realizar y verificar una copia según [BACKUPS.md](BACKUPS.md). Revisar migraciones y compatibilidad con la versión anterior. Registrar el tag o digest actual y el nuevo, actualizar `APP_IMAGE`, ejecutar `pull` y `up -d --wait` con los mismos argumentos. Validar los flujos críticos. No ejecutar migraciones destructivas automáticamente desde Compose.

Si falla la aplicación y la base sigue siendo compatible, restaurar el valor anterior de `APP_IMAGE` y repetir `up -d --wait`. La actualización recrea app sin borrar volúmenes. Las migraciones incompatibles requieren un plan específico; volver al contenedor anterior no revierte datos. Restaurar una copia siempre comienza en un destino aislado y nunca sobrescribe la base activa de forma automática.

Para mantenimiento, detener app antes de servicios Supabase y PostgreSQL. Reanudar en orden inverso y comprobar salud. No ejecutar `down -v`, `docker system prune --volumes` ni scripts de reset sobre producción. Conservar versiones de Compose/Caddy y aplicar actualizaciones de seguridad primero en ensayo. La imagen Caddy está fijada a una versión; comprobar su versión de seguridad antes de un despliegue real.

## Estado de la validación local

El informe actualizado de ensayo local está en [LOCAL_OPERATIONS_2026-11-01.md](LOCAL_OPERATIONS_2026-11-01.md). La restauración aislada completa pasó en 30 926 ms desde archivos ya creados; no se ha medido el tiempo de creación de la copia. El ensayo encontró que Realtime termina cuando PostgreSQL cae, por lo que los seis servicios del fixture usan política `unless-stopped` para reiniciarse. Pasaron seis escenarios de recuperación, el probe del runtime de funciones con rechazo de JWT falso y control AAL2, y la carga local con cero errores. El presupuesto inicial sugerido (4 vCPU, 8 GiB de RAM) todavía debe validarse con tráfico representativo en el servidor elegido; no se ha desplegado ni dimensionado un VPS real. Las unidades systemd continúan desactivadas y no hay transferencia externa configurada. Los ensayos locales de Compose/Caddy y de la aplicación descritos en informes anteriores son históricos y no prueban TLS público ni disponibilidad en producción.

Fuentes: [Compose y límites de servicios](https://docs.docker.com/reference/compose-file/services/), [include y merge de Compose](https://docs.docker.com/reference/compose-file/include/), [opciones y tiempos Caddy](https://caddyserver.com/docs/caddyfile/options#timeouts), [encabezados del proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults), [IP en adapter-node](https://svelte.dev/docs/kit/adapter-node#Environment-variables-ADDRESS_HEADER-and-XFF_DEPTH), [HTTPS automático](https://caddyserver.com/docs/automatic-https).
