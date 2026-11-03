import type { Plugin } from 'vite';
import devAccounts from '../../supabase/dev-accounts.json';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const SECRET_KEY_PREFIX = 'sb_secret_';
const DEVELOPMENT_ACCOUNT_TEXT = [devAccounts.password, ...devAccounts.accounts.map((account) => account.email)];

export function requireSupabaseValues(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url) throw new Error('Set VITE_SUPABASE_URL to build the web app.');
  if (!publishableKey) throw new Error('Set VITE_SUPABASE_PUBLISHABLE_KEY to build the web app.');
  if (!URL.canParse(url)) throw new Error('VITE_SUPABASE_URL is not a valid URL.');
  const { protocol, hostname } = new URL(url);
  const isPlainHttpOnLocalHost = protocol === 'http:' && LOCAL_HOSTS.includes(hostname);
  if (protocol !== 'https:' && !isPlainHttpOnLocalHost) {
    throw new Error('VITE_SUPABASE_URL must use https, or http on a local host.');
  }
  if (publishableKey.startsWith(SECRET_KEY_PREFIX)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable key.');
  }
}

export function findDevelopmentAccountText(text: string) {
  return DEVELOPMENT_ACCOUNT_TEXT.find((accountText) => text.includes(accountText));
}

export function refuseDevelopmentAccounts(): Plugin {
  return {
    name: 'refuse-development-accounts',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        const text = file.type === 'chunk' ? file.code : String(file.source);
        if (findDevelopmentAccountText(text)) {
          this.error(`${file.fileName} holds a development account or its password. They must never reach a build.`);
        }
      }
    },
  };
}
