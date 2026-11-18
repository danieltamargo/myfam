export function openDialog(dialog: HTMLDialogElement, onCancel: () => void) {
	const opener = document.activeElement;
	function cancel(event: Event) {
		event.preventDefault();
		onCancel();
	}
	dialog.addEventListener('cancel', cancel);
	dialog.showModal();
	dialog.querySelector<HTMLElement>('[data-cancel]')?.focus({ preventScroll: true });
	return {
		update(callback: () => void) {
			onCancel = callback;
		},
		destroy() {
			dialog.removeEventListener('cancel', cancel);
			dialog.close();
			if (opener instanceof HTMLElement && opener.isConnected)
				opener.focus({ preventScroll: true });
		}
	};
}
