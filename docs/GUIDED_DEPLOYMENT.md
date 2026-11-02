# Despliegue guiado en un VPS

El operador ejecuta este procedimiento en el VPS. El repositorio prepara una instalación nueva de MyFamily y Supabase con Docker, nginx y certificados de Let's Encrypt. Este trabajo no ha desplegado servicios, emitido certificados ni enviado correos reales.

## Antes de empezar

- Un VPS Linux con systemd, acceso `sudo`, Node.js 24 y Docker Engine local con Docker Compose 2.30 o posterior. Se admite el socket local de Docker con privilegios de sistema; se rechazan contextos remotos y Docker sin privilegios. Instala Docker siguiendo su [guía oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/) o [Debian](https://docs.docker.com/engine/install/debian/). El instalador puede añadir nginx, Certbot, Git, curl y OpenSSL mediante `apt-get`, con confirmación. No hace falta instalar dependencias npm en el VPS: la compilación y el bootstrap usan las dependencias de la imagen Docker.
- Dos dominios distintos apuntando al VPS: uno para MyFamily y otro para la API de Supabase. Los registros A y cualquier AAAA publicado deben ser correctos. Los puertos TCP 80 y 443 deben ser accesibles desde Internet.
- Acceso SMTP autenticado y una dirección remitente autorizada por el proveedor. Las invitaciones y la recuperación de contraseña necesitan correo operativo.
- Espacio suficiente para las imágenes, el almacenamiento, una compilación de la aplicación y las copias acumuladas. La configuración de ClamAV permite hasta 4 GB de memoria y la aplicación 768 MB; añade los recursos de Supabase. Su [guía de instalación](https://supabase.com/docs/guides/self-hosting/docker#system-requirements) indica 4 GB mínimos y 8 GB recomendados para su propio conjunto de servicios.
- El repositorio en una ruta permanente. El temporizador usa esa ruta; no la muevas después de instalar.

Revisa primero el inventario del servidor con `scripts/server-report.sh`. Si otro servicio ocupa 80/443, 3000 u 8000, resuelve el conflicto antes de instalar. El procedimiento no detiene servicios ajenos ni elimina contenedores, redes o volúmenes.

## Ejecutar

Desde la raíz del repositorio:

```bash
sudo bash scripts/deploy.sh /ruta/privada/myfamily.env
```

También puedes usar `sudo bash scripts/deploy.sh`, que lee `.env` en el repositorio. Protege el archivo con permisos `600`. No lo incluyas en Git.

El procedimiento muestra los nombres de las variables, oculta credenciales y confirma el uso del archivo. Después solicita y confirma las dos URL HTTPS, los datos SMTP y el correo del administrador inicial. Cada URL debe contener solo un dominio, sin ruta, puerto, usuario ni parámetros. El correo ACME predeterminado es `danieltamargosaiz@gmail.com`; puedes cambiarlo durante la ejecución.

El operador debe confirmar las URL y el DNS, los cambios de nginx, los certificados y su renovación, el temporizador de copias y el acuerdo vigente de Let's Encrypt. Si faltan paquetes, aparece otra confirmación con sus nombres. Cualquier respuesta distinta de `YES` cancela la operación pendiente.

El archivo `.env` se interpreta como datos, sin `source`, `eval` ni expansión de órdenes. Se admiten asignaciones de una línea, comentarios y valores entre comillas simples o dobles. No se admiten entradas duplicadas, valores multilínea ni escapes de comillas. Los datos de SMTP escritos en el entorno de Compose no pueden contener comillas simples. El instalador explica un formato incompatible y se detiene antes de sustituir la configuración activa.

Los valores de Supabase que procedan de otro proyecto no se reutilizan. La instalación genera contraseña de PostgreSQL, secreto JWT, claves API y claves internas nuevas. Conserva las variables opcionales de la aplicación, como las credenciales de calendario, en el entorno privado de MyFamily.

## Qué instala

La revisión de Supabase está fijada en `bc27d2661edd09a5d0b8d76ce33da6d4071a756e`, correspondiente a la [publicación oficial self-hosted/v0.8.3](https://github.com/supabase/supabase/releases/tag/self-hosted%2Fv0.8.3). El instalador obtiene y comprueba esa revisión, conserva sus servicios y archivos de inicialización, elimina sus nombres globales de contenedor y sustituye los montajes de datos por volúmenes del proyecto `myfamily-guided`. También copia la función `delete-account` del proyecto junto al punto de entrada oficial de Edge Functions.

Los datos y la configuración quedan en `/var/lib/myfamily-guided`. Los archivos privados usan permisos `600`; las carpetas privadas usan `700`. La carpeta principal permite atravesarla para servir el reto ACME, pero no listar su contenido. Solo el directorio del reto es público.

Solo la aplicación, en `127.0.0.1:3000`, y la puerta de enlace, en `127.0.0.1:8000`, publican puertos Docker. PostgreSQL, Supavisor, Studio y ClamAV no publican puertos. nginx termina HTTPS, redirige HTTP y permite en el dominio de Supabase únicamente las rutas API de autenticación, REST, Realtime, Storage y Functions. Studio y otras rutas devuelven 404. Se mantienen las conexiones WebSocket de Realtime.

nginx usa exclusivamente `/etc/nginx/conf.d/myfamily-guided.conf`. El script consulta la configuración de forma privada y rechaza dominios exactos que ya pertenezcan a otro sitio nginx, incluidos sus alias. También comprueba su configuración antes de recargarla y restaura el archivo anterior si la comprobación falla. Conserva los demás sitios. El certificado se llama `myfamily-guided`, incluye ambos dominios y se renueva mediante `certbot.timer`; su gancho comprueba nginx y recarga el servicio tras renovar ese certificado.

Los registros HTTP de estos dos sitios guardan hora, método, estado y tamaño de la respuesta, sin URL, consulta, cabeceras ni dirección del cliente. Sus registros de error nginx se descartan para evitar que un fallo de proxy copie un token de verificación o recuperación de la URL. La puerta de enlace Envoy conserva solo hora, método, protocolo, estado y tamaño: el instalador reconoce y sustituye el formato exacto de la revisión fijada, y se detiene si encuentra otro formato. Esta política afecta únicamente al despliegue MyFamily. Para diagnosticar nginx usa su comprobación de sintaxis, los estados HTTP y la salud de los servicios; la aplicación mantiene su auditoría propia de negocio y autenticación. El procedimiento no modifica otros registros históricos de servicios de Supabase.

Las altas públicas quedan cerradas con `DISABLE_SIGNUP=true`. El proveedor de correo permanece habilitado para permitir el inicio de sesión de usuarios invitados; `ENABLE_EMAIL_SIGNUP` es el nombre de la variable oficial que controla ese proveedor. Teléfono, usuarios anónimos y proveedores sociales quedan deshabilitados. Las contraseñas requieren al menos 12 caracteres, la rotación de tokens está activa y TOTP permite la verificación en dos pasos. El administrador inicial se invita mediante la API administrativa y su UUID se guarda en `SUPER_ADMIN_USER_IDS` del entorno privado de la aplicación. Debe activar TOTP antes de acceder al panel de administración.

## Migraciones y actualizaciones

Ejecuta el mismo comando desde el mismo repositorio para actualizar. La marca privada identifica la ruta, los dominios, el proyecto Docker y la revisión de Supabase. El instalador rechaza recursos ya existentes sin esa marca. No sirve para adoptar una instalación anterior, cambiar de dominio ni actualizar la versión de PostgreSQL o Supabase.

La imagen nueva se compila antes de la interrupción. En una actualización, el procedimiento hace y verifica una copia de los datos existentes antes de sustituir configuraciones o ejecutar migraciones. El respaldo detiene temporalmente los contenedores del proyecto y los reinicia en su orden de dependencias. La aplicación se detiene de nuevo durante las migraciones. Si falla una migración, la actualización se detiene y la aplicación permanece detenida para evitar usar una base a medio actualizar.

Las migraciones se ejecutan ordenadas, con un bloqueo exclusivo de sesión y parada ante el primer error. Cada archivo y su inserción en `myfamily_deploy.migrations` comparten una transacción; se normaliza la pareja exterior `begin/commit` que ya contienen muchos archivos. Se guarda nombre, SHA-256 y fecha. Los archivos ya aplicados se omiten; cambiar su contenido o retirarlos del repositorio provoca un error. Los cambios de salto de línea entre Windows y Linux no alteran el checksum. Las órdenes especiales de `psql` y las transacciones anidadas no se aceptan. Este historial es propio del instalador y no adopta bases gestionadas previamente con `supabase db push`.

Al terminar, Docker espera a que los servicios estén sanos y el instalador comprueba por HTTPS la salud de Auth y la página de acceso. La entrega del correo y el flujo completo del primer acceso deben comprobarse con el operador: una respuesta correcta del servidor no demuestra que el proveedor SMTP haya entregado el mensaje.

## Copias internas

El temporizador `myfamily-guided-backup.timer` ejecuta una copia diaria a las 03:30, según la zona horaria del VPS, con hasta 15 minutos de variación. Si el servidor estaba apagado, `Persistent=true` permite ejecutar la pendiente al arrancar. Comparte el bloqueo del despliegue y no interrumpe una actualización en curso.

Para lanzar una copia manual y revisar el temporizador:

```bash
sudo bash /var/lib/myfamily-guided/backup.sh
sudo systemctl list-timers myfamily-guided-backup.timer
sudo journalctl -u myfamily-guided-backup.service
```

Las copias se guardan en `/var/lib/myfamily-guided/backups/FECHA_UTC`. Incluyen los volúmenes de PostgreSQL, su configuración interna de claves y Storage, cifrados y verificados con el mecanismo existente de [copias del proyecto](BACKUPS.md). El instalador añade `configuration.json.enc` con los entornos, Compose, la marca de instalación, la función `delete-account` y la configuración nginx anterior; comprueba que puede descifrarlo y que el contenido coincide. Los parámetros de cifrado están en `configuration.crypto.json`.

La clave permanece en `/var/lib/myfamily-guided/backup.key`. Conserva una copia privada de esa clave si necesitas recuperar los archivos tras perder la configuración. No hay destino externo, poda automática ni garantía frente a la pérdida del VPS. Revisa periódicamente el espacio libre y la ejecución del temporizador. Las firmas de antivirus se vuelven a descargar y no se incluyen en el respaldo.

## Si una ejecución falla

No uses `docker compose down -v`, `docker system prune`, scripts de reset de Supabase ni borres el directorio privado para intentar arreglarla.

- Si falla la descarga o preparación antes de guardar el entorno, una nueva ejecución puede repetir la preparación cuando la marca pertenece a esta ruta y no existen recursos Docker del proyecto.
- Si ya hay configuración y contenedores, el siguiente intento exige primero una copia verificable. Si una instalación parcial no puede producirla, se detiene para que el operador compruebe PostgreSQL y Storage. No adopta o elimina recursos para continuar.
- Si falla una migración, se revierte ese archivo completo. Las migraciones anteriores conservan su historial. Corrige la causa, comprueba los servicios y repite el procedimiento; no modifiques un archivo que ya figure aplicado.
- Si falla nginx, se conserva su configuración anterior. Un fallo ACME requiere revisar DNS, IPv6 y accesibilidad de 80 antes de repetir, para evitar consumir límites de emisión.
- Si falla SMTP o la invitación inicial, corrige sus credenciales y repite. El script de bootstrap reutiliza el usuario existente cuando ya fue creado. La aplicación se inicia después de disponer del administrador inicial.

Para recuperar datos usa primero la verificación y la restauración en volúmenes aislados descritas en [BACKUPS.md](BACKUPS.md). Mantén la versión exacta de las imágenes de la copia. No montes directamente una copia sobre los volúmenes activos. La restauración y el cambio de tráfico son decisiones manuales del operador.

Para descifrar la configuración, desde la raíz del repositorio, indicando una carpeta de copia y la clave:

```bash
sudo node --input-type=module - /var/lib/myfamily-guided/backups/FECHA_UTC /var/lib/myfamily-guided/backup.key <<'NODE'
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decrypt } from './scripts/backup.mjs';
const [directory, key] = process.argv.slice(2);
await decrypt(
  createReadStream(join(directory, 'configuration.json.enc')),
  createWriteStream(join(directory, 'configuration.recovered.json'), { flags: 'wx', mode: 0o600 }),
  readFileSync(key),
  JSON.parse(readFileSync(join(directory, 'configuration.crypto.json'), 'utf8'))
);
NODE
```

El JSON recuperado contiene secretos. Inspecciónalo de forma privada, sin imprimirlo en informes ni pegarlo en un chat. Restaura los archivos solo después de revisar las rutas y el plan de recuperación. El certificado TLS y las imágenes Docker no forman parte del archivo de configuración; conserva los nombres de imagen del manifiesto y renueva el certificado cuando corresponda.

## Validación de desarrollo

```bash
node --test scripts/deploy.test.mjs
node --check scripts/deploy-guided.mjs
bash -n scripts/deploy.sh
```

Las pruebas cubren la lectura literal del entorno, validación de URL, secretos y roles JWT, aislamiento de Compose, nginx y preparación de todas las migraciones reales. La prueba de cancelación con terminal requiere Linux, Node 24, privilegios de prueba y la herramienta `script`; las otras pruebas no necesitan un VPS ni un demonio Docker. Las comprobaciones locales no sustituyen la verificación posterior del operador sobre DNS, TLS, correo, TOTP y recuperación.
