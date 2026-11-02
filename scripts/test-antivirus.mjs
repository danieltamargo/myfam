import assert from 'node:assert/strict';
import { scanUploadBytes } from '../src/lib/server/security/antivirus.ts';

const harmless = Buffer.from('MyFamily harmless antivirus integration probe.\n');
await scanUploadBytes(harmless);

const eicar = Buffer.from(
	['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
	'ascii'
);
await assert.rejects(scanUploadBytes(eicar), (error) => error?.status === 422);
console.log(
	'Antivirus integration passed: harmless content accepted; benign EICAR probe rejected.'
);
