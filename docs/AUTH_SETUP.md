# Configuración de Autenticación Email/Password

## Paso 1: Configurar en Supabase Dashboard

### 1. Habilitar Email Provider

1. Ve a **Authentication > Providers**
2. Busca "Email" en la lista
3. Asegúrate de que esté **habilitado** (toggle en verde)

### 2. Configurar Email Confirmation

**Para Desarrollo (recomendado para pruebas):**
- Desactiva "Confirm email"
- Los usuarios podrán iniciar sesión inmediatamente después de registrarse

**Para Producción (recomendado por seguridad):**
- Activa "Confirm email"
- Los usuarios recibirán un email de confirmación antes de poder acceder

### 3. Configurar URLs de Redirect

1. Ve a **Authentication > URL Configuration**
2. Configura lo siguiente:

**Site URL:**
```
http://localhost:5173
```

**Redirect URLs (añade estas):**
```
http://localhost:5173/auth/callback
http://localhost:5173/**
```

## Paso 2: Verificar Migraciones

Asegúrate de que la migración `001-complete-schema.sql` esté aplicada, ya que contiene el trigger `handle_new_user()` que:

- Crea automáticamente un perfil cuando un usuario se registra
- Sincroniza el email del usuario con la tabla `profiles`
- Se ejecuta tanto para OAuth como para email/password

## Paso 3: Probar el Flujo

### Registro
1. Ve a `http://localhost:5173/register`
2. Completa el formulario:
   - Display Name (opcional)
   - Email
   - Password (mínimo 6 caracteres)
   - Confirm Password
3. Haz clic en "Sign Up"

**Si email confirmation está desactivado:**
- Serás redirigido automáticamente al dashboard

**Si email confirmation está activado:**
- Verás un mensaje: "Check your email to confirm your account!"
- Revisa tu bandeja de entrada (y spam)
- Haz clic en el link de confirmación
- Serás redirigido al dashboard

### Login
1. Ve a `http://localhost:5173/login`
2. Ingresa tu email y contraseña
3. Haz clic en "Sign In"
4. Serás redirigido al dashboard

## Troubleshooting

### "Email not confirmed"
- Si olvidaste desactivar "Confirm email" en desarrollo, ve al Supabase Dashboard
- **Authentication > Users** → encuentra tu usuario → "Confirm email"

### "Invalid login credentials"
- Verifica que el email y contraseña sean correctos
- Si registraste con OAuth (Google/GitHub), no puedes usar email/password con ese email

### Email no llega
- Revisa la carpeta de spam
- En desarrollo, los emails pueden tardar unos minutos
- Para desarrollo, considera desactivar "Confirm email"

### Profile no se crea
- Verifica que el trigger `handle_new_user()` exista en la base de datos:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```
- Si no existe, ejecuta la migración `001-complete-schema.sql`

## Seguridad

### Passwords
- Mínimo 6 caracteres (configurable en el código)
- Supabase hashea automáticamente las contraseñas con bcrypt
- Nunca se almacenan en texto plano

### Email Confirmation
- **Desarrollo**: Desactivado para agilizar pruebas
- **Producción**: SIEMPRE activado para prevenir:
  - Registro de cuentas falsas
  - Abuso del sistema
  - Verificar que el usuario tiene acceso al email

### Rate Limiting
Supabase incluye rate limiting por defecto:
- Máximo de intentos de login por IP
- Máximo de registros por hora

## Recuperación de Contraseña ✅

### Flujo Implementado

1. **Usuario olvida contraseña:**
   - Va a `/login` y hace clic en "Forgot password?"
   - Redirige a `/forgot-password`

2. **Solicitar reset:**
   - Ingresa su email
   - Supabase envía email con link de reset
   - Link válido por 1 hora

3. **Resetear contraseña:**
   - Usuario hace clic en link del email
   - Redirige a `/reset-password`
   - Ingresa nueva contraseña (mínimo 6 caracteres)
   - Contraseña actualizada exitosamente
   - Redirige a `/login`

### Personalizar Email Template

Para personalizar el email de reset:

1. Ve a **Authentication > Email Templates** en Supabase Dashboard
2. Selecciona "Reset Password"
3. Usa el template personalizado de `docs/EMAIL_TEMPLATES.md`
4. Guarda los cambios

Ver documentación completa en `docs/EMAIL_TEMPLATES.md`

---

## Próximos Pasos

### Magic Links (pendiente)
Para login sin contraseña:

1. Llamar a `supabase.auth.signInWithOtp({ email })`
2. Usuario recibe link por email
3. Clic en link → login automático

### 2FA/MFA (pendiente)
Para autenticación de dos factores:

1. Configurar providers de 2FA
2. Implementar TOTP (Time-based One-Time Password)
3. O usar SMS/Email como segundo factor
