# Datos necesarios para desplegar MyFamily

## Decisiones del operador (1 de noviembre de 2026)

El propietario ejecutará personalmente los despliegues. No necesita facilitar acceso SSH al asistente. La vía solicitada está en [GUIDED_DEPLOYMENT.md](GUIDED_DEPLOYMENT.md): Docker para aplicación y Supabase local al proyecto, nginx y HTTPS. La plantilla Caddy anterior se mantiene como alternativa independiente.

Antes de dimensionar, ejecutar `sudo bash scripts/server-report.sh` en el VPS. El script indica dónde guarda su informe privado; revisar el contenido antes de compartirlo. Incluye recursos y servicios existentes sin leer archivos de secretos ni logs. No cambia servicios ni instala paquetes.

Las copias serán internas al VPS por decisión del propietario. No se exige configurar un destino externo para este primer despliegue; estas copias no cubren la pérdida del VPS o su disco. El asistente no desplegará, cambiará DNS ni enviará correos reales desde esta sesión.

El email predeterminado para certificados es `danieltamargosaiz@gmail.com`. La aplicación tendrá registro cerrado; el alta se realizará desde administración. El administrador global se designa por UUID en el entorno privado y necesita MFA. La primera familia se llamará **Mabu**; sus usuarios y regalos quedan pendientes del Excel y de la relación pestaña → email. No crear miembros ficticios.

El despliegue aún no se ha realizado. El punto de partida propuesto es Linux con Docker, 4 vCPU y 8 GiB de RAM para aplicación, Supabase y antivirus juntos. Es un presupuesto inicial basado en el [ensayo local](LOCAL_OPERATIONS_2026-11-01.md); se comprobará en el servidor elegido.

## Necesario para el primer despliegue

| Necesito del usuario | Detalle concreto |
|---|---|
| Servidor | IP o hostname, proveedor, distribución/versión Linux, arquitectura, CPU, RAM y disco disponible. Indicar si contiene servicios o datos que deban conservarse y si 80/443 ya están ocupados. |
| Acceso | El propietario necesita su propio acceso SSH con sudo para ejecutar los scripts; no debe compartir credenciales con el asistente. |
| Dominio y DNS | Nombre definitivo de la aplicación y del gateway Supabase, y quién puede crear sus registros DNS. No se necesita acceso al registrador si el usuario prefiere añadir los registros indicados. |
| Ubicación de Supabase | Confirmar si se instala nuevo en ese mismo VPS o se usa un proyecto gestionado. Para uno existente: URL, claves pública/privada mediante archivo protegido y aclarar qué datos deben conservarse. No se migrará ni reemplazará una instancia existente sin un plan específico. |
| Correo transaccional | Host SMTP, puerto y modo TLS, remitente autorizado, usuario y contraseña/API key SMTP mediante archivo protegido. Acceso al DNS o colaboración para verificar SPF/DKIM. Hace falta para confirmación de registro y recuperación de contraseña. |
| Copias internas | Directorio privado con espacio suficiente dentro del VPS; revisar retención y ensayo de restauración. La copia externa se pospone por decisión del propietario. |
| Contacto y ventana | Email para certificados/avisos y momento permitido para desplegar o hacer mantenimiento. Confirmar quién revisará los avisos de fallos. |

Para revisar capacidad basta compartir el informe del servidor ya revisado, los dominios previstos y el proveedor SMTP. El propietario introduce sus credenciales directamente en un archivo protegido del VPS.

## Para activar calendarios reales

Se requieren **ambos proveedores**, conforme al alcance del MVP:

- Google: cliente OAuth web con Calendar API y consentimiento configurados; client ID y secret, y cuentas de prueba autorizadas si el proyecto sigue en pruebas. Redirección: `https://DOMINIO_APP/calendar/google/callback`.
- Microsoft: aplicación registrada con permisos de calendario, client ID y secret, y acceso de una cuenta de prueba. Redirección: `https://DOMINIO_APP/calendar/microsoft/callback`.

La configuración concreta está en [Google Calendar](GOOGLE_CALENDAR_SETUP.md) y [Microsoft Calendar](MICROSOFT_CALENDAR_SETUP.md). La autorización de cada calendario la realiza su propietario; no se necesitan contraseñas personales. Estos clientes son independientes del login social de Supabase. La aplicación puede arrancar con calendario interno mientras faltan los proveedores; la sincronización conectada actual es manual.

