# Permisos y privacidad

## Roles familiares

| Capacidad | Owner | Admin | Member |
| --- | :---: | :---: | :---: |
| Ver la familia y sus módulos activos | Sí | Sí | Sí |
| Invitar miembros | Sí | Sí | No |
| Cambiar roles familiares | Sí | Limitado a miembros no propietarios | No |
| Activar módulos opcionales | Sí | Sí | No |
| Transferir propiedad | Sí | No | No |
| Eliminar la familia | Sí, con validaciones | No | No |
| Abandonar la familia | Sí, si no deja la familia sin owner | Sí | Sí |

Las invitaciones solo son visibles para la persona destinataria, quien invita y la administración autorizada. Los perfiles públicos exponen únicamente los datos necesarios dentro de familias compartidas.

## ACL de colecciones de gastos

Una colección de gastos es privada incluso para otras personas de la misma familia. Pertenecer a la familia no concede acceso: hace falta una membresía activa en la colección.

| Rol de colección | Ver | Crear gastos | Editar gastos | Categorías, miembros y archivo |
| --- | :---: | :---: | :---: | :---: |
| Owner | Sí | Sí | Todos | Sí; además transfiere propiedad |
| Manager | Sí | Sí | Todos | Sí, sin otorgar ni retirar ownership |
| Contributor | Sí | Sí | Solo los propios | No |
| Viewer | Sí | No | No | No |

Las invitaciones, cambios de rol, transferencia de propiedad, revocación y salida se ejecutan mediante RPCs transaccionales. Un owner no puede abandonar una colección hasta transferirla.

## Wishlist anti-spoiler

Los ítems son visibles para la familia, pero su coordinación es confidencial frente a la persona propietaria del deseo:

- no puede reservar ni comprar su propio ítem;
- RLS oculta reservas, compras, comentarios y menciones asociados a sus ítems;
- el presentador del servidor vuelve a filtrar esos datos antes de construir la página;
- las reservas y compras pasan por RPCs con bloqueo de fila para no superar la cantidad deseada;
- no se renderiza HTML introducido por usuarios.

Ocultar componentes en pantalla no forma parte de esta garantía; la protección está en la base y se prueba con solicitudes directas.

## Visibilidad de contenido

- Calendario: familiar o para miembros seleccionados.
- Listas: ACL propia con roles `owner`, `editor` y `viewer`.
- Notas: familiar, privada o para miembros seleccionados.
- Hábitos: privados o compartidos con miembros seleccionados; no hay clasificación pública.
- Documentos: privados o compartidos de forma explícita; el bucket es privado y las descargas usan URLs firmadas.
- Planner: solo agrega filas que la persona ya puede leer en sus módulos activos.

## Operaciones sensibles

La eliminación de cuenta requiere una sesión AAL2 tanto en SvelteKit como en la Edge Function. Se rechaza si la cuenta es la única propietaria de alguna familia. Los cambios de propiedad y las eliminaciones materiales generan entradas de auditoría cuando corresponde.

## Regla de revisión

Todo cambio de permisos debe incluir al menos un caso permitido y uno denegado con otra familia o ámbito privado. Las nuevas tablas deben habilitar RLS antes de conceder acceso al rol `authenticated`.
