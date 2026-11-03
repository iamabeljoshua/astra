import { extname, join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

// .ts under Jest and .js once built, so the build's .d.ts files never match.
const SOURCE_EXTENSION = extname(__filename);

export function createDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'public',
    entities: [join(__dirname, 'entities', `*.entity${SOURCE_EXTENSION}`)],
    migrations: [join(__dirname, 'migrations', `*${SOURCE_EXTENSION}`)],
    synchronize: false,
    // Core Postgres has gen_random_uuid, and hosted Supabase keeps extensions outside public, so install none.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    // TypeORM's log of a failed query holds its parameters, so QueryErrorFilter logs failures instead.
    logging: false,
  };
}
