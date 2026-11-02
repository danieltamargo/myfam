# 2FA/MFA con TOTP: estado, uso y requisitos

## Estado actual

MyFamily implementa MFA opcional mediante TOTP de Supabase:

- Enrollment desde el perfil mediante QR o secreto manual.
- Challenge y verificación de códigos de seis dígitos.
- Desactivación de factores desde el perfil.
- Enforcement SSR para cualquier usuario que ya tenga un factor verificado.
- Comprobación AAL2 adicional en operaciones críticas de cuenta y familia.

El hook de servidor consulta `getAuthenticatorAssuranceLevel()` antes de resolver cualquier petición del grupo `(protected)`, incluidas acciones POST y endpoints. Cuando `currentLevel` es `aal1` y `nextLevel` es `aal2`, redirige a `/verify-2fa` y conserva como retorno únicamente una ruta interna validada. La pantalla de challenge está fuera del grupo protegido para evitar bucles. Esta barrera protege la aplicación SvelteKit. La migración `20261031235500_direct_supabase_mfa.sql` extiende la misma decisión al acceso directo mediante políticas restrictivas en tablas y Storage, y guardias en RPC y helpers privilegiados. Conserva las comprobaciones de roles y ACL; AAL2 no otorga permisos adicionales.

Un usuario sin factor verificado obtiene `aal1`/`aal1` y puede seguir usando las rutas protegidas; MyFamily no obliga a enrolar MFA. Esta política es **MFA obligatoria para quien haya optado por activarla**, no MFA obligatoria para todas las cuentas.

## Dos niveles de enforcement

### Acceso general con MFA activada

El enforcement SSR impide que una persona con TOTP verificado evite el challenge mediante:

- acceso directo a una URL protegida;
- retorno desde OAuth;
- navegación después de login con contraseña;
- una sesión AAL1 recuperada o refrescada.

La decisión no depende del flujo cliente de login. El destino solicitado se serializa como `next`, se valida de nuevo en `/verify-2fa` y cae en `/dashboard` si es vacío, externo, protocol-relative, contiene backslashes, codificación ambigua o está mal formado.

### Operaciones críticas que exigen AAL2

El acceso general no sustituye la autorización específica. Estas operaciones mantienen una comprobación AAL2 en servidor y, donde corresponde, también en la frontera que ejecuta la mutación:

- transferencia de propiedad familiar;
- borrado de una familia;
- borrado de cuenta.

Las RPC de transferencia/borrado familiar usan `private.require_aal2()` y la Edge Function de borrado de cuenta comprueba el claim `aal` del token. Las políticas RLS, roles familiares y ACL de cada dominio siguen siendo la frontera definitiva para los datos; AAL2 no concede permisos por sí solo.

`ConfirmationModal` puede mostrar un challenge TOTP para mejorar la experiencia, pero nunca autoriza una operación. Un cliente modificado puede omitir cualquier modal, por lo que el endpoint/RPC debe repetir todas las comprobaciones necesarias.

## Activar TOTP

1. Inicia sesión.
2. Abre el perfil.
3. Selecciona **Enable 2FA**.
4. Escanea el QR con una aplicación TOTP o introduce el secreto manualmente.
5. Introduce el código actual y confirma.

El QR y el secreto permiten clonar el segundo factor. No hagas capturas ni los guardes en texto claro. Usa únicamente las funciones de backup cifrado de tu autenticador o una política de factores adicionales revisada.

Flujo técnico de enrollment:

```ts
const { data } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'MyFamily Authenticator'
});

const challenge = await supabase.auth.mfa.challenge({ factorId: data.id });
await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.data.id,
  code
});
```

## Login y navegación

1. El primer factor (password, OAuth u otro proveedor admitido) crea una sesión AAL1.
2. El hook de servidor comprueba el nivel actual y el siguiente nivel disponible.
3. Una sesión AAL1 con factor verificado se redirige a `/verify-2fa` antes de cargar datos protegidos.
4. Challenge + verify elevan la sesión a AAL2.
5. La persona vuelve al destino interno solicitado o a `/dashboard` como fallback.

