# Navegación estable y pendientes locales del MVP

**Objetivo:** corregir el aborto de navegación y aprobar todos los E2E en una sola ejecución sin reintentos; después cerrar controles locales pendientes de seguridad y copias.

**Arquitectura:** mantener SvelteKit y Supabase. Las notificaciones de autenticación deben actualizar datos cuando cambia la sesión, sin provocar navegaciones redundantes. Conservar las comprobaciones de MFA y autorización.

## 1. Navegación y primera pasada completa

- [x] Instrumentar la intercalación de recuperación de sesión y navegación desde un 404: se confirmaron revalidaciones redundantes, sin reproducir el aborto exacto de forma determinista.
- [x] Filtrar los avisos Auth con token idéntico, registrar la dependencia del layout y retirar el diagnóstico temporal. La regresión esperaba cero revalidaciones y recibió una antes del cambio; pasó en escritorio y móvil después.
- [x] Ejecutar la suite completa de escritorio y móvil en una sola pasada, con `--retries=0`, sin sustituir navegación real por peticiones API: 36/36 aprobados en 4,6 minutos (`output/e2e-navigation-full-once.log`). Reintentos desactivados también en CI.

## 2. Pendientes sin credenciales externas

Después de cerrar el bloque anterior:

- [x] Añadir límites de mutación por identidad verificada (60/min) además del límite por IP (120/min). La sesión verificada se reutiliza solo dentro de la petición; las APIs directas de Supabase necesitan sus propios controles.
- [x] Retirar HTML dinámico de mensajes y revisar los SVG estáticos restantes. CSP limita scripts con nonce, permite únicamente el origen HTTP(S) de Supabase para redirecciones de descarga y conserva estilos inline e imágenes HTTPS por compatibilidad. El arranque del tema usa nonce; los avatares detectan fallos anteriores a la hidratación sin handlers inline.
- [x] Probar el ciclo de copias ante fallos y señales: 11/11 pruebas Linux simuladas y 4/4 criptográficas. Se conservan los IDs activos originales, se ordenan dependencias y se comprueba salud con plazos acotados; el helper se verificó también con Docker real. No se activaron temporizadores.

## 3. Verificación y documentación

- [x] Ejecutar pruebas focales, 314 unitarias en 54 archivos, analizador Svelte local (40 archivos, 0 incidencias y 26 heurísticas heredadas de juegos), tipos (0 errores/17 avisos), lint (0 errores/73 avisos) y compilación de producción mediante Docker.
- [x] Repetir la suite completa tras los cambios de autenticación, CSP y navegación: 38/38 E2E en una única ejecución sobre Docker endurecido/Caddy, escritorio y móvil, sin reintentos, en 2,7 minutos (`output/e2e-final-docker-once.log`).
- [x] Actualizar auditorías, README, AGENTS y plan MVP con resultados medidos y límites operativos.

La pasada intermedia en producción detectó bloqueos de descarga, pérdida del error de imagen anterior a hidratar, ausencia de nonce en el tema y una carrera entre Realtime e histórico de Wishlist. Se corrigieron antes de la pasada final. Wishlist ahora difiere el inicio de una revalidación mientras hay navegación pendiente; la prueba retiene la respuesta del histórico y activa el refresco con reloj controlado. La primera versión de esa prueba pasó con la imagen anterior, por lo que no se presenta como evidencia roja/verde determinista; la traza original acredita la carrera y la versión reforzada pasó en ambos proyectos.

No desplegar fuera de este ordenador, reiniciar bases de datos existentes ni activar temporizadores del VPS. SMTP, OAuth real, CAPTCHA de proveedor, dominio/TLS y copia externa requieren configuración del entorno y conservan sus pendientes.
