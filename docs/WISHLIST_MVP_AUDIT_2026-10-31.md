# Auditoría de wishlist y permisos del MVP

Fecha: 31 de octubre de 2026. Revisión del código y las pruebas del repositorio; no certifica el estado de una instancia desplegada ni la aplicación de sus migraciones.

## Resultado

La wishlist implementa altas, edición, borrado, categorías de ocasión, imágenes privadas, reservas, compras por cantidad y comentarios de coordinación. Esta intervención añade recibido, histórico privado y revelado explícito de compradores, cierra el canal indirecto al reducir cantidades y hace atómico el guardado de datos y asociaciones. Deseos y colecciones de gastos admiten un evento real opcional, preservando su audiencia. La importación Excel sigue pendiente.

## Requisitos y evidencia

| Requisito | Estado observado | Evidencia |
| --- | --- | --- |
| Lista propia y listas de familiares | Implementado en código | `src/lib/server/wishlist/queries.ts:125`; `src/routes/(protected)/family/[familyId]/wishlist/+page.svelte` |
| Coordinar sin enseñar comprador ni reservas al destinatario | Implementado, incluida reducción de cantidades sin consultar coordinación | RLS, filtro defensivo del presentador y `20261031012000_wishlist_quantity_privacy.sql` |
| Asociar ocasiones o dejarlo genérico | Implementado | Categorías genéricas existentes más un evento real opcional mediante `gift_calendar_event_links`; selector de eventos visibles y guardado atómico. Las colecciones usan `expense_collection_event_links` con autorización propia |
| Marcar recibido y retirarlo de las listas de todos | Implementado | RPC `mark_gift_item_received` con pertenencia, propietario, versión y bloqueo; acción en detalle; presentador excluye recibidos; RLS impide acceso de terceros, incluidas nuevas firmas de imágenes |
| Histórico con comprador oculto hasta pedir revelarlo | Implementado | Histórico propio con campos mínimos; RPC `reveal_received_gift_buyers` solo para el destinatario familiar y regalos recibidos; botón explícito de spoiler; compra directa permanece oculta incluso después de revelar |
| Importar Excel con personas y correo | Pendiente | `src/lib/wishlist/export.ts` exporta JSON de la lista propia; no existe importador, previsualización ni conciliación de destinatarios |
| Importar comprado con comprador desconocido | Pendiente | `gift_purchases.purchased_by` es obligatorio; `purchase_gift_item` identifica al comprador mediante `auth.uid()`. No hay representación explícita de comprador desconocido |

## Hallazgos iniciales y resolución

### P1 resuelto. La edición de cantidad permitía inferir coordinación oculta

`private.enforce_gift_item_capacity`, en `supabase/migrations/20260805100000_wishlist_hardening.sql:91`, suma reservas y compras como `SECURITY DEFINER` y rechaza reducciones por debajo de ese total. El destinatario puede probar cantidades menores y distinguir éxito de error aunque RLS le oculte las filas. No revela directamente el nombre del comprador, pero permite inferir que existe coordinación y acotar su cantidad.

La prueba original `010_wishlist_rls.test.sql` esperaba un error `23514` al reducir por debajo de la coordinación oculta. Se actualiza para exigir éxito y se añade comparación con un regalo sin coordinación en `013_wishlist_quantity_privacy.test.sql`.

Semántica aplicada: el dueño puede reducir la cantidad sin consultar reservas ni compras. Las asignaciones existentes se conservan, la disponibilidad mínima es cero y las RPC siguen impidiendo nuevas asignaciones por encima del objetivo. Solo los coordinadores ven el aviso de exceso; el dueño recibe los mismos datos y resultado haya o no coordinación.

### P1 resuelto. Faltaba el flujo de recibido oculto

Originalmente se devolvían todos los estados a todos los familiares y solo se filtraban visualmente. Ahora `fulfilled` representa recibido: el presentador lo excluye de las listas ordinarias para todos y entrega al dueño únicamente los campos mínimos del histórico. La política `gift_items_select_family` oculta esos regalos a terceros; las políticas relacionadas heredan la exclusión. La política de Storage también impide nuevas firmas de imágenes recibidas a terceros.

Las compras y reservas recibidas se conservan; `release_gift_item` rechaza su liberación para preservar el histórico. La transición usa versión y bloqueo de fila, por lo que serializa con coordinación concurrente.

### P2 resuelto. Cambiar regalo y categorías no era atómico

El flujo original actualizaba datos y después sustituía categorías en peticiones independientes. Ahora creación y edición llaman únicamente a `save_wishlist_item`, que comprueba propietario, familia, versión, categorías y evento real antes de modificar el recurso. Datos y enlaces se escriben en la misma transacción; un fallo conserva campos, versión y asociaciones previas, sin compensaciones del cliente.