## Para incorporar la primera familia

- Email del primer administrador. La familia inicial se llamará **Mabu**.
- Excel y relación entre pestañas, personas y emails. Confirmar qué significa el tachado y cómo resolver filas ambiguas antes de importar.

El importador y su mapeo definitivo siguen pendientes del archivo. No hacen falta contraseñas iniciales de familiares ni almacenar el Excel en Git.

## Lo que preparan los scripts

Para una instalación nueva se generan contraseñas internas, claves JWT/servicio y clave de copias. Se prepara la imagen de aplicación, los archivos privados, Compose, nginx/HTTPS, migraciones con historial y comprobaciones de salud. Las claves OAuth y de cifrado de calendarios se configuran por separado cuando se activen esas conexiones.

El propietario configura el DNS y facilita SMTP durante la ejecución. El despliegue guiado solicita confirmación para certificados y copias internas diarias. La transferencia externa queda pospuesta. La entrega de correo, la recuperación de copias y los flujos de acceso deben verificarse en el VPS real.

## Comprobación previa

`pnpm check:vps --compose-env-file /srv/private/compose.env --env-file /srv/private/app.env --expected-supabase-url https://GATEWAY --admin-url http://127.0.0.1:54323 --check-docker`

Sustituir `https://GATEWAY` por la URL HTTPS pública del gateway usada al construir la imagen. Ejecutar en el VPS Linux preparado, con Node 24 y pnpm disponibles. El comando solo lee los archivos indicados y, con `--check-docker`, consulta la versión de Compose; no arranca servicios ni usa credenciales contra Supabase.

| Archivo o argumento | Preparación necesaria |
|---|---|
| `--compose-env-file` | Archivo con `APP_DOMAIN` (hostname sin protocolo), `APP_IMAGE` (tag de versión o digest), `ACME_EMAIL` y `APP_ENV_FILE` (ruta absoluta Linux al mismo archivo pasado en `--env-file`). |
| `--env-file` | Archivo de aplicación con `ORIGIN=https://APP_DOMAIN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y clave privada del servidor. Se admite `SUPABASE_SECRET_KEY`, el fallback `SUPABASE_SERVICE_ROLE_KEY` o el mapa `SUPABASE_SECRET_KEYS` con su nombre seleccionado. Las URLs Supabase adicionales, si existen, deben coincidir con la pública. |
| Ambos archivos | Fuera de Git, archivos regulares con permisos `0600` en Unix. Valores de una línea, sin interpolación con `$`, duplicados ni marcadores de plantilla. Se admiten comillas simples o dobles que envuelvan el valor completo. |
| `--expected-supabase-url` | URL declarada de compilación que se compara con `VITE_SUPABASE_URL`; no se extrae ni verifica dentro de la imagen. Reconstruir la imagen si cambia Supabase. |
| `--admin-url` | URL de administración en loopback mediante túnel SSH; el comprobador rechaza una URL pública. No verifica el túnel ni los puertos realmente expuestos. |
| `--check-docker` | Comprueba que Docker Compose sea 2.24.4 o posterior. No valida el archivo Compose resuelto ni la disponibilidad del daemon. |

El comprobador no busca el `.env` del repositorio ni muestra valores privados. Revisa formato de claves, no su autenticidad, privilegios efectivos ni pertenencia al proyecto. Los tags de imagen no prueban inmutabilidad: se prefiere digest y se debe conservar la imagen previa. No verifica disponibilidad de la imagen, contenido del build, DNS, firewall, SMTP, configuración Auth ni certificados. En Windows avisa de que las ACL requieren revisión separada; la correspondencia de rutas del despliegue está pensada para Linux.

Los calendarios sin credenciales permanecen deshabilitados y no bloquean esta comprobación. Si se configura alguno, se exigen ambos campos de cliente, origen coincidente, `SUPABASE_PROJECT_URL`, `SUPABASE_SECRET_KEY` y un keyring válido de claves de 32 bytes en base64 con una clave activa. SMTP y login social se configuran en Supabase por separado: este comando no comprueba que estén operativos.

`pnpm test:vps-config` ejecuta pruebas con archivos ficticios, sin Docker ni secretos externos. Pasarlas no acredita el despliegue real. Si se elige Supabase gestionado, acordar su procedimiento de copia y restauración: los scripts de volúmenes de este repositorio solo cubren la instalación self-hosted descrita en [BACKUPS.md](BACKUPS.md).
