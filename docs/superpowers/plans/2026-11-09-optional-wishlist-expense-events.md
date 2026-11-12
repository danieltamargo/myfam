# Wishlist opcional y eventos por gasto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir desactivar Wishlist y asociar cada gasto a un evento visible de su familia, incluido el alta desde Calendario.

**Architecture:** Mantener el catálogo, las preferencias familiares y el proveedor comercial separados. Reutilizar las operaciones de gastos y repartos dentro de una RPC transaccional; guardar las asociaciones en una tabla con RLS que exija acceso tanto al gasto como al evento. Conservar las asociaciones ocultas al editar otros campos.

**Tech Stack:** SvelteKit, Svelte 5, Supabase/Postgres, Vitest, pgTAP y Playwright.

- [x] Cambiar Wishlist a opcional, conservar preferencias existentes y actualizar pruebas y documentación.
- [x] Añadir asociación por gasto y guardado transaccional con validación de familia, audiencia, versión y MFA.
- [x] Añadir selector al alta y edición, mostrar el evento visible y conservar el contexto al entrar desde Calendario.
- [x] Probar activación, validación, privacidad, rollback y cambios concurrentes; ejecutar comprobación de Svelte y compilación.

Decisiones: trabajar en `develop` por petición del usuario; conservar las asociaciones de colección existentes; no implementar billing ni sincronización automática en esta tarea. Mantener controles DaisyUI y dirección visual existentes, ENERGY 1 / RHYTHM 1 / MOTION 1. Los analizadores MCP de Svelte no están disponibles; utilizar la comprobación local de Svelte y el compilador.

## Verificación

- 59 pruebas unitarias dirigidas superadas: validación de gastos, reembolsos, catálogo, acceso, planner y pertenencia a colecciones.
- 154 aserciones SQL superadas en `070`, `032`, `095` y `099`: preferencias, privacidad, permisos, MFA, rollback, versiones y conservación de vínculos ocultos. Migraciones aplicadas únicamente a Supabase local, sin reset.
- Cuatro recorridos E2E superados entre escritorio y móvil: preferencias de módulos y gastos. Incluyen desactivación de Wishlist, selección de colección desde un evento, preselección, alta, enlace al mes del evento, cambio de asociación y gasto genérico. La ejecución de gastos construye producción antes de probar.
- Svelte/TypeScript: cero errores; permanecen los 17 avisos previos. ESLint dirigido sin errores; permanece un aviso previo en el enlace de colecciones archivadas.
- Revisión independiente sin hallazgos pendientes. Se corrigieron la pérdida de contexto en formularios/redirecciones y el enlace sin fecha al calendario. El E2E detectó colecciones duplicadas por consultar todas las pertenencias: ahora se filtran por usuario autenticado y existe regresión unitaria.

## Delivery Gate

- Hard Gate: PASS para los cambios solicitados. Los controles usan acciones de servidor reales; las rutas desactivadas se bloquean y los eventos privados no revelan sus identificadores. E2E en escritorio y móvil cubren los recorridos modificados.
- Purpose Gate: PASS. Los nuevos campos reutilizan selectores y enlaces DaisyUI; no se añaden imágenes, decoración, fuentes ni animaciones.
- Liveliness: PASS. Dirección existente conservada, ENERGY 1 / RHYTHM 1 / MOTION 1; las acciones principales siguen siendo añadir/guardar gasto y los campos se integran en la rejilla responsive existente.
- Craftsmanship: PASS. Guardado transaccional, tipos y validación explícitos, pruebas de permisos/privacidad y compilación de producción. No se afirma validación de proveedores reales ni auditoría visual completa de pantallas ajenas al cambio.
