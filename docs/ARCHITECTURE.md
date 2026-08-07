# Arquitectura de MyFamily

## Visión general

MyFamily es una aplicación SvelteKit con Supabase como plataforma de identidad, persistencia y almacenamiento. El navegador nunca recibe la clave de servicio. Las peticiones autenticadas usan el token de la sesión y quedan sometidas a RLS.

```text
Navegador
   │ formularios, navegación y fetch autenticado
   ▼
SvelteKit (loads, actions y endpoints)
   │ validación, guardas de módulo y orquestación
   ▼
Supabase (Auth, PostgreSQL, Storage y Edge Functions)
   │ RLS, funciones transaccionales, auditoría y objetos privados
   ▼
Datos de la familia o del ámbito privado autorizado
```

## Capas

- `src/routes`: páginas, layouts, cargas de servidor, acciones y endpoints. Las rutas protegidas validan sesión, pertenencia familiar y disponibilidad del módulo.
- `src/lib/server/<dominio>`: esquemas de entrada, consultas, comandos y presentadores. Esta capa evita concentrar reglas de negocio en las páginas.
- `src/lib/config/modules.ts`: catálogo global y navegación de módulos.
- `src/lib/server/modules/availability.ts`: combina publicación global, preferencia familiar y la frontera futura de entitlement.
- `supabase/migrations`: esquema reproducible, índices, RLS, triggers y funciones transaccionales.
- `supabase/tests/database`: pruebas pgTAP positivas y negativas ejecutadas con identidades distintas.
- `tests/e2e`: recorridos reales en navegador sobre Supabase local.

## Autenticación y autorización

`hooks.server.ts` construye el cliente SSR a partir de cookies y expone una sesión validada. Los layouts protegidos rechazan sesiones ausentes y las operaciones sensibles pueden exigir AAL2. La autorización se aplica en tres niveles complementarios:

1. La UI muestra solo acciones pertinentes para reducir errores.
2. Los loads/actions de SvelteKit validan sesión, rol, familia y módulo.
3. PostgreSQL vuelve a decidir mediante privilegios mínimos, RLS y RPCs con comprobaciones internas.

La UI no es una frontera de seguridad. Una petición directa debe obtener el mismo rechazo que una acción no visible.

## Escrituras y consistencia

Las operaciones multi-paso sensibles —creación de familia, cambios de propiedad, reservas de wishlist, invitaciones y gestión de colecciones— se encapsulan en funciones PostgreSQL. Las funciones `security definer` fijan `search_path`, validan `auth.uid()` y restringen `EXECUTE` a los roles necesarios.

Las listas crecientes usan paginación por cursor. Los adjuntos se suben a buckets privados y se descargan con URLs firmadas. Cuando una escritura combina fila y objeto, el servidor intenta compensar el paso anterior si el siguiente falla.

## Privacidad por dominio

- Familia: `owner`, `admin` y `member` controlan la administración general.
- Gastos: cada colección mantiene su propia ACL, independiente del rol familiar.
- Wishlist: el propietario de un deseo no puede leer reservas, compras ni coordinación asociada a su propio ítem.
- Notas, listas, hábitos, calendario y documentos: sus modelos de visibilidad se evalúan en RLS y en los DTO enviados a la página.
- Módulos: Miembros y Wishlist son núcleo; los módulos publicados opcionales dependen de una preferencia familiar; Juegos permanece bloqueado globalmente.

## Operación

Las migraciones se validan desde una base vacía con `npm run db:reset`. El cierre local se comprueba con `npm run verify`, `npm run test:db` y `npm run test:e2e`. El entorno de producción debe añadir adaptador de despliegue explícito, backups programados, pruebas de restauración, alertas y rotación de secretos.
