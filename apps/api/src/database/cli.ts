import {
  describeDatabaseWithoutPassword,
  getDatabaseUrl,
  isLocalDatabase,
  isSystemDatabase,
} from './database-url';
import { EXAMPLE_STUDENT_ID, replaceExampleData } from './example-data';
import { createDatabaseIfMissing, dropDatabase } from './manage-databases';
import { openDataSource, openMigratedDataSource } from './open-data-source';

async function migrate(databaseUrl: string): Promise<void> {
  await createDatabaseIfMissing(databaseUrl);
  const dataSource = await openDataSource(databaseUrl);
  const appliedMigrations = await dataSource.runMigrations();
  await dataSource.destroy();
  console.log(`Applied ${appliedMigrations.length} migrations to ${describeDatabaseWithoutPassword(databaseUrl)}.`);
}

async function reset(databaseUrl: string): Promise<void> {
  if (!isLocalDatabase(databaseUrl) || isSystemDatabase(databaseUrl)) {
    throw new Error(
      `Refusing to reset ${describeDatabaseWithoutPassword(databaseUrl)}. Reset works only on a local app database.`,
    );
  }
  await dropDatabase(databaseUrl);
  await migrate(databaseUrl);
}

async function seed(databaseUrl: string): Promise<void> {
  if (!isLocalDatabase(databaseUrl)) {
    throw new Error(
      `Refusing to seed ${describeDatabaseWithoutPassword(databaseUrl)}. Seed works only on a local database.`,
    );
  }
  const dataSource = await openMigratedDataSource(databaseUrl);
  await replaceExampleData(dataSource);
  await dataSource.destroy();
  console.log(`Seeded example student ${EXAMPLE_STUDENT_ID} in ${describeDatabaseWithoutPassword(databaseUrl)}.`);
}

const COMMANDS: Record<string, (databaseUrl: string) => Promise<void>> = { migrate, reset, seed };

async function main(): Promise<void> {
  const command = COMMANDS[process.argv[2] ?? ''];
  if (!command) throw new Error(`Usage: pnpm db:<${Object.keys(COMMANDS).join('|')}>`);
  await command(getDatabaseUrl(process.env));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
