# Prueba manual de MyFamily en local

## Arranque

Desde `develop`, con Docker Desktop iniciado y las dependencias de Node instaladas:

```powershell
supabase start -x edge-runtime,vector,logflare
supabase migration up --local
docker compose -f compose.antivirus.yaml up -d
python scripts/seed-local.py
pnpm mvp:local
```

El script de carga usa Python con `openpyxl>=3.1` y PostgreSQL CLI (`psql`). Lee `supabase/seed.private.json` y `docs/Lista de regalos .xlsx`. Ambos archivos son privados. Puedes elegir otras rutas con `--config` y `--workbook`.

La configuración contiene `officialName`, `alias`, `testPassword` y `members`. Cada miembro tiene `name`, `email` y `role`, con una persona propietaria. Las claves opcionales son `birthday` en formato ISO, `locale`, `sheet`, `skipRows` y `gifts`. `gifts` permite indicar por fila `name`, `description`, `link`, `quantity` o `pictureRow`. Las fechas completas se conservan en la configuración privada y la aplicación almacena mes y día para los avisos familiares.

Si ya existía una carga local con un propietario provisional, `legacyOwnerEmail` permite sustituir esa membresía por la persona propietaria de la configuración conservando los datos familiares.

Una carga nueva prepara Mabuceta con Wishlist y deja Test con todos los módulos activos. La carga conserva los cumpleaños ya registrados y los estados de regalos existentes. Si falta una imagen importada, ClamAV debe escuchar en el puerto local 3310 para analizarla antes de adjuntarla.

- Aplicación en [localhost:5173](http://localhost:5173).
- Mailpit en [localhost:54324](http://localhost:54324). Usa la dirección que imprime `supabase status` si el puerto es distinto.
- Test tiene las cuentas `myfamily-test-owner@example.com`, `myfamily-test-admin@example.com` y `myfamily-test-member@example.com`. Usa `myfamily-test-outsider@example.com` para comprobar el acceso desde fuera de la familia y recibir una invitación en inglés. Las cuatro comparten el valor `testPassword` de la configuración local.
- Para entrar en Mabuceta con la cuenta real, usa **¿Has olvidado tu contraseña?** y abre el enlace capturado en Mailpit. La cuenta real no usa la contraseña de Test.

## Lista de prueba

| Apartado | Pasos | Resultado esperado |
| --- | --- | --- |
| Acceso | Entra con una cuenta de Test. Prueba un error de contraseña, la recuperación y el enlace de correo. | El mensaje de error es genérico. El enlace permite cambiar la contraseña y volver a entrar. |
| Familias y módulos | Entra como propietario, administrador y miembro. Abre el selector, visita los ajustes y desactiva temporalmente un módulo de Test. | Los cambios de permisos afectan al menú y a las URL directas. Un miembro sin permiso no puede cambiar ajustes. |
| Miembros | Invita a una cuenta local existente ajena a Test y acepta desde su panel. | La invitación aparece en el panel y en Mailpit. La cuenta pasa a ser miembro al aceptar. |
| Wishlist | Abre el regalo de prueba como propietario. Cancela y luego confirma el aviso de spoilers. Marca el regalo recibido. | Solo se resalta tras confirmar. Pasa al histórico privado y se conserva la compra con comprador desconocido. |
| Calendario | Crea y edita un evento recurrente, limita su visibilidad y configura un recordatorio. | Los participantes autorizados ven el evento. Otra cuenta de Test queda excluida si no fue seleccionada. |
| Google y Outlook | Con credenciales locales de cada proveedor, conecta un calendario y cambia un evento en el proveedor. Mantén abierta la vista. | La vista recoge el cambio sin repetir sincronizaciones consecutivas. Las credenciales del proveedor son necesarias para esta prueba. |
| Gastos | Registra y reparte un gasto en una colección. Vincúlalo a un evento visible y registra una liquidación. | El reparto y el saldo se actualizan. Las personas ajenas a la colección no ven el gasto. |
| Tareas | Crea una tarea, asigna responsable y fecha y márcala completada. | La tarea refleja el cambio y aparece al responsable según sus permisos. |
| Listas | Crea una lista, añade un artículo y márcalo comprado. | Los cambios persisten al volver y la visibilidad configurada se respeta. |
| Notas | Crea una nota privada y otra visible para un miembro concreto. | Cada cuenta ve solo lo que le corresponde. |
| Planner | Vuelve al panel tras crear una tarea y un evento próximos. | La agenda reúne los elementos próximos a los que esa cuenta tiene acceso. |
| Comidas | Crea una receta, añádela al plan semanal y manda sus ingredientes a una lista. | La receta aparece en el día seleccionado y los ingredientes en la lista. |
| Hábitos | Crea un hábito privado, registra el día y cambia de cuenta. | El registro persiste y el hábito sigue siendo privado. |
| Documentos | Sube un documento de prueba y concede acceso a un miembro. | ClamAV analiza el archivo. El enlace funciona para quien tiene acceso. |
| Juegos | Crea una sala en una cuenta y entra con otra. Prueba una partida. | Los dos jugadores ven el mismo turno y resultado. |
| UI e idiomas | Prueba a 320, 768 y 1280 px. Abre modales con teclado, cierra con Escape y cambia de idioma. | Los formularios y las acciones quedan visibles. El idioma de acceso y navegación persiste al recargar. |

## Correo

`pnpm mvp:local` ejecuta un proceso local que revisa cada minuto las invitaciones pendientes y los recordatorios que corresponden. El registro de entregas evita volver a enviar los ya procesados. Usa un solo proceso de envío por base local.

```powershell
node scripts/local-mail.mjs --preview
node scripts/local-mail.mjs --auth-preview
```

El primer comando genera ejemplos de invitación familiar, aviso de calendario y avisos de Wishlist por cumpleaños y evento en ambos idiomas. El segundo usa cuentas ficticias para disparar la bienvenida y la recuperación de Supabase Auth. El alta pública sigue cerrada y la bienvenida es el flujo de incorporación. Los cuerpos de los correos de Auth se eligen por idioma del destinatario, con asuntos bilingües. Las vistas previas usan una URL de entrada genérica. Para verificar un enlace de negocio, crea la invitación o el evento desde la aplicación y abre el mensaje generado.

Si la bienvenida o la recuperación aparecen con las plantillas predeterminadas al iniciar la pila, reinicia el contenedor `supabase_auth_…` de este proyecto después de que Kong esté listo y repite `--auth-preview`. [Incidencia en Supabase CLI](https://github.com/supabase/cli/issues/4668).
