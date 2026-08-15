const DEFAULT_INTERNAL_PATH = '/dashboard';
const INTERNAL_ORIGIN = 'http://myfamily.local';
const MALFORMED_PERCENT_ESCAPE = /%(?![0-9a-f]{2})/iu;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/iu;
const ENCODED_CONTROL_CHARACTER = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;
const ENCODED_PERCENT = /%25/iu;

function hasUnsafeShape(value: string): boolean {
	const hasControlCharacter = [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 31 || codePoint === 127;
	});

	return (
		!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || hasControlCharacter
	);
}

function isSafeInternalPath(value: string): boolean {
	if (!value || hasUnsafeShape(value) || MALFORMED_PERCENT_ESCAPE.test(value)) {
		return false;
	}

	let encoded = value;
	for (let depth = 0; depth < 8; depth += 1) {
		if (ENCODED_PATH_SEPARATOR.test(encoded) || ENCODED_CONTROL_CHARACTER.test(encoded)) {
			return false;
		}

		if (!ENCODED_PERCENT.test(encoded)) {
			break;
		}

		encoded = encoded.replaceAll(/%25/giu, '%');
	}

	if (ENCODED_PERCENT.test(encoded)) {
		return false;
	}

	try {
		const parsed = new URL(value, INTERNAL_ORIGIN);
		return parsed.origin === INTERNAL_ORIGIN && parsed.username === '' && parsed.password === '';
	} catch {
		return false;
	}
}

export function safeInternalPath(
	value: string | null | undefined,
	fallback = DEFAULT_INTERNAL_PATH
): string {
	const safeFallback = isSafeInternalPath(fallback) ? fallback : DEFAULT_INTERNAL_PATH;
	return typeof value === 'string' && isSafeInternalPath(value) ? value : safeFallback;
}
