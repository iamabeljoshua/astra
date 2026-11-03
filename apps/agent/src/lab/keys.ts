import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEYS_FILE = join(homedir(), '.config', 'astra', 'keys.env');

// Reads one named value and never prints the file. The account is shared, so nothing here logs a key.
export function readKey(name: string): string {
  const line = readFileSync(KEYS_FILE, 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error(`${name} is not set in ${KEYS_FILE}`);
  return value;
}