`20261031210000_resource_calendar_links.sql` añade la RPC, tablas separadas con claves familiares y protección de regalos recibidos frente a edición, incluida la API directa. Conserva los permisos DML anteriores para scripts compatibles; la aplicación utiliza el guardado transaccional. Los conflictos nuevos usan `PT409` para evitar reintentos de transacción del servidor de API.

### P2 resuelto. El histórico necesitaba un contrato de revelado

El histórico nunca reutiliza `allPurchases`. Un envío explícito al pulsar «Revelar comprador (spoiler)» invoca una RPC que verifica identidad, pertenencia y estado recibido. Devuelve nombre público, unidades y fecha; no expone correos ni notas internas. No modifica RLS de compras ni guarda un desbloqueo permanente: una recarga completa vuelve a ocultar al comprador.

La consulta histórica se ejecuta solo al abrir `view=history`, con propietario, familia y estado recibidos como filtros de servidor. Devuelve 50 regalos por página, campos mínimos y navegación anterior/siguiente. La carga ordinaria excluye `fulfilled` en SQL y recorre lotes explícitos de 500 para evitar el truncamiento silencioso de 1.000 filas sin limitar los filtros globales existentes.

Una revisión adicional detectó que los antiguos RPC de compra/reserva comprobaban estado antes de autorización. `20261031150000_wishlist_coordination_authorization.sql` invierte ese orden: un externo obtiene idéntico error para regalos activos, recibidos e inexistentes. La regresión comprueba código y mensaje en ambos RPC.

### P2 resuelto. Ocasión y evento real se asocian por separado

Las categorías de ocasión siguen siendo opcionales y no representan eventos reales. Cada regalo o colección admite además un evento de `calendar_events` de la misma familia. Las nuevas tablas de vínculo solo muestran metadatos a quien puede ver tanto el recurso como el evento: un regalo compartido no publica el UUID de un evento privado y el owner familiar no obtiene acceso a colecciones privadas.

La edición usa acciones explícitas `keep`, `replace` y `clear`. Guardar otros campos conserva una asociación que el editor haya dejado de poder ver; no expone su existencia. Solo una selección o desvinculación explícita cambia la relación. En colecciones, la acción separada exige rol propio owner/manager y los ajustes generales no alteran el vínculo.

## Permisos y módulos relacionados

| Área | Contrato observado | Evidencia y límite |
| --- | --- | --- |
| Familia | Roles `owner`, `admin`, `member`; invitación por owner/admin; cambio de roles y expulsión por owner; transferencia y borrado con AAL2 | `members/+page.server.ts`, `supabase/migrations/20260805091000_atomic_family_operations.sql`, `supabase/tests/database/001_family_roles_rls.test.sql`. Pruebas de un solo owner, bloqueo de escalada y aceptación con rol fijo |
| Wishlist | Cada usuario gestiona sus regalos; otros familiares coordinan; el rol familiar no concede acceso a coordinación del destinatario | Migración de hardening y `010_wishlist_rls.test.sql`; comprador/reservante no puede ser el dueño; RPC serializan coordinación con bloqueo de fila |
| Gastos | Colecciones privadas con membresía propia, diferente del rol familiar | `src/lib/server/expenses/commands.ts`, `020_expenses_rls.test.sql`, `021_expenses_aggregates.test.sql`. El test exige que el owner familiar no tenga acceso implícito a colecciones ni gastos ajenos |
| Listas | Visibilidad familiar, privada o para miembros seleccionados; los administradores familiares no reciben acceso implícito a listas privadas | `src/lib/server/lists/commands.ts`, `040_tasks_lists_rls.test.sql:357`; creación y cambios por RPC |
| Eventos | Visibilidad familiar o seleccionada, participantes, control de versión y recurrencias | `src/lib/server/calendar`, `030_calendar_rls.test.sql`; el usuario externo no debe leer eventos y los participantes de eventos ocultos también permanecen ocultos |
| Juegos | Desactivados globalmente; código conservado | `src/lib/config/modules.ts`, `requireModuleAvailable('games')` en rutas y acciones, `20260805092000_disable_games.sql`, `003_games_disabled.test.sql`. No se consideran funcionalidad disponible del MVP |

Wishlist y miembros son módulos centrales no desactivables por la familia. Los módulos opcionales pasan por `guardModuleActions`; calendario y gastos comprueban además disponibilidad familiar en sus cargas. `src/lib/server/modules/availability.ts` usa un proveedor sin facturación que permite los módulos publicados: no hay cobro, suscripción ni prueba de monetización implementados por ese proveedor.

## Revisión anti-slop de la interfaz por código

