# Sincronización de calendarios en segundo plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Actualizar Google y Outlook al abrir Calendario y cada dos minutos mientras esté visible, sin repetir una conexión antes de un minuto.

**Architecture:** Reutilizar la sincronización, concesiones temporales y protección de conflictos. Añadir cursores privados para descargar cambios y un POST autenticado de sincronización automática. El navegador muestra datos existentes y actualiza la carga al terminar; no se mantienen procesos tras abandonar la vista.

**Tech Stack:** SvelteKit/Svelte 5, Supabase/Postgres, APIs Calendar/Graph, Vitest, pgTAP y Playwright.

- [x] Proveedores: Google con syncToken; Microsoft con delta para calendario principal y comparación de índice ligero para calendarios secundarios, conforme a las APIs documentadas. Paginación completa, borrados y errores explícitos.
- [x] Servidor: persistencia privada de cursor, umbral de un minuto comprobado dentro de la concesión y actualización solo de eventos cambiados, conservando cambios locales y conflictos.
- [x] Interfaz: POST en segundo plano al abrir, cada dos minutos y al volver a la pestaña; sin solapamientos, con cancelación y errores visibles.
- [x] Validación dirigida de proveedores, servicio, permisos SQL, temporizadores y navegador; documentación actualizada.

Decisiones: `develop`, conservar cambios anteriores de Wishlist/gastos; sin webhooks ni servicios externos nuevos. El primer acceso y la caducidad de cursores requieren una carga inicial; las siguientes consultas son incrementales. Pausar el sondeo con la pestaña oculta. Mantener diseño y componentes existentes, ENERGY 1 / RHYTHM 1 / MOTION 1. Aplicar las guías de planificación, Postgres, antislop y verificación antes de completar.

## Validación

- 103 tests unitarios dirigidos superados: proveedores, paginación, cursores caducados, borrados, eventos fuera de ventana, conflictos, mínimo entre intentos, solicitudes concurrentes, endpoint, visibilidad, temporizadores, abortos y recuperación de respuestas perdidas.
- 151 aserciones SQL superadas: 27 Google, 45 Microsoft, 9 permisos del estado incremental y 70 de MFA. Las pruebas antiguas de proveedores necesitan una base vacía: se ejecutaron en una base temporal con el esquema local, sin datos, que se eliminó al terminar. No se borraron datos de la base habitual.
- Prueba de navegador en escritorio y móvil superada: primer refresco, intervalo de dos minutos, ausencia de peticiones adicionales al invalidar datos, borrador y versión conservados ante cambio de título, desplazamiento fuera de la vista y borrado, consulta sin cambios sin recargar datos y parada al salir. Proveedores simulados; sin cuentas ni consentimientos externos reales.
- Regresión de calendario existente superada en escritorio y móvil. La ejecución E2E compila producción antes de probar.
- Svelte/TypeScript: cero errores y 17 avisos previos ajenos al cambio. ESLint dirigido sin errores. Formato y comprobación de espacios superados.
- Revisión independiente: corregidos tombstones sin cambio de ETag, conflicto de concesión PT409, seguimiento fuera de ventana, refrescos innecesarios y pérdida de borradores.

## Delivery Gate

- Hard Gate: PASS en el alcance modificado. Endpoint autenticado, comprobación de origen y módulo familiar, cursores privados del servicio y pruebas de navegador en escritorio/móvil. Los fallos se muestran y no se pierden borradores.
- Purpose Gate: PASS. Se reutilizan los paneles y colores del proyecto; solo se añade estado textual accesible, sin imágenes, fuentes ni decoración.
- Liveliness: PASS. Se conserva la dirección existente, ENERGY 1 / RHYTHM 1 / MOTION 1; la sincronización no bloquea la vista inicial y el sondeo se pausa con la pestaña oculta.
- Craftsmanship: PASS. Estado incremental persistente con protección de acceso, avance tras éxito, concesión y mínimo de un minuto, cambios y borrados verificados, pruebas dirigidas y compilación de producción. No se certifican proveedores reales sin sus credenciales.
