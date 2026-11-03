import { createHash, randomBytes } from 'node:crypto';

const LINK_TOKEN_BYTES = 32;
const LOCAL_HOST = '127.0.0.1';
const DEFAULT_WEB_PORT = '5173';
const CONSENT_PAGE_PATH = '/parent-consent';

export function createLinkToken(): string {
  return randomBytes(LINK_TOKEN_BYTES).toString('base64url');
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getLocalConsentLink(token: string, env: NodeJS.ProcessEnv): string {
  return `http://${LOCAL_HOST}:${env.WEB_PORT ?? DEFAULT_WEB_PORT}${CONSENT_PAGE_PATH}/${token}`;
}
