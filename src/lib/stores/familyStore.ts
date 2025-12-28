import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface Family {
	id: string;
	name: string;
	role: string;
}

// Load initial value from localStorage if available
const getInitialFamily = (): Family | null => {
	if (!browser) return null;
	const stored = localStorage.getItem('activeFamily');
	return stored ? JSON.parse(stored) : null;
};

// Create the store
function createActiveFamilyStore() {
	const { subscribe, set, update } = writable<Family | null>(getInitialFamily());

	return {
		subscribe,
		set: (family: Family | null) => {
			if (browser) {
				if (family) {
					localStorage.setItem('activeFamily', JSON.stringify(family));
				} else {
					localStorage.removeItem('activeFamily');
				}
			}
			set(family);
		},
		update,
		clear: () => {
			if (browser) {
				localStorage.removeItem('activeFamily');
			}
			set(null);
		}
	};
}

export const activeFamily = createActiveFamilyStore();
