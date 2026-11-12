# Catálogo de módulos

## Estados

- `core`: siempre disponible y no deshabilitable por una familia.
- `available`: publicado; owner/admin o un miembro con capacidad delegada decide si aparece y si sus rutas aceptan acceso.
- `preview`: reservado para una futura vista informativa, sin acceso funcional actual.
- `disabled`: bloqueado globalmente, aunque exista una fila familiar con `enabled = true`.

## Catálogo actual

| Módulo | Estado global | Preferencia familiar | Comportamiento |
| --- | --- | --- | --- |
| Miembros | `core` | No | Personas, invitaciones y roles |
| Wishlist | `available` | Sí | Deseos, recibido, histórico privado y revelado explícito |
| Gastos | `available` | Sí | Colecciones privadas, análisis, repartos, recurrencias y evento opcional por gasto |
| Calendario | `available` | Sí | Eventos, recurrencias y sincronización automática con Google y Microsoft mientras la vista está abierta |
| Tareas | `available` | Sí | Responsables, vencimientos y estados |
| Listas | `available` | Sí | Listas compartidas o privadas |
| Notas | `available` | Sí | Visibilidad familiar, privada o seleccionada |
| Planner | `available` | Sí | Agregación autorizada de actividad próxima |
| Comidas | `available` | Sí | Recetas y planificación semanal |
| Hábitos | `available` | Sí | Seguimiento privado o seleccionado |
| Documentos | `available` | Sí | Archivos privados con acceso explícito |
| Juegos | `available` | Sí | Tres en raya, Wordle, reacción y colores con protocolo de servidor; código heredado bloqueado |

## Resolución de acceso

El acceso se decide en este orden:

1. El catálogo global debe publicar el módulo.
2. Los módulos `core` quedan habilitados.
3. Un proveedor de entitlement puede participar en el futuro; el proveedor actual, sin billing, permite todos los módulos publicados.
4. Un módulo `available` necesita una preferencia familiar habilitada.

La navegación usa el mismo resultado, pero cada loader, action y endpoint vuelve a ejecutar la guarda. Desactivar un módulo hace que su URL directa responda como no disponible.

`family_modules` contiene preferencias, no derechos comerciales. La interfaz futura para integrar entitlements está descrita en [MODULE_ENTITLEMENT_PROVIDER.md](MODULE_ENTITLEMENT_PROVIDER.md).

## Administración

Owner, admin y miembros con `can_configure_modules` pueden cambiar módulos opcionales desde `Configuración → Módulos`. Solo owner delega esa capacidad. El resto de miembros ve el estado en modo lectura. Solo Miembros permanece siempre activo; Wishlist y Juegos son opcionales.

La migración de Wishlist añade una preferencia habilitada a las familias existentes que no la tengan y conserva cualquier preferencia explícita, incluida `false`. Las familias nuevas comienzan con Wishlist habilitada. Desactivarla oculta su navegación y bloquea sus rutas y acciones sin borrar sus datos.

## Añadir un módulo

1. Incorporar el identificador al catálogo y a la restricción de base de datos.
2. Crear tablas, índices, RLS y RPCs siguiendo privilegios mínimos.
3. Añadir la guarda a loaders, actions y endpoints, incluida la URL directa.
4. Implementar estados de carga, vacío, error y reintento a 390 px y 1280 px.
5. Añadir pruebas unitarias, pgTAP y E2E con acceso permitido y denegado.
6. Traducir todas las cadenas y actualizar esta documentación.
