import { describe, expect, it } from 'vitest';
import { cn } from '$lib/utils';

describe('project test baseline', () => {
	it('imports project aliases and utilities', () => {
		const optionalClass = false;
		expect(cn('px-2', optionalClass ? 'hidden' : undefined, 'px-4')).toBe('px-4');
	});
});
