import { createHmac } from 'node:crypto';

const LOCAL_STACK_ONLY_KEY = 'astra-local-stack-only-closed-address-key';

function getAddressHashKey(env: NodeJS.ProcessEnv): string {
  return env.CLOSED_ADDRESS_HASH_KEY || LOCAL_STACK_ONLY_KEY;
}

export function requireAddressHashKey(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production' && !env.CLOSED_ADDRESS_HASH_KEY) {
    throw new Error('CLOSED_ADDRESS_HASH_KEY is not set. The API needs it to keep closed addresses out.');
  }
}

// Auth treats an address as one account whatever its case, so the hash does too.
export function getAddressHash(email: string): string {
  return createHmac('sha256', getAddressHashKey(process.env)).update(email.trim().toLowerCase()).digest('hex');
}
