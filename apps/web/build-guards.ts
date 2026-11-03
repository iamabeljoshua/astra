import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import devAccounts from '../../supabase/dev-accounts.json';

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const SECRET_KEY_PREFIX = 'sb_secret_';
const SECRET_LEGACY_KEY_ROLE = 'service_role';
const DEVELOPMENT_ACCOUNT_TEXT = [devAccounts.password, ...devAccounts.accounts.map((account) => account.email)];

function getLegacyKeyRole(key: string): unknown {
  try {
    return (JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()) as { role?: unknown }).role;
  } catch {
    return undefined;
  }
}

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
  if (publishableKey.startsWith(SECRET_KEY_PREFIX) || getLegacyKeyRole(publishableKey) === SECRET_LEGACY_KEY_ROLE) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable key.');
  }
}

export function findDevelopmentAccountText(text: string) {
  return DEVELOPMENT_ACCOUNT_TEXT.find((accountText) => text.includes(accountText));
}

function listFiles(folder: string) {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

export function refuseDevelopmentAccounts(): Plugin {
  let outputFolder = '';

  return {
    name: 'refuse-development-accounts',
    configResolved({ root, build }) {
      outputFolder = resolve(root, build.outDir);
    },
    writeBundle() {
      for (const file of listFiles(outputFolder)) {
        if (findDevelopmentAccountText(readFileSync(file, 'latin1'))) {
          this.error(`${relative(outputFolder, file)} holds a development account or its password. They must never reach a build.`);
        }
      }
    },
  };
}
