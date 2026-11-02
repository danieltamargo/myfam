# Configuración y estado de autenticación

## Estado actual

MyFamily incluye registro, email/password, Google, GitHub, callback PKCE, recuperación de contraseña y TOTP. A 31 de octubre de 2026, el cierre local aplica estas garantías:

- El callback OAuth solo acepta rutas internas validadas en `next`; URLs absolutas, protocol-relative, backslashes, valores malformados y variantes codificadas caen en `/dashboard`.
- Las rutas internas válidas conservan su query string.
- El hook de servidor y el layout protegido comprueban el AAL en SSR y exige challenge cuando una sesión AAL1 puede elevarse a AAL2.
- `/verify-2fa` valida también el destino de retorno y queda fuera del layout protegido para evitar bucles.
- Transferir ownership, borrar una familia y borrar una cuenta mantienen comprobaciones AAL2 propias en servidor/RPC/Edge Function.

Estas garantías locales no validan por sí solas la configuración de un proyecto remoto. La auditoría vigente es [PROJECT_AUDIT_2026-10-31.md](PROJECT_AUDIT_2026-10-31.md); la auditoría del 5 de agosto se conserva únicamente como historia previa al roadmap.

## Variables de entorno

Copia `.env.example` a `.env` y completa únicamente las variables públicas previstas por el proyecto.

No coloques una clave `service_role`, secret key, contraseña de base de datos ni credencial de proveedor en variables `VITE_*`/`PUBLIC_*`: se consideran públicas para el bundle o el cliente.

## Configuración del Dashboard de Supabase

### Email

En **Authentication > Providers > Email**:

- La configuración versionada local exige confirmación de email y contraseñas de al menos 12 caracteres. Registro y restablecimiento usan el mismo mínimo. Mantén esos controles en las pruebas; el correo local se recoge en el servicio de pruebas del stack.
- Producción: activa la política decidida, configura SMTP propio y revisa límites, expiración y protección contra abuso en el Dashboard real.

La sección `auth.rate_limit` versiona `email_sent = 20`, `token_refresh = 60`, `sign_in_sign_ups = 30` y `token_verifications = 30`; el email fija `max_frequency = "1m"`. El entorno local tras reiniciar confirma mínimo 12, autoconfirm desactivado, frecuencia SMTP de un minuto, refresh 60, OTP 30 y verificación 30. Sin SMTP personalizado, la CLI local sustituye la cuota de email 20 por 360000 para desarrollo; la configuración remota sigue sin verificar. No cubren por sí solas abuso distribuido ni cuotas por cuenta/familia.

### URLs

En **Authentication > URL Configuration** configura explícitamente los orígenes autorizados.

Desarrollo:

```text
Site URL: http://localhost:5173
Redirect URL: http://localhost:5173/auth/callback
Redirect URL: http://localhost:5173/reset-password
```

Producción debe usar únicamente el dominio HTTPS real y las rutas necesarias. Evita comodines amplios como `/**` salvo que exista una razón y una revisión de seguridad documentadas.

La validación del callback es una defensa adicional y no sustituye la allowlist del proveedor.

### OAuth

Configura Google y GitHub con credenciales almacenadas en Supabase. Los callbacks registrados en cada proveedor deben coincidir con los que muestra el Dashboard.

Después del intercambio PKCE, una persona con factor TOTP verificado y sesión AAL1 será detenida por el layout SSR antes de acceder a datos protegidos, incluso si el flujo OAuth intentaba volver directamente a una ruta interna.

La política MFA de `20261031235500_direct_supabase_mfa.sql` también bloquea acceso directo REST/Storage/RPC para AAL1 con un factor verificado. Consulta los límites de Realtime DELETE y URLs firmadas en [2FA_SETUP.md](2FA_SETUP.md), y el procedimiento actual en [Recuperación MFA](mfa-recovery.md).

## Base de datos y perfil

La migración base actual es `supabase/migrations/20260116050346_complete_schema.sql`. Contiene `handle_new_user()` y el trigger `on_auth_user_created`; las migraciones posteriores endurecen RLS, operaciones familiares, módulos y almacenamiento.

Verificación local del trigger:

```sql
select tgname
from pg_trigger
where tgname = 'on_auth_user_created';
```

No ejecutes `001-complete-schema.sql`: ese nombre pertenece a documentación antigua y el archivo no existe. Antes de validar auth, reconstruye Supabase local mediante las migraciones versionadas.

