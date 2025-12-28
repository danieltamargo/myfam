# Configuración de Email Templates en Supabase

## Acceso a Email Templates

1. Ve a tu proyecto en **Supabase Dashboard**
2. Navega a **Authentication > Email Templates**

## Templates Disponibles

### 1. Confirm Signup (Confirmación de Registro)

**Cuándo se envía:** Cuando un usuario se registra con email/password y "Confirm email" está activado.

**Variables disponibles:**
- `{{ .ConfirmationURL }}` - Link de confirmación
- `{{ .Token }}` - Token de confirmación
- `{{ .TokenHash }}` - Hash del token
- `{{ .SiteURL }}` - URL de tu sitio

**Template por defecto:**
```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

**Template personalizado recomendado:**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">MyFamily</h1>
  </div>

  <div style="padding: 40px 20px; background-color: #f7fafc;">
    <h2 style="color: #2d3748;">Welcome to MyFamily! 👋</h2>

    <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
      Thanks for signing up! Click the button below to confirm your email address and get started.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}"
         style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Confirm Email
      </a>
    </div>

    <p style="color: #718096; font-size: 14px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="color: #667eea; font-size: 12px; word-break: break-all;">
      {{ .ConfirmationURL }}
    </p>

    <p style="color: #a0aec0; font-size: 12px; margin-top: 30px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #a0aec0; font-size: 12px;">
    <p>MyFamily - Organize your family together</p>
  </div>
</div>
```

---

### 2. Reset Password (Recuperación de Contraseña)

**Cuándo se envía:** Cuando un usuario solicita resetear su contraseña desde `/forgot-password`.

**Variables disponibles:**
- `{{ .ConfirmationURL }}` - Link para resetear contraseña
- `{{ .Token }}` - Token de reset
- `{{ .TokenHash }}` - Hash del token
- `{{ .SiteURL }}` - URL de tu sitio

**Template por defecto:**
```html
<h2>Reset Password</h2>

<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

**Template personalizado recomendado:**
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">MyFamily</h1>
  </div>

  <div style="padding: 40px 20px; background-color: #f7fafc;">
    <h2 style="color: #2d3748;">Reset Your Password 🔐</h2>

    <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
      We received a request to reset your password. Click the button below to create a new password.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}"
         style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Reset Password
      </a>
    </div>

    <p style="color: #e53e3e; font-size: 14px; font-weight: bold;">
      ⚠️ This link will expire in 1 hour.
    </p>

    <p style="color: #718096; font-size: 14px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="color: #667eea; font-size: 12px; word-break: break-all;">
      {{ .ConfirmationURL }}
    </p>

    <div style="background-color: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; margin-top: 30px;">
      <p style="color: #742a2a; font-size: 14px; margin: 0;">
        <strong>Didn't request this?</strong><br>
        If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
      </p>
    </div>
  </div>

  <div style="text-align: center; padding: 20px; color: #a0aec0; font-size: 12px;">
    <p>MyFamily - Organize your family together</p>
  </div>
</div>
```

---

### 3. Magic Link (Login sin Contraseña)

**Cuándo se envía:** Cuando implementes magic links (futuro).

**Variables disponibles:**
- `{{ .ConfirmationURL }}` - Link mágico
- `{{ .Token }}` - Token
- `{{ .TokenHash }}` - Hash del token
- `{{ .SiteURL }}` - URL de tu sitio

---

### 4. Change Email Address

**Cuándo se envía:** Cuando un usuario cambia su email desde el perfil.

**Variables disponibles:**
- `{{ .ConfirmationURL }}` - Link de confirmación
- `{{ .Token }}` - Token
- `{{ .TokenHash }}` - Hash del token
- `{{ .SiteURL }}` - URL de tu sitio
- `{{ .NewEmail }}` - Nuevo email
- `{{ .Email }}` - Email anterior

---

## Configuración Adicional

### Subject Lines (Asuntos)

Puedes personalizar los asuntos de los emails:

- **Confirm Signup:** `Confirm your email for MyFamily`
- **Reset Password:** `Reset your MyFamily password`
- **Magic Link:** `Your MyFamily login link`
- **Change Email:** `Confirm your new email for MyFamily`

### Redirect URLs

Los redirect URLs ya están configurados en el código:

- **Confirm Signup:** `/auth/callback` (automático)
- **Reset Password:** `/reset-password`
- **Magic Link:** `/auth/callback`

### Rate Limiting

Supabase incluye rate limiting por defecto:
- Máximo 4 emails de reset por hora por email
- Previene spam y abuso del sistema

---

## Testing

### Desarrollo
1. Configura emails de prueba
2. Usa un servicio como [Mailtrap](https://mailtrap.io) o [MailHog](https://github.com/mailhog/MailHog)
3. O simplemente usa tu email personal para pruebas

### Verificar que funcionan

**Test de Confirmación:**
1. Registra un usuario nuevo en `/register`
2. Revisa tu email
3. Haz clic en el link de confirmación
4. Deberías ser redirigido al dashboard

**Test de Reset:**
1. Ve a `/forgot-password`
2. Ingresa un email registrado
3. Revisa tu email
4. Haz clic en el link de reset
5. Ingresa nueva contraseña
6. Deberías poder hacer login con la nueva contraseña

---

## Solución de Problemas

### Emails no llegan
- Verifica que el proveedor de email esté habilitado
- Revisa la carpeta de spam
- Verifica que la configuración SMTP sea correcta (Supabase usa SendGrid por defecto)
- En el plan gratuito hay límites de emails por hora

### Links expirados
- Los links de reset expiran en 1 hora por defecto
- Los links de confirmación no expiran por defecto
- Puedes configurar esto en Authentication settings

### Emails desde producción
Si planeas usar tu propio dominio de email:
1. Ve a **Project Settings > Auth**
2. Configura SMTP custom
3. Usa servicios como SendGrid, Amazon SES, o Mailgun

---

## Branding Adicional

Para una mejor experiencia:

1. **Logo:** Añade el logo de MyFamily en los templates
2. **Colores:** Usa los colores de tu marca
3. **Footer:** Incluye links a redes sociales, términos, etc.
4. **Idioma:** Los templates soportan i18n si lo necesitas en el futuro

---

## Mejores Prácticas

✅ **Hacer:**
- Usa HTML responsive (compatible con móviles)
- Incluye texto alternativo si el HTML no carga
- Usa colores de alta accesibilidad
- Incluye el link como texto plano además del botón
- Añade contexto (por qué reciben el email)

❌ **No hacer:**
- JavaScript (no funciona en emails)
- CSS externo (usa inline styles)
- Imágenes pesadas
- Links ambiguos sin contexto
