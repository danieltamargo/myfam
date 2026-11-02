# Outlook y Microsoft 365

La conexión usa Microsoft Graph delegado y es independiente del inicio de sesión de MyFamily. Admite cuentas personales Microsoft y cuentas de trabajo o educativas con buzón compatible; las políticas de la organización pueden exigir consentimiento del administrador.

## Registro de la aplicación

1. Registra una aplicación web en Microsoft Entra, con cuentas de cualquier directorio organizativo y cuentas personales Microsoft.
2. Añade una URI de redirección web exacta: `https://TU_DOMINIO/calendar/microsoft/callback`. En desarrollo se permite HTTP exclusivamente para localhost o 127.0.0.1.
3. Añade el permiso delegado Microsoft Graph `Calendars.ReadWrite`. El flujo solicita también `offline_access`; no necesita `User.Read`, permisos de aplicación ni acceso al perfil.
4. Configura un secreto de cliente en el servidor. No lo incluyas en el navegador ni en archivos versionados.

## Configuración privada del servidor

- `MICROSOFT_CALENDAR_CLIENT_ID`: identificador de la aplicación.
- `MICROSOFT_CALENDAR_CLIENT_SECRET`: secreto del cliente.
- `MICROSOFT_CALENDAR_ORIGIN`: origen público fijo de MyFamily.
- `CALENDAR_TOKEN_KEYS` y `CALENDAR_TOKEN_ACTIVE_KEY`: mismo anillo de claves AES-256-GCM usado por Google Calendar. Consulta `GOOGLE_CALENDAR_SETUP.md` para el formato y rotación.
- `SUPABASE_PROJECT_URL` y `SUPABASE_SECRET_KEY`: conexión privada del servidor, nunca enviada al cliente.

Aplica previamente la migración que permite `microsoft_calendar` en las conexiones y amplía las RPC de calendario. Los nombres de las RPC conservan `google_calendar` por compatibilidad; sus validaciones admiten únicamente Google y Microsoft. No habilites el panel con la base de datos anterior.

## Uso y límites

Cada persona puede conectar un calendario propio por familia y proveedor. Google y Microsoft pueden coexistir. Se listan calendarios editables con capacidad de compartir, que Microsoft reserva al propietario. No se guardan direcciones de correo ni datos de perfil de la cuenta conectada.

La sincronización es manual y consulta desde hace 30 días hasta los próximos 365 días, con un máximo de 20 páginas. `calendarView` expande las series y sus excepciones. Se solicitan horas UTC e identificadores inmutables. Los eventos importados empiezan visibles solo para su propietario; los administradores de familia no pueden gestionarlos por su rol.

La exportación requiere elegir un evento interno propio sin recurrencia. Solo se envían su título, descripción y fechas. La copia es privada y no incluye invitados. Las sincronizaciones siguientes comparan versión local y ETag remoto; los cambios simultáneos requieren elegir una versión. Los borrados también se sincronizan y usan `If-Match`. Los errores 412 conservan un conflicto para revisión. Un identificador de transacción estable y propiedades extendidas permiten recuperar una exportación si se interrumpe antes de guardar el enlace local.

Las respuestas de paginación solo pueden apuntar al host fijo `graph.microsoft.com/v1.0`; los redireccionamientos se rechazan. Los errores de red y límites no se interpretan como una lista vacía ni como borrados.

Desconectar borra los tokens locales y las copias importadas; conserva los eventos originales de Microsoft y los eventos propios de MyFamily. Microsoft Graph no ofrece un endpoint para revocar este único consentimiento delegado. Para revocarlo, retira el permiso de MyFamily en la gestión de aplicaciones de tu cuenta Microsoft o pide al administrador de la organización que lo retire. No se llama a `revokeSignInSessions`, que afecta a otras sesiones y requiere permisos adicionales.

## Verificación pendiente de credenciales reales

Las pruebas locales usan respuestas simuladas: no conectan cuentas externas. Antes de producción, verifica el consentimiento, selección de calendario, una instancia recurrente, evento de día completo, exportación, conflicto por ETag, borrado, reconexión y retirada del consentimiento con cuentas de prueba personales y de Microsoft 365.

## Referencias

- [Flujo de autorización con PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Calendarios y capacidad canShare](https://learn.microsoft.com/en-us/graph/api/resources/calendar?view=graph-rest-1.0)
- [Creación de eventos y transactionId](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
- [Propiedades extendidas y filtros](https://learn.microsoft.com/en-us/graph/api/singlevaluelegacyextendedproperty-get?view=graph-rest-1.0)
