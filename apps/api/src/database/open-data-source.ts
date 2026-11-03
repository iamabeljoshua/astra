import { DataSource } from 'typeorm';
import { APP_SCHEMA, createDataSourceOptions } from './data-source-options';
import { describeDatabaseWithoutPassword, isLocalDatabase } from './database-url';

const LOCAL_SETUP_STEPS = 'Run pnpm db:up, then pnpm db:migrate, or set DATABASE_URL.';
const HOSTED_SETUP_STEPS =
  'Check DATABASE_URL against "Connect a hosted project" in the README, then run pnpm db:migrate with it.';

function getSetupSteps(databaseUrl: string): string {
  return isLocalDatabase(databaseUrl) ? LOCAL_SETUP_STEPS : HOSTED_SETUP_STEPS;
}

function getDriverMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || ('code' in error ? String(error.code) : error.name);
}

export async function openDataSource(databaseUrl: string): Promise<DataSource> {
  try {
    return await new DataSource(createDataSourceOptions(databaseUrl)).initialize();
  } catch (error) {
    throw new Error(
      `Cannot connect to the database at ${describeDatabaseWithoutPassword(databaseUrl)}: ${getDriverMessage(error)}. ${getSetupSteps(databaseUrl)}`,
      { cause: error },
    );
  }
}

// TypeORM creates its migrations table in the app schema, so the schema must exist before any migration check.
export async function openDataSourceWithAppSchema(databaseUrl: string): Promise<DataSource> {
  const dataSource = await openDataSource(databaseUrl);
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${APP_SCHEMA}"`);
  return dataSource;
}

export async function openMigratedDataSource(databaseUrl: string): Promise<DataSource> {
  const dataSource = await openDataSourceWithAppSchema(databaseUrl);
  if (await dataSource.showMigrations()) {
    await dataSource.destroy();
    throw new Error(
      `The database at ${describeDatabaseWithoutPassword(databaseUrl)} has migrations to run. ${getSetupSteps(databaseUrl)}`,
    );
  }
  return dataSource;
}
