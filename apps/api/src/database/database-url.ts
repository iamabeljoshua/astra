const LOCAL_STACK_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54422/astra';
const LOCAL_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];
const SYSTEM_DATABASES = ['postgres', 'template0', 'template1', '_supabase'];

export function getDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL || LOCAL_STACK_DATABASE_URL;
  if (!URL.canParse(databaseUrl)) throw new Error('DATABASE_URL is not a valid URL.');
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
  return LOCAL_HOSTNAMES.includes(new URL(databaseUrl).hostname);
}

export function isSystemDatabase(databaseUrl: string): boolean {
  return SYSTEM_DATABASES.includes(getDatabaseName(databaseUrl));
}
