import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { CryptoKey, JWK, JWTPayload } from 'jose';

const KEYS_PATH = '/auth/v1/.well-known/jwks.json';
const ONE_HOUR_SECONDS = 3600;

export interface SigningKey {
  privateKey: CryptoKey;
  publicJwk: JWK;
  algorithm: string;
}

export interface TestToken {
  claims?: JWTPayload;
  key?: SigningKey;
}

export interface TestSupabaseAuth {
  url: string;
  keys: SigningKey[];
  signToken: (authUserId: string, token?: TestToken) => Promise<string>;
  close: () => Promise<void>;
}

export async function createSigningKey(algorithm = 'ES256'): Promise<SigningKey> {
  const { publicKey, privateKey } = await generateKeyPair(algorithm);
  const publicJwk = { ...(await exportJWK(publicKey)), kid: randomUUID(), alg: algorithm, use: 'sig' };
  return { privateKey, publicJwk, algorithm };
}

export function signWithKey(key: SigningKey, claims: JWTPayload): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: key.algorithm, kid: key.publicJwk.kid, typ: 'JWT' })
    .sign(key.privateKey);
}

export async function startTestSupabaseAuth(): Promise<TestSupabaseAuth> {
  const keys = [await createSigningKey()];
  const server = createServer((request, response) => {
    const isKeysRequest = request.url === KEYS_PATH;
    response.writeHead(isKeysRequest ? 200 : 404, { 'content-type': 'application/json' });
    response.end(isKeysRequest ? JSON.stringify({ keys: keys.map((key) => key.publicJwk) }) : '{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    keys,
    signToken: (authUserId, { claims, key = keys[0] as SigningKey } = {}) =>
      signWithKey(key, {
        iss: `${url}/auth/v1`,
        aud: 'authenticated',
        role: 'authenticated',
        sub: authUserId,
        exp: Math.floor(Date.now() / 1000) + ONE_HOUR_SECONDS,
        ...claims,
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
