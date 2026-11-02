# Recuperación del segundo factor

La recuperación automática está disponible para cuentas con contraseña que hayan guardado códigos previamente. Una cuenta que solo usa OAuth, una cuenta sin códigos o una recuperación que haya fallado después de consumir el código necesita intervención del operador. El formulario no sustituye la comprobación de identidad de ese procedimiento.

## Preparar y usar los códigos

1. En el perfil, verificar el autenticador y abrir **Códigos de recuperación**.
2. Generar ocho códigos y guardarlos fuera de MyFamily. Solo se muestran en la respuesta de generación; volver a cargar la página no los recupera. Generar otro lote revoca el anterior. Se pueden revocar sin generar otro lote.
3. Si se pierde el autenticador, iniciar sesión con contraseña y elegir **Usar un código de recuperación** en la pantalla del segundo factor.
4. Introducir la contraseña actual, un código guardado y una contraseña nueva distinta de al menos 12 caracteres.
5. Configurar y verificar un nuevo autenticador en la misma sesión y completar la recuperación. Generar y guardar otro lote de códigos.

Los códigos contienen 128 bits aleatorios. El servidor conserva únicamente sus hashes SHA-256 en tablas privadas. Al consumir uno se revoca todo el lote. La contraseña y los códigos no se guardan en auditorías ni se devuelven desde consultas. No deben copiarse a incidencias, capturas, registros ni Git.

## Controles de acceso

La recuperación bloquea la cuenta en una transacción antes de modificar Auth. Un bloqueo por usuario serializa consumo y sustitución del lote. Solo el servidor puede consumir un código o ligar una sesión de recuperación. La generación y la revocación exigen el segundo factor real y pertenecen al usuario autenticado.

El servidor cierra globalmente las sesiones, cambia la contraseña, elimina los factores mediante la API administrativa oficial de GoTrue y obtiene una sesión nueva con la contraseña nueva. Esa sesión se liga mediante un identificador de trabajo de un solo uso. Durante la recuperación, otras sesiones no pueden acceder a los datos ni completarla, aunque presenten un JWT AAL2.

El código de recuperación no produce AAL2. El usuario alcanza AAL2 al verificar el nuevo autenticador mediante GoTrue. La función de finalización exige ese AAL2, la sesión ligada y una sesión Auth vigente. Al finalizar permanece un límite temporal por cuenta: las sesiones anteriores a la recuperación y las sesiones revocadas siguen rechazadas aunque su JWT no haya caducado. Las cuentas que nunca se han recuperado mantienen la política anterior.

La prueba local también comprobó que el JWT AAL2 antiguo no puede cambiar la contraseña ni registrar otro factor mediante la API de Auth después de verificar el nuevo autenticador: ambas operaciones recibieron 403. Las URLs de archivos firmadas antes de recuperar siguen siendo válidas hasta su vencimiento; la recuperación no revoca esos enlaces.

Se auditan la generación, la revocación, el inicio y la finalización sin incluir secretos. El cambio de contraseña y las llamadas Auth no forman una transacción con Postgres. Un fallo intermedio conserva el bloqueo, consume el lote y requiere al operador. No se vuelve a habilitar AAL1 como alternativa.

## Procedimiento del operador para una recuperación interrumpida

Realizarlo únicamente tras verificar la identidad por un canal independiente ya establecido y registrar la autorización. Una sesión AAL1, conocer el correo o solicitar ayuda por sí solos no acreditan la identidad. No pedir contraseñas ni códigos por chat. Usar las credenciales administrativas existentes solo en un proceso de servidor, sin imprimirlas ni guardarlas en comandos, historial o registros.

1. Consultar `private.mfa_recovery_state` y `private.mfa_recovery_audit` para el usuario exacto. Confirmar el inicio y la ausencia de finalización. No borrar el estado ni su límite temporal y no establecer `required = false` para desbloquear.
2. En una transacción administrativa sobre las tablas de la aplicación, bloquear la fila del usuario con `FOR UPDATE`; generar un UUID de trabajo nuevo y establecer `required = true`, `pending = true`, `allowed_session_id = null`, `job_id = <UUID nuevo>` y `started_at = clock_timestamp()`. Borrar sus códigos anteriores. Registrar `recovery_started`. Si aún no existe la fila, crearla con esos mismos valores. No escribir en ninguna tabla del esquema `auth`.
3. En un proceso seguro con participación del titular, establecer una contraseña nueva mediante `auth.admin.updateUserById`. Para una cuenta OAuth que no tenía contraseña, este paso establece el primer factor necesario; requiere la misma verificación independiente de identidad. La nueva contraseña se entrega o introduce por un canal privado fuera de registros.
4. Obtener una sesión efímera con `auth.signInWithPassword` y la contraseña nueva; usar su JWT para `auth.admin.signOut(jwt, 'global')`. Comprobar el resultado. Consultar los factores con `auth.admin.mfa.listFactors({ userId })` y eliminar cada uno con `auth.admin.mfa.deleteFactor({ userId, id })`. Comprobar cada resultado y detenerse ante cualquier fallo. No modificar `auth.mfa_factors` ni `auth.sessions` mediante SQL.
5. En el navegador privado del titular, iniciar sesión con la contraseña nueva. Desde el proceso administrativo obtener y validar esa sesión con `auth.getUser(jwt)`; comprobar que el usuario coincide y tomar el `session_id` del JWT validado. Ligar exclusivamente esa sesión con `bind_mfa_recovery_session(p_user_id, p_job_id, p_session_id)`. Esta función comprueba el trabajo pendiente y que Auth creó la sesión después del límite temporal. No copiar el JWT a incidencias ni a registros.
6. El titular abre `/recover-2fa/setup`, configura y verifica su nuevo autenticador, completa la recuperación y guarda un lote nuevo de códigos. Confirmar el evento `recovery_completed`. Si se pierde esta sesión o falla otro paso, volver al paso 2 con un trabajo nuevo, manteniendo el bloqueo hasta entonces.

El operador puede inspeccionar los eventos de las tablas privadas mediante acceso administrativo a la base. Estas tablas y las funciones de consumo/vinculación no están disponibles para clientes autenticados normales. Una copia restaurada de la base recupera también el estado de recuperación que contuviera la copia; considerar ese hecho al responder a incidentes.

Antes de promover una restauración, invalidar los lotes de códigos recuperados: una copia antigua puede contener códigos que se consumieron después de capturarla. Los titulares generarán otros lotes tras verificar su autenticador. Revisar también las sesiones y claves que deban revocarse por el incidente, manteniendo los bloqueos de recuperación que correspondan.

## Referencias de Auth

- [Eliminar un factor con la API administrativa](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor).
- [Cierre de sesión y vigencia residual de los JWT](https://supabase.com/docs/guides/auth/signout).
- [Sesiones y comprobación de `session_id`](https://supabase.com/docs/guides/auth/sessions).
- [Verificación MFA y niveles AAL](https://supabase.com/docs/guides/auth/auth-mfa).
