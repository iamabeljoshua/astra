import { Client } from 'pg';

const LOCAL_STACK_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54422/astra';
const LOCAL_STACK_PORT = Number(new URL(LOCAL_STACK_DATABASE_URL).port);
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SYSTEM_DATABASES = ['postgres', 'template0', 'template1', '_supabase'];

// Asks the driver, because it also reads query parameters and PG* environment values.
function readDriverTarget(databaseUrl: string) {
  const { host, port, ssl } = new Client({ connectionString: databaseUrl }).connectionParameters;
  return { host, port, usesTls: Boolean(ssl) };
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL || LOCAL_STACK_DATABASE_URL;
  if (!URL.canParse(databaseUrl)) throw new Error('DATABASE_URL is not a valid URL.');
  const { searchParams } = new URL(databaseUrl);
  if (searchParams.has('host') || searchParams.has('port')) {
    throw new Error('DATABASE_URL must not set host or port in its query string. Put them before the database name.');
  }
  if (!isLocalDatabase(databaseUrl) && !readDriverTarget(databaseUrl).usesTls) {
    throw new Error(
      `DATABASE_URL for ${describeDatabaseWithoutPassword(databaseUrl)} has no sslmode that turns on TLS, so it would connect in plaintext. Add sslmode=verify-full&sslrootcert=<CA file>, as "Connect a hosted project" in the README says.`,
    );
  }
  return databaseUrl;
}

export function getDatabaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

export function withDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(databaseName)}`;
  return url.href;
}

export function describeDatabaseWithoutPassword(databaseUrl: string): string {
  const { host, pathname } = new URL(databaseUrl);
  return `${host}${pathname}`;
}

export function isLocalDatabase(databaseUrl: string): boolean {
  return LOCAL_HOSTS.includes(readDriverTarget(databaseUrl).host);
}

export function isSystemDatabase(databaseUrl: string): boolean {
  return SYSTEM_DATABASES.includes(getDatabaseName(databaseUrl));
}

export function requireLocalStack(databaseUrl: string, action: string): void {
  const { host, port } = readDriverTarget(databaseUrl);
  if (!LOCAL_HOSTS.includes(host) || port !== LOCAL_STACK_PORT) {
    throw new Error(
      `Refusing to ${action} ${describeDatabaseWithoutPassword(databaseUrl)}. This works only on the local stack, on port ${LOCAL_STACK_PORT}.`,
    );
  }
}
