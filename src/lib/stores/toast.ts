import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
	duration?: number;
	useHTML?: boolean;
}

interface ToastStore {
	toasts: Toast[];
}

interface ToastOptions {
	type?: Toast['type'];
	duration?: number;
	useHTML?: boolean;
}

function createToastStore() {
	const { subscribe, update } = writable<ToastStore>({ toasts: [] });
	let toastCounter = 0;

	return {
		subscribe,
		show: (message: string, { type = 'info', duration = 4000, useHTML = false }: ToastOptions = {}) => {
			const toast: Toast = {
				id: toastCounter++,
				message,
				type,
				duration,
				useHTML
			};

			update((state) => ({
				toasts: [...state.toasts, toast]
			}));

			if (duration > 0) {
				setTimeout(() => {
					toastStore.dismiss(toast.id);
				}, duration);
			}
		},
		dismiss: (id: number) => {
			update((state) => ({
				toasts: state.toasts.filter((t) => t.id !== id)
			}));
		},
		clear: () => {
			update(() => ({ toasts: [] }));
		}
	};
}

export const toastStore = createToastStore();