Supabase documenta esta matriz:

| Nivel actual | Siguiente nivel | Comportamiento de MyFamily |
| --- | --- | --- |
| `aal1` | `aal1` | Acceso general permitido; no hay factor verificado |
| `aal1` | `aal2` | Challenge obligatorio antes de rutas protegidas |
| `aal2` | `aal2` | Acceso protegido permitido |
| `aal2` | `aal1` | No se fuerza challenge; revisar/refrescar la sesión tras desenrolar |

Referencia: [MFA de Supabase](https://supabase.com/docs/guides/auth/auth-mfa) y [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp).

## Desactivar TOTP

La interfaz permite desenrolar factores desde el perfil. Antes de producción debe validarse el recorrido completo contra la configuración remota, incluida la exigencia del proveedor sobre AAL2, el refresco de sesión posterior, la auditoría y la notificación al usuario.

## Recuperar el acceso

La guía [Recuperación MFA](mfa-recovery.md) documenta el flujo actual: se generan ocho códigos de un solo uso de 128 bits y se guardan únicamente como hashes. Para cuentas con contraseña y un código previamente guardado, el autoservicio exige una sesión limitada, una barrera de sesión vigente y completar una nueva contraseña más TOTP; la recuperación no simula ni concede AAL2. Si hay OAuth únicamente, no quedan códigos o falla un paso intermedio, se requiere el runbook seguro de operador.

La verificación de identidad por el operador y su proceso de soporte siguen pendientes de validación operativa real. También quedan pendientes SMTP y las notificaciones de seguridad; no se afirma que estén configurados. No se implementan SMS ni códigos de hardware.

## Matriz mínima de pruebas

| Caso | Resultado esperado |
| --- | --- |
| Usuario sin factor + sesión AAL1 | Accede a rutas protegidas según roles/RLS |
| Usuario con factor + sesión AAL1 | Redirección SSR al challenge |
| Usuario con factor + sesión AAL2 | Acceso protegido permitido |
| Acceso directo a `/dashboard` con AAL1 elevable | Redirección antes de consultar datos |
| Acceso a `/verify-2fa` | No entra en un bucle SSR |
| `next` externo, codificado o con backslash | Fallback `/dashboard` |
| POST crítico directo con AAL1 | Rechazado sin mutación |
| Refresh de sesión | La siguiente carga SSR vuelve a evaluar AAL |
| Código inválido, expirado o reutilizado | Rechazado sin filtrar detalles sensibles |

Las pruebas unitarias cubren las decisiones SSR y la validación del retorno. La integración focal posterior añadió TOTP real contra Supabase local. El recorrido con OAuth real sigue pendiente de credenciales del proveedor.

## Alcance funcional

MyFamily usa TOTP mediante una aplicación autenticadora y códigos de recuperación almacenados como hashes; el segundo factor sigue siendo TOTP. No se implementan SMS ni códigos de hardware. Cualquier aplicación compatible con TOTP/RFC 6238 puede funcionar, pero su backup y seguridad pertenecen al usuario y al proveedor de esa aplicación. Para los límites y pasos de recuperación, consulta [Recuperación MFA](mfa-recovery.md).

## Verificación del acceso directo

`supabase/tests/database/095_direct_mfa.test.sql` pasó 68 aserciones; la suite DB coordinada pasó 856 en 28 archivos también después del reinicio. Comprueba la frontera MFA con factores verificados, sesiones AAL1/AAL2, RPC, Storage y bypass administrativo. La integración focal Auth/MFA posterior pasó 4/4 en escritorio y móvil, incluido TOTP real: factor sin verificar, factor verificado y bloqueo del token AAL1 anterior en DB/RPC/Storage, acceso AAL2, rechazo de externo y acceso AAL1 restaurado tras desenrolar.

Los eventos DELETE de Postgres Changes en Realtime no aplican RLS. Las URLs de Storage firmadas previamente siguen siendo válidas hasta su caducidad; activar MFA no las revoca inmediatamente. Sigue pendiente validar OAuth real con credenciales del proveedor y operar el procedimiento de verificación de identidad con soporte real.
