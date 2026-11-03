import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';

const NEW_TABLE = /^CREATE TABLE ("[^"]+"(?:\."[^"]+")?)/;
const MIGRATION_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TEMPLATE_LITERAL_SPECIALS = /[\\`]|\$\{/g;

interface MigrationQuery {
  query: string;
  parameters?: unknown[];
}

export interface MigrationPlan {
  up: MigrationQuery[];
  down: MigrationQuery[];
}

interface MigrationFile {
  folder: string;
  name: string;
  timestamp: number;
  plan: MigrationPlan;
}

function closeNewTables(queries: MigrationQuery[]): MigrationQuery[] {
  return queries.flatMap((query) => {
    const table = NEW_TABLE.exec(query.query)?.[1];
    return table ? [query, { query: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY` }] : [query];
  });
}

function getClassName(name: string, timestamp: number): string {
  const words = name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `${words.join('')}${timestamp}`;
}

function renderQueries(queries: MigrationQuery[]): string {
  return queries
    .map(({ query, parameters }) => {
      const text = query.replace(TEMPLATE_LITERAL_SPECIALS, '\\$&');
      const values = parameters?.length ? `, ${JSON.stringify(parameters)}` : '';
      return `    await queryRunner.query(\`${text}\`${values});`;
    })
    .join('\n');
}

function renderMigration(className: string, { up, down }: MigrationPlan): string {
  return `import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${renderQueries(up)}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
${renderQueries(down)}
  }
}
`;
}

export function isMigrationName(name: string): boolean {
  return MIGRATION_NAME.test(name);
}

// Compares the entities with the database, and closes every new table to Supabase's anon key.
export async function planMigration(dataSource: DataSource): Promise<MigrationPlan> {
  const { upQueries, downQueries } = await dataSource.driver.createSchemaBuilder().log();
  return { up: closeNewTables(upQueries), down: downQueries.toReversed() };
}

export function writeMigration({ folder, name, timestamp, plan }: MigrationFile): string {
  const path = join(folder, `${timestamp}-${name}.ts`);
  writeFileSync(path, renderMigration(getClassName(name, timestamp), plan));
  return path;
}
