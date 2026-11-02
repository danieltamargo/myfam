# Avisos de cumpleaños

En cada familia, la pestaña **Cumpleaños** permite guardar el día y el mes de sus miembros reales. Cada miembro puede editar o eliminar su propia fecha; el propietario y los administradores pueden gestionar las de toda la familia. Las fechas son opcionales y solo se comparten dentro de esa familia. No se guarda el año de nacimiento.

Los avisos aparecen sobre el contenido familiar desde 14 días antes, incluido el propio día, y se ordenan por proximidad. Se calculan en la zona `Europe/Madrid`, incluso cuando el servidor usa UTC. Los cumpleaños del 29 de febrero se observan el 28 en años no bisiestos. La información se actualiza al recargar los datos de la página y tras guardar una fecha.

Cada enlace **Ver wishlist** abre la lista con `?member=<id>` para seleccionar al miembro mediante el filtro existente. No se consultan regalos, reservas, compras ni comentarios para calcular avisos. Los avisos y su configuración se ocultan si Wishlist no está disponible.

La categoría familiar «Cumpleaños» de Wishlist no identifica a una persona. Por eso su `event_date` no se utiliza como cumpleaños ni se deducen fechas a partir de nombres o categorías. No hay datos iniciales inventados: hay que introducir las fechas conocidas en la nueva pestaña.

Aplicar la migración `20261101030000_family_member_birthdays.sql` con el resto de migraciones antes de usar esta función. La tabla usa permisos de sesión del usuario, RLS por familia, validación de días y meses, requisito MFA y una referencia a la pertenencia familiar. Al retirar un miembro se elimina su fecha de esa familia. No se envían correos ni se crean notificaciones persistentes a partir de estos avisos.

La interfaz conserva los colores, tipografía y controles DaisyUI existentes. La lista con separadores agrupa fechas sin añadir tarjetas decorativas; el color primario identifica los enlaces a Wishlist. Las filas se apilan en pantallas pequeñas. Dirección: ENERGY 1 / RHYTHM 1 / MOTION 1.
