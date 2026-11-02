import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface CalendarTokenKeys {
	activeId: string;
	keys: Record<string, string>;
}

function encryptionKey(keys: CalendarTokenKeys, keyId: string): Buffer {
	const value = keys.keys[keyId];
	if (!value) throw new Error('Calendar encryption key is unavailable');
	const key = Buffer.from(value, 'base64');
	if (key.length !== 32) throw new Error('Calendar encryption key must contain 32 bytes');
	return key;
}

export function encryptCalendarSecret(
	value: string,
	context: string,
	keys: CalendarTokenKeys
): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(keys, keys.activeId), iv);
	cipher.setAAD(Buffer.from(context));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return [
		keys.activeId,
		iv.toString('base64url'),
		cipher.getAuthTag().toString('base64url'),
		ciphertext.toString('base64url')
	].join('.');
}

export function decryptCalendarSecret(
	value: string,
	context: string,
	keys: CalendarTokenKeys
): string {
	const [keyId, iv, tag, ciphertext, extra] = value.split('.');
	if (!keyId || !iv || !tag || !ciphertext || extra)
		throw new Error('Invalid encrypted calendar secret');
	const decipher = createDecipheriv(
		'aes-256-gcm',
		encryptionKey(keys, keyId),
		Buffer.from(iv, 'base64url')
	);
	decipher.setAAD(Buffer.from(context));
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, 'base64url')),
		decipher.final()
	]).toString('utf8');
}
