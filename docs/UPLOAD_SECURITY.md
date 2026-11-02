# Análisis de archivos subidos

Las imágenes de deseos, los recibos y los documentos pasan por ClamAV antes de guardarse. El servidor comprueba sesión, pertenencia y permiso sobre el recurso; analiza un único Buffer y sube ese mismo Buffer después de volver a comprobar los permisos. El tipo y la cabecera se validan por separado: estas comprobaciones no sustituyen al antivirus.

La migración `20261031230000_antivirus_upload_boundary.sql` impide INSERT y UPDATE directos con el rol `authenticated` en `gift-images`, `expense-receipts` y `family-documents`. Las políticas existentes de lectura y borrado siguen vigentes. Las subidas requieren una credencial privada de servidor; nunca se entrega al navegador. Se acepta `SUPABASE_SECRET_KEYS` con `SUPABASE_SECRET_KEY_NAME` (por defecto `default`), después `SUPABASE_SECRET_KEY`, o la variable heredada `SUPABASE_SERVICE_ROLE_KEY`. Una configuración explícita inválida bloquea la subida.

## Ejecución

El despliegue Compose incluye el servicio oficial `clamav/clamav:stable`. Para desarrollo y CI puede iniciarse únicamente el analizador con `docker compose -f compose.antivirus.yaml up -d --wait --wait-timeout 600`. No necesita las credenciales de la aplicación. El puerto publicado se limita a `127.0.0.1:3310`; la aplicación en Compose usa la red privada y el nombre `clamav`.

El servidor acepta `CLAMAV_HOST`, `CLAMAV_PORT` y `CLAMAV_TIMEOUT_MS` (35 segundos por defecto, máximo 60). El protocolo de ClamAV no incorpora autenticación ni cifrado: cualquier analizador separado debe estar en una red privada de confianza. No publicar el puerto en Internet. No existe un interruptor para omitir el análisis.

FreshClam comprueba actualizaciones doce veces al día y conserva las firmas en un volumen. Hay que vigilar sus errores y actualizar periódicamente la imagen. Durante la primera descarga, una recarga de firmas o una caída del servicio, las subidas pueden quedar temporalmente bloqueadas. La recarga concurrente está desactivada para reducir el pico de memoria. No se garantiza detectar todas las amenazas ni se vuelven a analizar archivos históricos automáticamente.

La documentación oficial recomienda **3 GiB de RAM como mínimo y 4 GiB preferibles para ClamAV**. Compose reserva 3 GiB, limita a 4 GiB y una CPU. Es un coste adicional a Supabase (alrededor de 1,9 GiB observados en el entorno local) y Node; no se ha dimensionado un VPS concreto. Un servidor con poca memoria necesitará más capacidad o un analizador privado separado; la falta de capacidad bloquea las subidas.

## Límites y errores

Cada proceso Node admite una sola subida en análisis, sin cola de archivos en memoria. ClamAV tiene un hilo y cola limitada. Los tamaños de aplicación son 5 MiB para imágenes, 8 MiB para recibos y 15 MiB para documentos. El analizador limita flujo, archivos expandidos, profundidad, número de entradas y tiempo. Los archivos cifrados y las exploraciones que exceden límites se rechazan. La escritura en Storage dispone además de una señal de cancelación de 30 segundos, incluida la lectura de la respuesta; si se agota ese plazo se libera el turno de subida. Solo una respuesta completa `stream: OK` permite guardar: detección, desconexión, tiempo agotado y respuestas desconocidas bloquean el archivo con un mensaje sin contenido ni firmas internas.

El despliegue debe coordinar código, configuración privada y migración. Las URLs de subida firmadas emitidas antes de cambiar las políticas pueden seguir siendo válidas hasta su vencimiento; hay que esperar su caducidad antes de declarar cerrada esa transición. La aplicación no emite URLs firmadas de subida. Las credenciales de servicio y el acceso administrativo a Storage siguen siendo privilegiados y deben protegerse.

## Cuota familiar

La migración `20261101010000_family_storage_quota.sql` limita a 1 GiB por familia la suma de imágenes de regalos, recibos de todas sus colecciones y documentos. El operador puede ajustar el límite en `private.family_storage_limits`; el cliente y la credencial de servicio no pueden modificarlo. No representa un paquete contratado.

La base de datos serializa las escrituras de cada familia y cuenta tamaños en los metadatos de Storage. Borrar un archivo libera capacidad. Los tres buckets deben mantener el versionado desactivado; la migración rechaza nuevas versiones y cuenta los registros históricos existentes. No mide archivos físicos huérfanos, copias ni otros buckets. Bajar el límite no borra contenido existente.

Cuando Storage oculta el motivo del rechazo, el servidor consulta una función accesible solo con su credencial privada para ofrecer el mensaje de espacio agotado. Esa consulta es diagnóstica: la protección frente a subidas concurrentes permanece en el trigger transaccional. El ensayo aislado aceptó una escritura de 60 bytes y rechazó la segunda con un presupuesto de 100; también comprobó los tres buckets y la liberación de capacidad al borrar.

## Pruebas de análisis

`pnpm test:av` conecta con el motor real, acepta contenido limpio y comprueba el rechazo de EICAR, una muestra inocua estándar construida en memoria. No se escribe ni sube esa muestra. CI inicia el mismo contenedor y ejecuta esta prueba sin simulaciones. Las pruebas unitarias cubren protocolo, fallos y comprobación repetida de permisos; pgTAP comprueba el bloqueo de INSERT/UPDATE y que lectura, borrado y otros buckets conservan sus permisos.

Fuentes: [contenedor y memoria de ClamAV](https://docs.clamav.net/manual/Installing/Docker.html), [protocolo INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [configuración oficial](https://github.com/Cisco-Talos/clamav/blob/main/etc/clamd.conf.sample), [control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).
