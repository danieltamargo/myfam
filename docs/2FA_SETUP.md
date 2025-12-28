# Two-Factor Authentication (2FA) Setup Guide

## ¿Qué es 2FA?

La autenticación de dos factores (2FA) añade una capa extra de seguridad a tu cuenta. Además de tu contraseña, necesitarás un código de 6 dígitos generado por una aplicación de autenticación.

### Beneficios de 2FA

✅ **Mayor seguridad**: Protege tu cuenta incluso si alguien obtiene tu contraseña
✅ **Prevención de accesos no autorizados**: Solo tú puedes acceder con tu app de autenticación
✅ **Estándar de la industria**: TOTP es usado por Google, GitHub, AWS, y más

---

## Paso 1: Instalar una App de Autenticación

Elige una de estas aplicaciones (todas son gratuitas):

### Recomendadas

**Google Authenticator**
- iOS: https://apps.apple.com/app/google-authenticator/id388497605
- Android: https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2
- ✅ Simple y confiable
- ❌ No tiene backup automático

**Microsoft Authenticator**
- iOS: https://apps.apple.com/app/microsoft-authenticator/id983156458
- Android: https://play.google.com/store/apps/details?id=com.azure.authenticator
- ✅ Backup en la nube
- ✅ Compatible con muchos servicios

**Authy**
- iOS: https://apps.apple.com/app/twilio-authy/id494168017
- Android: https://play.google.com/store/apps/details?id=com.authy.authy
- ✅ Backup multi-dispositivo
- ✅ Sincronización entre teléfono y PC

**1Password / Bitwarden**
- ✅ Si ya usas un gestor de contraseñas
- ✅ Todo en un solo lugar
- ⚠️ Menos seguro si tu vault es comprometido

---

## Paso 2: Habilitar 2FA en MyFamily

1. **Inicia sesión** en MyFamily
2. Ve a tu **Perfil** (click en tu avatar → Profile)
3. Busca la sección "**Two-Factor Authentication (2FA)**"
4. Haz clic en "**Enable 2FA**"

### Escanear el QR Code

1. Se mostrará un código QR en pantalla
2. Abre tu app de autenticación
3. Toca "**+**" o "**Add account**"
4. Selecciona "**Scan QR code**"
5. Apunta la cámara al código QR
6. La app agregará "MyFamily Authenticator"

### Entrada Manual (si no puedes escanear)

Si no puedes escanear el QR:

1. En tu app, selecciona "**Enter a setup key**" o "**Manual entry**"
2. Copia el código secreto mostrado en pantalla
3. Pégalo en tu app
4. Nombre de la cuenta: "MyFamily"
5. Tipo: Time-based (TOTP)

### Verificar y Activar

1. Tu app mostrará un código de 6 dígitos
2. Ingresa ese código en el campo de verificación
3. Haz clic en "**Verify & Enable**"
4. ✅ ¡2FA está ahora activo!

---

## Paso 3: Iniciar Sesión con 2FA

### Flujo de Login

1. Ve a `/login`
2. Ingresa tu **email** y **contraseña**
3. Serás redirigido a `/verify-2fa`
4. Abre tu **app de autenticación**
5. Ingresa el **código de 6 dígitos**
6. El código se verifica automáticamente
7. ✅ ¡Has iniciado sesión!

### Características del Login 2FA

- ⚡ **Auto-submit**: El código se envía automáticamente al completar los 6 dígitos
- 🔄 **Códigos rotativos**: Los códigos cambian cada 30 segundos
- ⏱️ **Tiempo limitado**: Cada código es válido solo por 30 segundos
- ❌ **Un solo uso**: Cada código solo puede usarse una vez

---

## Desactivar 2FA

⚠️ **Advertencia**: Desactivar 2FA hace tu cuenta menos segura.

1. Ve a **Profile**
2. En la sección "Two-Factor Authentication"
3. Haz clic en "**Disable 2FA**"
4. Confirma la acción
5. 2FA estará desactivado inmediatamente

---

## Solución de Problemas

### "Invalid code" al verificar

**Causas comunes:**
- El código expiró (cada 30 segundos cambia)
- Hora del dispositivo incorrecta
- Código ingresado incorrectamente

**Soluciones:**
1. Espera a que se genere un nuevo código
2. Verifica que la hora de tu dispositivo sea correcta
3. Asegúrate de ingresar los 6 dígitos exactos

### Perdí acceso a mi app de autenticación

**Si aún tienes sesión activa:**
1. Ve a tu perfil
2. Desactiva 2FA
3. Configura nuevamente con un nuevo dispositivo

**Si NO tienes sesión activa:**
- Actualmente no hay recuperación automática
- Contacta al administrador del sistema
- **Importante**: Guarda códigos de backup (próximamente)

