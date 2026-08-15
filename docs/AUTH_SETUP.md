# Configuración y estado de autenticación

## Estado actual

MyFamily incluye registro, email/password, Google, GitHub, callback PKCE, recuperación de contraseña y TOTP. A 15 de agosto de 2026, el cierre local aplica estas garantías:

- El callback OAuth solo acepta rutas internas validadas en `next`; URLs absolutas, protocol-relative, backslashes, valores malformados y variantes codificadas caen en `/dashboard`.
- Las rutas internas válidas conservan su query string.
- El layout protegido comprueba el AAL en SSR y exige challenge cuando una sesión AAL1 puede elevarse a AAL2.
- `/verify-2fa` valida también el destino de retorno y queda fuera del layout protegido para evitar bucles.
- Transferir ownership, borrar una familia y borrar una cuenta mantienen comprobaciones AAL2 propias en servidor/RPC/Edge Function.

Estas garantías locales no validan por sí solas la configuración de un proyecto remoto. La auditoría vigente es [PROJECT_AUDIT_2026-08-07.md](PROJECT_AUDIT_2026-08-07.md); la auditoría del 5 de agosto se conserva únicamente como historia previa al roadmap.

## Variables de entorno

Copia `.env.example` a `.env` y completa únicamente las variables públicas previstas por el proyecto.

No coloques una clave `service_role`, secret key, contraseña de base de datos ni credencial de proveedor en variables `VITE_*`/`PUBLIC_*`: se consideran públicas para el bundle o el cliente.

## Configuración del Dashboard de Supabase

### Email

En **Authentication > Providers > Email**:

- Desarrollo local: la confirmación puede desactivarse temporalmente para pruebas controladas.
- Producción: activa la política decidida, configura SMTP propio y revisa límites, expiración y protección contra abuso en el Dashboard real.

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

## Requisitos pendientes antes de producción

- Probar email, OAuth, Storage y Edge Functions contra el proyecto remoto elegido.
- Configurar rate limits, SMTP, CAPTCHA/antibot cuando proceda, logs y alertas.
- Definir recovery de MFA, soporte de cuentas bloqueadas y notificaciones de seguridad.
- Revisar CSP y cabeceras de seguridad en la plataforma de hosting elegida.
- Mantener autorización de mínimo privilegio en acciones de servidor, RPC y RLS; MFA no sustituye roles ni ACL.
- Ejecutar una revisión de seguridad independiente antes de almacenar datos familiares reales.

Consulta [2FA_SETUP.md](2FA_SETUP.md) para el comportamiento MFA y [EMAIL_TEMPLATES.md](EMAIL_TEMPLATES.md) para los borradores de email.
