# Conexión con Google Calendar

La aplicación permite conectar un calendario propio de Google sin cambiar la identidad ni la sesión de Supabase. La sincronización se solicita con «Sincronizar ahora»; no hay sincronización automática, cron ni webhooks en este hito.

## Configuración del servidor

Configurar estas variables privadas en el entorno del servidor. No usar prefijos `PUBLIC_` ni `VITE_`, no incluir valores reales en el repositorio y no enviar la clave de cifrado ni el secreto de Supabase al navegador.

| Variable privada | Contenido |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Identificador del cliente OAuth de tipo aplicación web |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Secreto del cliente OAuth de calendario |
| `GOOGLE_CALENDAR_ORIGIN` | Origen HTTPS de MyFamily, sin ruta; HTTP solo para localhost/127.0.0.1 durante desarrollo |
| `CALENDAR_TOKEN_KEYS` | Objeto JSON que relaciona identificadores de clave con claves aleatorias de 32 bytes codificadas en base64 |
| `CALENDAR_TOKEN_ACTIVE_KEY` | Identificador de la clave usada para nuevas escrituras |
| `SUPABASE_PROJECT_URL` | URL de Supabase accesible desde el servidor |
| `SUPABASE_SECRET_KEY` | Credencial de servicio de Supabase, exclusivamente en el servidor |

No se añaden variables públicas de calendario a `.env.example`: esta integración no necesita configuración del proveedor en el cliente. El panel muestra que falta configuración mientras no estén disponibles las variables privadas.

En Google Cloud, habilitar Calendar API y registrar exactamente `https://TU_ORIGEN/calendar/google/callback` como URI de redirección del cliente web. Usar una configuración OAuth independiente de la del login de Supabase. Preferir un proyecto distinto si se necesita que la revocación de Calendar no afecte otros permisos OAuth del mismo proyecto: Google documenta que revocar un token revoca los permisos concedidos al proyecto. [OAuth de servidor y revocación](https://developers.google.com/identity/protocols/oauth2/web-server).

La pantalla de consentimiento necesita los ámbitos `calendar.events.owned` y `calendar.calendarlist.readonly`. No se solicitan correo, perfil, libre/ocupado, ACL ni edición de calendarios ajenos. Google puede requerir revisión de la aplicación para publicar estos ámbitos; se puede probar con usuarios de prueba autorizados por el proyecto. [Ámbitos de Calendar](https://developers.google.com/workspace/calendar/api/auth).

## Cifrado y rotación

Los tokens se guardan con AES-256-GCM y datos asociados a usuario, familia, conexión y tipo de token. Los clientes autenticados no pueden seleccionar las columnas de tokens, escribir conexiones ni ejecutar las RPC de sincronización. El servidor usa su credencial de servicio después de comprobar usuario, familia y propiedad de la conexión.

Para rotar, añadir una nueva clave al objeto `CALENDAR_TOKEN_KEYS`, cambiar `CALENDAR_TOKEN_ACTIVE_KEY` y conservar las anteriores mientras haya tokens o autorizaciones pendientes cifrados con ellas. Las operaciones de conexión vuelven a cifrar con la clave activa. No retirar una clave anterior hasta migrar sus conexiones y dejar caducar las cookies OAuth pendientes. La ausencia de una clave provoca un error y exige restaurarla o volver a autorizar; no se intenta descifrar con otra clave.

## Comportamiento del hito

- OAuth usa nonce de un solo uso en base de datos y cookie HttpOnly cifrada, PKCE y comprobación de la misma identidad de MyFamily al volver del proveedor.
- El usuario elige un calendario que Google identifica como propio. Para cambiar de cuenta o calendario, desconecta y vuelve a conectar.
- La importación manual consulta desde 30 días antes hasta 365 días después del momento actual, con paginación y series expandidas en instancias. Se conservan fechas de todo el día, zonas horarias y excepciones/cancelaciones del proveedor. Los vínculos ya existentes se comprueban aunque su fecha salga de esa ventana.
- Los eventos nuevos importados son privados, visibles únicamente para quien conectó la cuenta. No se copian invitados ni respuestas de asistentes. No se publica libre/ocupado a la familia. El usuario puede compartir una copia mediante la audiencia del evento de MyFamily.
- La exportación requiere elegir un evento interno propio, sin recurrencia. Crea una copia privada en Google y usa una identidad remota determinista para que un reintento no duplique el evento.
- Se comparan la versión local y el ETag remoto. Si ambas partes cambian, se conserva el conflicto sin sobrescribirlas. El usuario puede elegir Google o MyFamily. Las escrituras remotas usan `If-Match`; un cambio adicional del proveedor produce conflicto. [Versiones y modificaciones condicionales](https://developers.google.com/workspace/calendar/api/guides/version-resources).
- Borrar una copia local conectada se propaga en la próxima sincronización. Si Google también cambió ese evento, el usuario debe elegir entre recuperarlo desde Google o confirmar su eliminación allí.
- Desconectar revoca el token y borra tokens, vínculos y copias importadas en MyFamily. Conserva eventos originales creados en MyFamily y eventos de Google. Si no se confirma la revocación por un error de red, se informa y la conexión permanece disponible para reintentar.

La exclusión entre sincronizaciones usa una concesión temporal de servidor y vuelve a comprobar su vigencia antes de las escrituras remotas. Ninguna operación de red mantiene una transacción de base de datos abierta.

## Límites y siguientes pasos

No se ha conectado ninguna cuenta real ni se ha probado un consentimiento real porque no se proporcionaron credenciales del proveedor. Las pruebas usan respuestas simuladas y Supabase local. La comprobación de Svelte es local; no se envía código privado al analizador remoto.

La sincronización manual tiene un máximo de 20 páginas de 250 eventos por consulta del proveedor; si lo supera, falla explícitamente. No se exportan reglas de recurrencia ni se gestionan invitados, conferencias, adjuntos o calendarios compartidos ajenos. Las descripciones se conservan como texto y se presentan escapadas por Svelte.

Una siguiente fase puede añadir sincronización periódica con una cola de trabajo, cursores incrementales `syncToken` con recuperación de `410`, y webhooks renovables. Esa fase debe conservar la misma protección de audiencia y las decisiones de conflicto. [Sincronización incremental de Google](https://developers.google.com/workspace/calendar/api/guides/sync).

## Verificación local

- `pnpm test:unit src/lib/server/calendar`: 27 pruebas superadas en cinco archivos. Incluye cifrado y rotación, estado OAuth, ámbitos, calendarios propios, paginación, instancias canceladas, todo el día/DST, importación simulada, reintento de exportación y las dos resoluciones del conflicto de borrado.
- `supabase test db` dirigido a `030_calendar_rls` y `031_google_calendar_connections`: 61 aserciones superadas. Incluye permisos de tokens, nonce de un uso, privacidad frente al owner y admin familiares, origen con UUID conocido, deduplicación, versión, concesión de sincronización y desconexión.
- `pnpm check`: cero errores y 28 avisos existentes en otros componentes. ESLint dirigido: cero errores; seis avisos de enlaces ya presentes en la página de calendario.
- No se han ejecutado OAuth, importación, exportación ni revocación contra cuentas reales de Google. Las pruebas de navegador generales las coordina el proceso principal.

Comprobación de entrega: PASS, acciones y estados conectados a código real; PASS, alcance y límites explícitos; PASS, sin credenciales, métricas ni afirmaciones de sincronización real inventadas; PASS, interfaz conserva el diseño y los controles del proyecto. La verificación visual completa y el consentimiento real no se certifican mediante estas pruebas locales.