### El código QR no se escanea

1. Asegúrate de que la cámara tenga permisos
2. Mejora la iluminación
3. Acerca o aleja el teléfono
4. Usa **entrada manual** como alternativa

### Los códigos no funcionan

**Verifica la hora del sistema:**

La autenticación TOTP depende de la hora exacta. Si tu dispositivo tiene la hora incorrecta, los códigos no funcionarán.

**En iPhone:**
Settings → General → Date & Time → Set Automatically (ON)

**En Android:**
Settings → System → Date & Time → Use network-provided time (ON)

---

## Mejores Prácticas

### ✅ Recomendado

1. **Usa una app con backup**: Authy o Microsoft Authenticator
2. **Guarda el código QR**: Toma captura de pantalla y guárdala segura
3. **Configura en múltiples dispositivos**: Escanea el QR con varios dispositivos
4. **Mantén tu app actualizada**: Actualiza tu app de autenticación regularmente

### ❌ Evita

1. **No compartas capturas del QR**: El QR permite acceder a tu cuenta
2. **No uses la misma app sin backup**: Si pierdes el teléfono, pierdes acceso
3. **No dependas de un solo dispositivo**: Ten backup en tablet u otro teléfono

---

## Preguntas Frecuentes

### ¿Qué pasa si cambio de teléfono?

**Antes de cambiar:**
1. Escanea el QR code con el nuevo teléfono (o desactiva y reactiva 2FA)
2. Verifica que funciona en el nuevo dispositivo
3. Solo entonces borra la app del teléfono antiguo

**Si ya cambiaste y no guardaste el QR:**
- Inicia sesión con tu sesión actual (si la tienes)
- Desactiva 2FA
- Reactívala y escanea con el nuevo teléfono

### ¿Puedo usar SMS en vez de una app?

Actualmente no. MyFamily usa TOTP (Time-based One-Time Password) que es:
- ✅ Más seguro que SMS
- ✅ Funciona sin conexión
- ✅ Gratuito (no requiere plan de SMS)

### ¿2FA es obligatorio?

No, 2FA es **opcional** pero **muy recomendado**, especialmente si:
- Eres owner de una familia
- Manejas información sensible
- Accedes desde múltiples dispositivos

### ¿Cuánto tiempo es válido un código?

Cada código es válido por **30 segundos**. Pasado ese tiempo, se genera uno nuevo automáticamente.

### ¿Puedo compartir mi cuenta con 2FA?

No es recomendado. Cada usuario debe tener su propia cuenta. Si necesitas compartir acceso a una familia, invita a otros usuarios como miembros.

---

## Códigos de Backup (Próximamente)

En una futura actualización, implementaremos:

- **Recovery codes**: Códigos de un solo uso para emergencias
- **Backup codes**: Para cuando no tengas acceso a tu app
- **Email recovery**: Opción de desactivar 2FA vía email

Por ahora, asegúrate de:
1. Tener backup de la app de autenticación
2. Guardar captura del QR code en lugar seguro
3. Configurar en múltiples dispositivos

---

## Soporte Técnico

### Funciona con:
- ✅ Google Authenticator
- ✅ Microsoft Authenticator
- ✅ Authy
- ✅ 1Password
- ✅ Bitwarden
- ✅ Cualquier app compatible con TOTP (RFC 6238)

### No funciona con:
- ❌ SMS
- ❌ Email codes
- ❌ Llamadas telefónicas
- ❌ Hardware tokens (por ahora)

---

## Implementación Técnica

Para desarrolladores que quieran entender cómo funciona:

### Tecnología
- **Protocolo**: TOTP (Time-based One-Time Password - RFC 6238)
- **Hash**: SHA-1
- **Dígitos**: 6
- **Período**: 30 segundos
- **QR Code**: otpauth:// URI format

### Flujo de Enrollment

```javascript
// 1. Generar secret y QR
const { data } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'MyFamily Authenticator'
});
// data.totp.qr_code -> QR en base64
// data.totp.secret -> Secret para entrada manual

// 2. Verificar código
const { data: challenge } = await supabase.auth.mfa.challenge({
  factorId
});
await supabase.auth.mfa.verify({
  factorId,
  challengeId: challenge.id,
  code: '123456'
});
```

### Flujo de Verificación en Login

```javascript
// 1. Login normal
await supabase.auth.signInWithPassword({ email, password });

// 2. Verificar si tiene 2FA
const { data: factors } = await supabase.auth.mfa.listFactors();
const hasMFA = factors?.totp?.some(f => f.status === 'verified');

// 3. Si tiene 2FA, pedir código
if (hasMFA) {
  // Redirigir a /verify-2fa
}
```

---

¿Necesitas ayuda? Abre un issue en GitHub o contacta al administrador.
