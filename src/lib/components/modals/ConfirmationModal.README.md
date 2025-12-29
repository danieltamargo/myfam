# ConfirmationModal Component

Componente reutilizable de confirmación con soporte para 2FA, estilos personalizables y callbacks.

## Características

- ✅ **Dos estilos**: `normal` (azul/primary) y `critical` (rojo/error)
- ✅ **Soporte 2FA**: Verificación automática con Supabase Auth
- ✅ **Callbacks personalizables**: `onConfirm` y `onCancel`
- ✅ **Responsive**: Se adapta a diferentes tamaños de pantalla
- ✅ **Accesible**: Cierre con backdrop, ESC key, y botones claros
- ✅ **Loading states**: Indicadores visuales durante la verificación
- ✅ **Mensajes HTML**: Soporta HTML en mensajes para texto enriquecido

## Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `show` | `boolean` (bindable) | - | Controla la visibilidad del modal |
| `title` | `string` | - | Título del modal |
| `message` | `string` | - | Mensaje principal (soporta HTML) |
| `details` | `string?` | - | Detalles adicionales opcionales |
| `style` | `'normal' \| 'critical'` | `'normal'` | Estilo del modal |
| `icon` | `'warning' \| 'info' \| 'trash' \| 'send' \| 'logout' \| 'transfer' \| 'shield'` | Auto | Icono a mostrar (auto según style) |
| `confirmText` | `string` | `'Confirm'` | Texto del botón de confirmación |
| `cancelText` | `string` | `'Cancel'` | Texto del botón de cancelación |
| `require2FA` | `boolean` | `false` | Si requiere verificación 2FA |
| `onConfirm` | `() => void \| Promise<void>` | - | Callback al confirmar |
| `onCancel` | `() => void?` | - | Callback al cancelar (opcional) |

## Uso Básico (Estilo Normal)

```svelte
<script lang="ts">
  import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

  let showModal = $state(false);

  async function handleSave() {
    // Tu lógica aquí
    await saveData();
  }
</script>

<button onclick={() => showModal = true}>Save Changes</button>

<ConfirmationModal
  bind:show={showModal}
  title="Save Changes"
  message="Are you sure you want to save these changes?"
  details="This will update your profile information."
  style="normal"
  confirmText="Save"
  onConfirm={handleSave}
/>
```

## Uso Crítico (con 2FA)

```svelte
<script lang="ts">
  import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

  let showDeleteModal = $state(false);
  let userToDelete = $state<{id: string; name: string} | null>(null);
  let deleteFormRef = $state<HTMLFormElement | null>(null);

  function openDelete(user: any) {
    userToDelete = user;
    showDeleteModal = true;
  }

  async function handleDeleteConfirm() {
    if (deleteFormRef) {
      deleteFormRef.requestSubmit();
    }
  }
</script>

<!-- Hidden form -->
{#if userToDelete}
  <form
    bind:this={deleteFormRef}
    method="POST"
    action="?/deleteUser"
    use:enhance={() => {
      return async ({ result, update }) => {
        await update();
        showDeleteModal = false;
        userToDelete = null;
      };
    }}
    style="display: none;"
  >
    <input type="hidden" name="userId" value={userToDelete.id} />
  </form>
{/if}

<!-- Modal -->
{#if userToDelete}
  <ConfirmationModal
    bind:show={showDeleteModal}
    title="Delete User"
    message="You are about to delete <strong class='text-error'>{userToDelete.name}</strong>."
    details="This action cannot be undone. All user data will be permanently deleted."
    style="critical"
    confirmText="Delete User"
    require2FA={true}
    onConfirm={handleDeleteConfirm}
    onCancel={() => {
      showDeleteModal = false;
      userToDelete = null;
    }}
  />
{/if}
```

## Flujo de 2FA

Cuando `require2FA={true}`:

1. **Sin 2FA habilitado**: Ejecuta `onConfirm()` directamente
2. **Con 2FA habilitado**:
   - Muestra alerta informativa de 2FA requerido
   - Al confirmar, cambia a pantalla de verificación
   - Solicita código de 6 dígitos
   - Verifica con Supabase Auth MFA
   - Si es correcto, ejecuta `onConfirm()`
   - Si falla, muestra error y permite reintentar

## Estilos

### Normal (Primary)
- Borde azul/primary
- Icono de información por defecto (puede personalizarse)
- Botón de confirmación primary
- Mensaje con fondo azul claro

### Critical (Error)
- Borde rojo/error
- Icono de advertencia por defecto (puede personalizarse)
- Botón de confirmación error
- Mensaje con fondo rojo claro
- Texto "This action cannot be undone"

## Iconos Disponibles

Puedes personalizar el icono usando la prop `icon`:

| Icono | Uso recomendado |
|-------|-----------------|
| `warning` | Advertencias generales (default para critical) |
| `info` | Información general (default para normal) |
| `trash` | Eliminar/borrar elementos |
| `send` | Enviar invitaciones, notificaciones |
| `logout` | Salir, cerrar sesión |
| `transfer` | Transferir propiedad/datos |
| `shield` | Acciones de seguridad |

### Ejemplo con iconos personalizados

```svelte
<!-- Eliminar miembro con icono de papelera -->
<ConfirmationModal
  bind:show={showDeleteModal}
  title="Remove Member"
  message="Delete <strong>{member.name}</strong>?"
  style="critical"
  icon="trash"
  require2FA={true}
  onConfirm={handleDelete}
/>

<!-- Transferir propiedad -->
<ConfirmationModal
  bind:show={showTransferModal}
  title="Transfer Ownership"
  message="Transfer to <strong>{newOwner.name}</strong>?"
  style="critical"
  icon="transfer"
  require2FA={true}
  onConfirm={handleTransfer}
/>

<!-- Salir de familia -->
<ConfirmationModal
  bind:show={showLeaveModal}
  title="Leave Family"
  message="Are you sure you want to leave?"
  style="critical"
  icon="logout"
  require2FA={true}
  onConfirm={handleLeave}
/>
```

## Integración con Supabase

El componente usa `createClient()` de `$lib/supabase` para:
- Verificar si el usuario tiene 2FA habilitado
- Crear challenges de MFA
- Verificar códigos TOTP
- Mantenerse sincronizado con la sesión

## Accesibilidad

- ✅ Focus trap en el modal
- ✅ ESC para cerrar
- ✅ Click en backdrop para cerrar
- ✅ Botón de cancelar siempre visible
- ✅ Loading states claros
- ✅ Mensajes de error descriptivos

## Ejemplo Real

Ver implementación completa en:
- `src/routes/(protected)/family/[familyId]/members/+page.svelte`
