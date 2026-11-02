# Despliegue guiado, administración y avisos

**Objetivo:** el operador despliega MyFamily y Supabase con Docker en su VPS, administra personalmente las altas y consulta auditoría y cumpleaños.

**Arquitectura:** conservar SvelteKit, Supabase y las políticas existentes. Añadir una vía nginx independiente del Compose Caddy anterior. Los scripts preparan y validan configuración, piden confirmaciones y nunca despliegan desde esta sesión. Permisos globales de administración comprobados en servidor; no confundirlos con administración familiar.

**Tecnologías:** Bash, Docker Compose, nginx/Certbot, PostgreSQL, Svelte 5, Vitest y pgTAP.

## Decisiones

- Trabajar sobre la rama `codex/functional-roadmap` existente: contiene cambios previos sin confirmar necesarios para este trabajo. No moverlos, descartarlos ni confirmarlos.
- Instalación Supabase nueva y aislada; no adoptar volúmenes o bases de otros servicios automáticamente.
- Copias internas solicitadas por el operador; documentar que no cubren pérdida del VPS. No exigir un destino externo.
- Familia inicial «Mabu» y datos de regalos pendientes del Excel; no inventar miembros ni importar datos de prueba.
- Anti-slop `during`, indicado por el usuario para este proyecto. Mantener estilos existentes: ENERGY 1, RHYTHM 1, MOTION 1.

## Tareas y validación

- [x] Inventario: `scripts/server-report.sh`, de solo lectura, recoge SO, CPU, memoria, disco, servicios, puertos y recursos Docker, sin entornos, argumentos de procesos ni configuraciones privadas. Informe en directorio 0700 y archivo 0600, con fallos explícitos. Comprobado en Linux aislado.
- [x] Despliegue: `scripts/deploy.sh`, `deploy-guided.mjs`, `deploy-config.mjs` y `compose.guided.yaml`. Confirma `.env` interpretado como datos, URL, SMTP, ACME y cambios del servidor. Supabase oficial fijado, puertos de loopback, registro cerrado, bootstrap dentro de la imagen, historial de migraciones y copias internas antes de actualizaciones. Timer diario y guía de recuperación. Los registros HTTP propios excluyen URL, cabeceras e IP; la auditoría de Auth se consulta por separado.
- [x] Administración: panel `/admin`, permisos globales por UUID y AAL2, altas, habilitar/deshabilitar y bienvenida. Auditoría de negocio y Auth saneada, paginación, protección frente a autoexpulsión y bloqueo de JWT anteriores mediante permisos SQL. La función de borrado de cuenta comprueba también el acceso SQL del llamante antes de operar con privilegios.
- [x] Cumpleaños: fechas opcionales por familia sin año de nacimiento, edición propia o por administradores familiares, avisos de 14 días en Madrid y enlaces con filtro real `member`. Pruebas de fecha, permisos, formulario y navegación.
- [x] Integración: guías de operador, requisitos y copias actualizados; preferencia anti-slop guardada solo en `AGENTS.md` del proyecto. Comprobaciones estáticas, compilación y revisiones independientes completadas, sin commits ni despliegue remoto.

## Evidencia

Validación local del 1 de noviembre de 2026:

- **57 pruebas unitarias dirigidas**, en nueve archivos: administración, cumpleaños, enlaces de bienvenida y registro cerrado.
- **982 comprobaciones SQL**, 33 archivos. La suite completa detectó una regresión en recuperación MFA durante la implementación; se restauraron los controles de sesión y se añadieron regresiones específicas. La ejecución posterior terminó en PASS.
- **18 pruebas de scripts en Linux, sin omisiones**: instalador, bootstrap y función de borrado de cuenta. Incluyen cancelación interactiva sin imprimir secretos, variables heredadas hostiles, registro HTTP saneado y conflictos de dominios.
- **10 escenarios E2E únicos** en escritorio y móvil: acceso privado/privacidad, bienvenida real con cuenta local, cumpleaños y administración. Se ejecutaron en varias tandas dirigidas; hubo correcciones de mensajes, acceso por teclado y contraste antes de las ejecuciones finales satisfactorias. No se presenta como una única ejecución sin fallos. Los correos de ensayo permanecieron en el correo local, con cuentas ficticias eliminadas al terminar cada prueba.
- `pnpm check`: cero errores y 17 avisos heredados. `pnpm lint`: cero errores y 64 avisos heredados. `pnpm build`: compilación correcta con adapter-node.
- Bash: sintaxis correcta. Informe real dentro de contenedor Linux sin red: ayuda, permisos 0600/0700, secciones, herramientas ausentes y rechazo de argumentos.
- PostgreSQL temporal sin red: primera migración, repetición idempotente, rechazo de checksum modificado, reversión de DDL fallido e historial de transacciones confirmadas.
- nginx real: `nginx -t` correcto para HTTP y HTTPS, con certificado ficticio y sin puertos publicados. La configuración oficial fijada de Supabase se resolvió con 13 servicios y solo los puertos de app/gateway en loopback. La plantilla real del gateway pasó la redacción e idempotencia.
- Revisión independiente de seguridad y funcionalidad; capturas de administración en escritorio y móvil inspeccionadas. Navegación por teclado y ausencia de desbordamiento verificadas. Delivery Gate anti-slop superado con estilos existentes. El MCP de Svelte no estaba disponible; se utilizaron documentación oficial, compilador, `svelte-check` y navegador.

## Límites y comprobaciones del operador

No se ha accedido al VPS, emitido certificados públicos ni enviado correo a destinatarios reales. El arranque completo de la revisión oficial de Supabase en un VPS nuevo, el DNS, SMTP, TLS público, consumo con otros servicios y la restauración de la instalación guiada quedan por verificar en el servidor elegido. Las pruebas de configuración no acreditan esos resultados.

El operador necesita Linux con systemd, Node 24 y Docker rootful local con Compose 2.30 o posterior. Se instalan nginx/Certbot y otros paquetes auxiliares solo con confirmación. El despliegue rechaza instalaciones o recursos ajenos; no migra automáticamente un Supabase existente. Las copias internas no cubren pérdida del VPS y no se purgan automáticamente. La retención y el espacio deben revisarse. La importación de **Mabu** queda pendiente del Excel y del mapeo de personas y correos.