## Flujos que deben probarse

### Registro

1. Registro con email nuevo.
2. Perfil creado una sola vez.
3. Confirmación de email según la configuración seleccionada.
4. Callback con ruta interna y con intentos externos/codificados.
5. Registro duplicado y errores de proveedor sin filtrar información sensible.

### Login y MFA

1. Credenciales correctas e incorrectas.
2. Usuario sin TOTP → acceso general AAL1.
3. Usuario con TOTP verificado y AAL1 → challenge obligatorio.
4. Usuario con AAL2 → acceso protegido.
5. Acceso directo a una ruta protegida con AAL1 elevable → `/verify-2fa`.
6. Retorno interno con query tras verificar.
7. `next=https://evil.example`, `//evil.example`, backslashes y codificación → `/dashboard`.
8. OAuth con usuario que tiene TOTP → challenge antes de datos protegidos.

### Recuperación de contraseña

1. Solicitud desde `/forgot-password`.
2. Mensaje neutral para emails existentes e inexistentes.
3. Link válido, expirado y reutilizado según la configuración real.
4. Actualización desde `/reset-password`.
5. Tratamiento explícito de sesiones anteriores.

### Cierre de sesión

1. Cookies eliminadas.
2. Rutas protegidas inaccesibles después del logout.
3. Estado de familia y stores del cliente reiniciados.

## Borrado de cuenta y claves de Edge Functions

`delete-account` valida el JWT del usuario con `auth.getUser(token)` y comprueba AAL2 antes de consultar permisos o borrar la cuenta. `verify_jwt = false` evita la comprobación duplicada del gateway; no elimina la validación del handler. Esto permite trabajar con las claves de firma actuales de Auth, incluidas las sesiones ES256.

El cliente administrativo lee primero `SUPABASE_SECRET_KEYS`, un objeto JSON de claves con nombre, y utiliza su entrada `default`. Si el runtime no ofrece ese objeto, admite `SUPABASE_SECRET_KEY` y, por compatibilidad, `SUPABASE_SERVICE_ROLE_KEY`. No se debe publicar ninguna de estas claves ni enviar una clave secret como JWT del usuario. Véase la [configuración oficial de variables de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

En CLI 2.111.0, el supervisor transforma su clave interna en `SUPABASE_SECRET_KEYS` antes de crear el worker y excluye las variables `SUPABASE_INTERNAL_*` de este. La función no debe depender de esas variables internas. No hace falta copiar claves a archivos del proyecto ni cambiar la firma de las sesiones para resolverlo. Referencia: [supervisor de funciones de la versión utilizada](https://github.com/supabase/cli/blob/v2.111.0/apps/cli/src/shared/functions/serve.main.ts).

Con Supabase local ya iniciado, ejecuta en otra terminal:

```powershell
pnpm dlx supabase@2.111.0 functions serve delete-account
```

La verificación debe cubrir ausencia de autorización, token falso, sesión AAL1, sesión AAL2 con propiedad familiar única y borrado autorizado de una cuenta de prueba. No desactives `getUser`, la comprobación AAL2 ni las restricciones de propiedad para superar estas pruebas.

## Requisitos pendientes antes de producción

- Probar email, OAuth, Storage y Edge Functions contra el proyecto remoto elegido. Google y Microsoft con cuentas reales, y SMTP real, requieren credenciales todavía pendientes.
- Comprobar cuotas efectivas locales y remotas, configurar SMTP real, CAPTCHA/antibot cuando proceda, logs y alertas.
- Operar y validar con soporte real la verificación de identidad para recuperación MFA y cuentas bloqueadas. El autoservicio y el runbook de operador están descritos en [Recuperación MFA](mfa-recovery.md); no sustituyen la verificación operativa de identidad.
- Configurar y probar SMTP real y las notificaciones de seguridad; siguen pendientes.
- Revisar CSP y cabeceras de seguridad en la plataforma de hosting elegida.
- Mantener autorización de mínimo privilegio en acciones de servidor, RPC y RLS; MFA no sustituye roles ni ACL.
- Ejecutar una revisión de seguridad independiente antes de almacenar datos familiares reales.

Consulta [2FA_SETUP.md](2FA_SETUP.md) para el comportamiento MFA y [EMAIL_TEMPLATES.md](EMAIL_TEMPLATES.md) para los borradores de email.
