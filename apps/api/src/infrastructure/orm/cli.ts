import { join } from 'node:path';
import { describeDatabaseWithoutPassword, getDatabaseUrl, requireLocalStack } from './database-url';
import { EXAMPLE_STUDENT_ID, replaceExampleData } from './example-data';
import { isMigrationName, planMigration, writeMigration } from './generate-migration';
import { createDatabaseIfMissing, dropDatabase } from './manage-databases';
import { openDataSourceWithMigrationLog, openMigratedDataSource } from './open-data-source';

const API_PACKAGE_ROOT = join(__dirname, '../../..');
const MIGRATIONS_SOURCE_FOLDER = join(API_PACKAGE_ROOT, 'src/infrastructure/orm/migrations');

async function migrate(databaseUrl: string): Promise<void> {
  await createDatabaseIfMissing(databaseUrl);
  const dataSource = await openDataSourceWithMigrationLog(databaseUrl);
  const appliedMigrations = await dataSource.runMigrations();
  await dataSource.destroy();
  console.log(`Applied ${appliedMigrations.length} migrations to ${describeDatabaseWithoutPassword(databaseUrl)}.`);
}

async function reset(databaseUrl: string): Promise<void> {
  await dropDatabase(databaseUrl);
  await migrate(databaseUrl);
}

async function seed(databaseUrl: string): Promise<void> {
  requireLocalStack(databaseUrl, 'seed');
  const dataSource = await openMigratedDataSource(databaseUrl);
  await replaceExampleData(dataSource);
  await dataSource.destroy();
  console.log(`Seeded example student ${EXAMPLE_STUDENT_ID} in ${describeDatabaseWithoutPassword(databaseUrl)}.`);
}

async function migration(databaseUrl: string, name = ''): Promise<void> {
  if (!isMigrationName(name)) {
    throw new Error('Usage: pnpm db:migration <name>, with a lowercase name such as add-student-goal.');
  }
  requireLocalStack(databaseUrl, 'generate a migration from');
  await migrate(databaseUrl);
  const dataSource = await openMigratedDataSource(databaseUrl);
  const plan = await planMigration(dataSource);
  await dataSource.destroy();
  if (plan.up.length === 0) {
    console.log('The entities match the migrations, so there is nothing to generate.');
    return;
  }
  const path = writeMigration({ folder: MIGRATIONS_SOURCE_FOLDER, name, timestamp: Date.now(), plan });
  console.log(`Wrote ${path}. Run pnpm db:migrate to apply it.`);
}

const COMMANDS: Record<string, (databaseUrl: string, name?: string) => Promise<void>> = { migrate, reset, seed, migration };

async function main(): Promise<void> {
  const [, , commandName = '', name] = process.argv;
  const command = COMMANDS[commandName];
  if (!command) throw new Error(`Usage: pnpm db:<${Object.keys(COMMANDS).join('|')}>`);
  await command(getDatabaseUrl(process.env), name);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