La vista de tarjetas usa una rejilla uniforme, bordes y sombras para cada regalo (`WishlistCards.svelte`). Es una estructura genérica de catálogo, pero aquí tiene un propósito concreto: comparar objetos de una misma colección. Además ofrece una vista de tabla para mayor densidad y distingue regalos propios mediante anillo y texto. No se propone cambiarla por motivos estéticos sin evidencia de uso.

El encabezado mantiene dos acciones concretas, «Añadir regalo» y «Exportar mi lista», sin estadísticas ni testimonios inventados (`WishlistHeader.svelte`). Las nuevas acciones explican recibido y revelado de forma explícita y reutilizan el estilo existente. El estado vacío contextual y los controles con `aria-pressed` constan en el código; no se ha certificado contraste real ni accesibilidad completa. Esta sección es inspección de implementación, no una auditoría visual completa.

## Implementación propuesta para cerrar wishlist

1. Completado: cerrar el canal indirecto de cantidades con una regla uniforme y comparación con/sin coordinación.
2. Completado: RPC transaccional de alta/edición, categorías, evento real y versión; regresión de rollback y conflicto.
3. Completado: recibido exclusivo del destinatario, conservación de coordinación y exclusión de listas ordinarias.
4. Completado: histórico propio y revelado explícito, conservando protección de lecturas directas.
5. Completado: evento real opcional por recurso, misma familia y privacidad independiente.
6. Añadir importación Excel con previsualización, validación y confirmación de asignaciones. Conciliar correo con usuarios existentes sin exponer perfiles ajenos; conservar personas pendientes de asociación. Registrar compra con comprador desconocido como estado explícito, sin adjudicarla al importador. Evitar duplicados al repetir una importación.

Pruebas mínimas del flujo: destinatario, comprador, tercer familiar y externo; cantidades parcialmente recibidas si se soportan; recibido deja de aparecer en todos los listados ordinarios; histórico no revela automáticamente; acceso directo a datos e imágenes; usuario que abandona la familia; actualización concurrente; importación repetida y filas inválidas.

## Validación de esta revisión

- Aplicadas las migraciones de wishlist y asociaciones únicamente a Supabase local por el proceso principal, sin reset ni cambios remotos.
- Nuevas asociaciones: **34 aserciones superadas en `032`**. Regresiones `010`, `012`, `013`: **76 aserciones superadas** en la verificación conjunta anterior. Cubre rollback, permisos, recibido, conservación de asociaciones opacas y ausencia de compradores en datos del dueño.
- Unitarias dirigidas de wishlist: **34 pruebas superadas en diez archivos**, incluido guardado por una RPC y acciones explícitas de asociación.
- `pnpm check`: cero errores y 26 avisos existentes en otros componentes, confirmado por la verificación integrada final del proceso principal.
- ESLint dirigido a componentes, comandos y pruebas modificados: código 0, incluida la revisión final de paginación. El analizador oficial Svelte anterior no señaló incidencias; la última modificación usa comprobación local porque se ha suspendido el envío remoto de código del proyecto.
- E2E ampliado con edición atómica mediante selector de evento privado, vínculo visible al dueño y oculto al comprador, recibido y revelado; aprobado por el proceso principal en escritorio y móvil. Las actualizaciones Realtime esperan a autenticar el canal y refrescan al recuperar la suscripción.
- La migración `20261031235000_wishlist_comments_realtime.sql` incorpora los comentarios a Realtime sin ampliar RLS. La prueba exige recibir el identificador del comentario por WebSocket antes de diez segundos, mostrarlo al comprador y mantenerlo ausente tanto de la pantalla como de la consulta directa del destinatario. Aprobada en ambos tamaños y repetida sobre Docker.

## Límites de recibido

Recibido se aplica al regalo completo, no a entregas parciales por unidad. Las imágenes ya descargadas y las URL firmadas previamente no se pueden revocar desde esta política; las firmas actuales caducan a los cinco minutos. RLS puede suprimir el evento Realtime al retirar visibilidad, por lo que se refresca también al recuperar foco y cada 30 segundos mientras la pestaña está visible. No se promete retirada instantánea en pestañas de terceros ya abiertas.

## Comprobación de entrega del informe

- PASS, evidencia: cada hallazgo cita una consulta, función, política o caso de prueba del repositorio; no se atribuye ejecución a pruebas solo inspeccionadas.
- PASS, alcance: el documento distingue capacidad existente, requisito pendiente y propuesta; no presenta la wishlist completa como implementada.
- PASS, texto y datos: contenido UTF-8 con acentos; sin credenciales, datos reales de usuarios, cifras de rendimiento inventadas ni afirmaciones de cumplimiento.
- PASS, alcance visual del informe: sin assets, estadísticas ni navegación ficticia; el informe distingue las comprobaciones de código y permisos de los recorridos de navegador realizados.
