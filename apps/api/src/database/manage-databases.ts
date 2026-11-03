import { DataSource } from 'typeorm';
import { getDatabaseName, withDatabaseName } from './database-url';
import { openDataSource } from './open-data-source';

const MAINTENANCE_DATABASE = 'postgres';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function withMaintenanceConnection(
  databaseUrl: string,
  action: (maintenance: DataSource) => Promise<void>,
): Promise<void> {
  const maintenance = await openDataSource(withDatabaseName(databaseUrl, MAINTENANCE_DATABASE));
  try {
    await action(maintenance);
  } finally {
    await maintenance.destroy();
  }
}

export async function createDatabaseIfMissing(databaseUrl: string): Promise<void> {
  const databaseName = getDatabaseName(databaseUrl);
  await withMaintenanceConnection(databaseUrl, async (maintenance) => {
    const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (existing.length === 0) {
      await maintenance.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    }
  });
}

export async function dropDatabase(databaseUrl: string): Promise<void> {
  const databaseName = getDatabaseName(databaseUrl);
  await withMaintenanceConnection(databaseUrl, async (maintenance) => {
    await maintenance.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  });
}
