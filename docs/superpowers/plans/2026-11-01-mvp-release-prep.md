# Preparación del MVP para despliegue

**Objetivo:** cerrar protección de archivos, privacidad de mensajes de acceso y comprobaciones previas del despliegue sin credenciales externas; entregar las entradas concretas que debe aportar el usuario.

**Arquitectura:** mantener SvelteKit/Supabase, las cuotas en la frontera de datos y las herramientas locales existentes. No reiniciar ni vaciar la base habitual. Las claves se reciben mediante archivos protegidos, sin imprimirlas ni pedirlas en el chat.

## Archivos por bloque

- Cuotas: migración `20261101010000_family_storage_quota.sql`, prueba `081_family_storage_quota.test.sql`, fixtures relacionados y helper de subida compartido.
- Acceso: helper de mensajes y siete interfaces Auth/MFA; conservar los controles de sesión y verificar con el analizador Svelte local.
- Despliegue: `scripts/check-vps-config.mjs`, pruebas sintéticas y `docs/VPS_DEPLOYMENT_INPUTS.md`.

## Ejecución y validación

- [x] Revisar migración y límites: 1 GiB combinado por familia como valor inicial, ajuste privado de operador, sin borrado de archivos ni derechos comerciales. Revisión independiente sin hallazgos accionables.
- [x] Probar SQL y concurrencia en un Supabase aislado con claves nuevas: 44 aserciones; los tres buckets comparten presupuesto y el borrado libera capacidad. Dos escrituras de 60 bytes con límite 100 aceptan exactamente una. Storage 1.84 oculta el error SQL: una RPC exclusiva de servicio permite diagnosticarlo sin autorizar escrituras (`output/mvp-quota-integration-result.json`).
- [x] Aplicar únicamente la migración aditiva a la instalación local: `supabase migration up --local`, sin reset; suite SQL completa 944/31 (`output/mvp-release-db.log`). Se retiró el índice propuesto sobre `storage.objects` por permisos de tabla gestionada, conservando sus índices existentes. La primera tentativa se revirtió íntegramente.
- [x] Verificar mensajes genéricos en registro/recuperación y errores permitidos por código mediante 24 unitarias. La mitigación visual no cambia las respuestas de la API directa de GoTrue.
- [x] Verificar preflight: ocho pruebas y ensayo Linux sin red con configuración válida, rechazo de permisos 0644 y ausencia de valores privados en salida (`output/mvp-preflight-linux.log`). CI incorporado; no sustituye DNS/TLS/SMTP/firewall reales.
- [x] Tipos: cero errores/17 avisos; lint: cero errores/64 avisos heredados; 341 unitarias/55 archivos. Compilación y E2E: 40/40 (20 escritorio/20 móvil) en una ejecución final, sin reintentos ni omisiones, 3,7 minutos (`output/mvp-release-e2e.log`). Se utilizó preview de producción en el puerto 4174 para conservar el servidor existente en 4173; esta pasada no acredita Docker/Caddy/TLS. El analizador Svelte local revisó 41 archivos: cero incidencias y 26 sugerencias heredadas de juegos.
- [x] Actualizar plan MVP, auditorías, AGENTS.md y requisitos del VPS. Limpieza verificada: siete contenedores, cuatro volúmenes, cuatro redes y once archivos de secretos sintéticos retirados; los seis servicios habituales de Supabase siguen funcionando (`output/mvp-release-cleanup-result.json`). No se ejecutó prune global ni se borraron datos familiares existentes.

## Entradas externas

Documentar servidor/acceso, dominio y DNS, modalidad Supabase, SMTP y destino de copias. Google/Microsoft se requieren para activar calendarios reales; el Excel y el mapeo de emails se requieren para importar la primera familia. Las claves JWT, contraseñas internas y claves de cifrado de una instalación nueva se pueden generar durante su preparación, sin pedirlas al usuario.

## Diagnóstico y límites

La ejecución E2E diagnóstica tuvo tres fallos: dos en una respuesta simulada de Auth que omitía la versión de protocolo y uno por la función local de cuenta parada. Se corrigió el fixture y se arrancó temporalmente esa función antes de la pasada completa final; no se ocultaron casos ni se aumentaron reintentos. El puerto 4173 ocupado se detectó antes de ejecutar casos y se conservó. La primera suite SQL completa en el entorno aislado no se consideró válida: un test histórico apunta por dblink a la instalación habitual y otro comprueba propietarios específicos de esa instalación. Las 44 pruebas focales y la integración de cuota pasaron allí; las 944 de la suite completa pasaron después en la instalación habitual, con rollback de los fixtures. El arranque del ensayo de restauración espera ahora la conexión TCP definitiva de PostgreSQL, evitando confundir el servidor temporal de inicialización con el servicio listo.
