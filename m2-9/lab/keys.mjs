import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const key = { kty: 'EC', kid: 'm2-9-key-a', use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256', ext: true, d: jwk.d, crv: jwk.crv, x: jwk.x, y: jwk.y };
writeFileSync(new URL('./keys.json', import.meta.url), JSON.stringify({ key, secret: randomBytes(32).toString('hex') }));
