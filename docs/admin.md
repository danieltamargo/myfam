# Administración de usuarios

El registro público está cerrado. Solo los UUID incluidos en `SUPER_ADMIN_USER_IDS` (separados por comas en el entorno privado del servidor) pueden abrir `/admin`. Los roles de una familia y los metadatos del usuario no conceden este permiso. Una lista vacía o mal formada no concede acceso a nadie. Reinicia la aplicación después de modificarla.

Para preparar la primera cuenta, después de aplicar las migraciones y configurar SMTP:

```sh
node scripts/bootstrap-admin.mjs /ruta/privada/app.env administrador@tu-dominio.es
```

El archivo debe tener permisos `600`. El script busca una cuenta existente por correo o invita a una nueva y añade su UUID a la lista privada. No modifica la contraseña de una cuenta existente. No lo ejecutes con un correo que no controles: ese usuario recibirá acceso administrativo cuando verifique su segundo factor. La creación inicial figura en la auditoría de Supabase Auth. Ningún correo se envía durante las pruebas locales automatizadas.

La cuenta inicial debe establecer su contraseña desde el correo y activar la verificación en dos pasos desde su perfil. Todas las lecturas y acciones del panel exigen una identidad verificada por Supabase y una sesión AAL2. El panel permite invitar, habilitar, deshabilitar y reenviar un enlace para establecer contraseña. El enlace de bienvenida usa el origen de confianza de la aplicación y `/reset-password`; incluye ese destino en las URL de redirección permitidas de Supabase Auth. La entrega depende del servicio SMTP y de los límites de Auth. Una invitación no incorpora al usuario a ninguna familia.

No puedes deshabilitar tu cuenta ni otra cuenta de superadministrador. Para retirar a otro administrador, elimina primero su UUID del entorno y reinicia la aplicación. Deshabilitar mantiene sus datos y bloquea las nuevas autenticaciones. Las políticas SQL y las funciones protegidas consultan `auth.users.banned_until` en cada petición para bloquear también los JWT emitidos antes del cambio. Habilitar restablece el acceso a sesiones que sigan vigentes. Las URL firmadas de descarga ya emitidas siguen siendo utilizables hasta su caducidad; deshabilitar no retira archivos previamente descargados.

Cada mutación del panel registra un evento `pending` antes de llamar a Auth y después `succeeded` o `failed`. Si falla el primer registro, no se ejecuta la operación. Si falla el registro final, el panel muestra un error explícito para que compruebes el estado antes de repetir. Una interrupción del servidor puede dejar un evento `pending`; no implica éxito ni fracaso. El correo y su entrega no forman una transacción con la base de datos.

La actividad de negocio muestra únicamente campos de identificación y acción, sin contenido ni metadatos. Los eventos de Auth pasan por una función SQL exclusiva del rol de servicio que devuelve fecha, acción e identificador UUID del actor, sin tokens, correos, IP ni el contenido original. Los registros proceden de los eventos que generan Auth y cada módulo; no constituyen un historial de todas las peticiones HTTP. Las tres listas tienen páginas de 25 elementos y una ventana máxima de 9.999 páginas.
