# ConfirmationModal

Componente visual de confirmación con estilos normal/crítico, contenido seguro y un paso opcional de challenge TOTP.

## Límites de seguridad

Este componente **no es una frontera de autorización**.

- `require2FA` solo controla un flujo del cliente. La acción o endpoint que muta datos debe volver a validar identidad, permisos y AAL2 cuando corresponda.
- `message` se renderiza como texto escapado por Svelte; no interpreta HTML.
- `messageContent` admite un `Snippet` de Svelte para estructura controlada. Los valores dinámicos interpolados dentro del snippet siguen escapándose por defecto.
- No uses `{@html}` con contenido de usuario dentro del snippet.
- Un cliente modificado puede omitir el modal y llamar directamente a una acción; servidor, RPC y RLS deben conservar la autorización definitiva.

## Props actuales

| Prop | Tipo | Valor por defecto | Descripción |
| --- | --- | --- | --- |
| `show` | `boolean` bindable | — | Visibilidad |
| `title` | `string` | — | Título renderizado como texto |
| `message` | `string?` | — | Mensaje renderizado como texto escapado |
| `messageContent` | `Snippet?` | — | Contenido estructurado controlado |
| `details` | `string?` | — | Texto adicional escapado |
| `style` | `'normal' \| 'critical'` | `'normal'` | Apariencia |
| `icon` | `warning`, `info`, `trash`, `send`, `logout`, `transfer`, `shield` | Automático | Icono interno |
| `confirmText` | `string` | `'Confirm'` | Etiqueta del botón |
| `cancelText` | `string` | `'Cancel'` | Etiqueta del botón |
| `require2FA` | `boolean` | `false` | Activa el challenge cliente si hay factor TOTP |
| `onConfirm` | función sync/async | — | Callback tras confirmar/verificar |
| `onCancel` | función opcional | — | Callback de cancelación |

## Uso básico

```svelte
<script lang="ts">
  import ConfirmationModal from '$lib/components/modals/ConfirmationModal.svelte';

  let showModal = $state(false);

  async function handleConfirm() {
    // La acción de servidor debe validar identidad y permisos.
  }
</script>

<ConfirmationModal
  bind:show={showModal}
  title="Guardar cambios"
  message="¿Quieres guardar estos cambios?"
  details="Revisa la información antes de continuar."
  confirmText="Guardar"
  onConfirm={handleConfirm}
/>
```

## Datos dinámicos y snippets

Para añadir estructura, usa un snippet; `member.displayName` se mantiene como nodo de texto escapado:

```svelte
{#snippet removeMemberMessage()}
  ¿Quieres eliminar a <strong>{member.displayName}</strong> de la familia?
{/snippet}

<ConfirmationModal
  bind:show={showDeleteModal}
  title="Eliminar miembro"
  messageContent={removeMemberMessage}
  style="critical"
  onConfirm={removeMember}
/>
```

Pasar `message="Eliminar <strong>Alex</strong>"` mostrará las etiquetas literalmente; ya no se interpreta como HTML.

## Flujo `require2FA`

1. Lista factores TOTP del usuario.
2. Si encuentra uno verificado, muestra el paso para introducir el código.
3. Crea un challenge y verifica el TOTP.
4. Ejecuta `onConfirm` si Supabase acepta el código.
5. Si no hay factor, ejecuta `onConfirm` sin challenge.

Consecuencias:

- `require2FA` no obliga a enrolar un factor.
- Para operaciones críticas, el endpoint debe comprobar AAL2 aunque el modal haya verificado un código.
- El layout SSR aplica MFA al acceso general de usuarios que ya tienen un factor verificado; no convierte este componente en autorización.

Consulta `docs/2FA_SETUP.md` y `docs/PROJECT_AUDIT_2026-08-07.md` antes de usarlo en operaciones sensibles.

## Accesibilidad actual

- Contenedor con `role="dialog"`, `aria-modal="true"` y título asociado mediante `aria-labelledby`.
- Cierre mediante botón de backdrop y tecla Escape cuando no hay una verificación en curso.
- Foco inicial en Cancelar y restauración del foco anterior al cerrar mediante una attachment de Svelte.
- Botones reales para confirmar, cancelar y cerrar el backdrop.
- Estados de carga y error visibles.

El componente no implementa un focus trap completo. Debe probarse con teclado y lector de pantalla en los recorridos donde se utilice.
