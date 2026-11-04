import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEYS_FILE = join(homedir(), '.config', 'astra', 'keys.env');

export function readKey(name: string): string {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) return fromEnvironment;
  const line = readFileSync(KEYS_FILE, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error(`${name} is not set in ${KEYS_FILE}`);
  return value;
}
