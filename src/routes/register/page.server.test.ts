import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('closed registration', () => {
	it('rejects direct visits to the public registration page', () => {
		expect(load).toThrow(expect.objectContaining({ status: 403 }));
	});
});
