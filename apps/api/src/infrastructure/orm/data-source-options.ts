import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function createDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'public',
    entities: [join(__dirname, 'entities', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false,
    // Core Postgres has gen_random_uuid, and hosted Supabase keeps extensions outside public, so install none.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    // TypeORM's log of a failed query holds its parameters, so QueryErrorFilter logs failures instead.
    logging: false,
  };
}
