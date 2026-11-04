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

const GMAIL_DOMAINS: readonly string[] = ['gmail.com', 'googlemail.com'];

// One mailbox answers to many spellings, so a closed child must not get back in with a `+` alias, or on Gmail with dots or its other domain.
function toMailboxAddress(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  const untagged = local.split('+')[0] ?? local;
  return GMAIL_DOMAINS.includes(domain) ? `${untagged.replaceAll('.', '')}@gmail.com` : `${untagged}@${domain}`;
}

export function getAddressHash(email: string): string {
  return createHmac('sha256', getAddressHashKey(process.env)).update(toMailboxAddress(email)).digest('hex');
}
