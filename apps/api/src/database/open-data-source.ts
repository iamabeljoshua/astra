import { DataSource } from 'typeorm';
import { createDataSourceOptions } from './data-source-options';
import { describeDatabaseWithoutPassword } from './database-url';

const SETUP_STEPS = 'Run pnpm db:up, then pnpm db:migrate, or set DATABASE_URL.';

function getDriverMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || ('code' in error ? String(error.code) : error.name);
}

export async function openDataSource(databaseUrl: string): Promise<DataSource> {
  try {
    return await new DataSource(createDataSourceOptions(databaseUrl)).initialize();
  } catch (error) {
    throw new Error(
      `Cannot connect to the database at ${describeDatabaseWithoutPassword(databaseUrl)}: ${getDriverMessage(error)}. ${SETUP_STEPS}`,
      { cause: error },
    );
  }
}

export async function openMigratedDataSource(databaseUrl: string): Promise<DataSource> {
  const dataSource = await openDataSource(databaseUrl);
  if (await dataSource.showMigrations()) {
    await dataSource.destroy();
    throw new Error(
      `The database at ${describeDatabaseWithoutPassword(databaseUrl)} has migrations to run. ${SETUP_STEPS}`,
    );
  }
  return dataSource;
}
