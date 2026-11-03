import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { createTestDatabase } from '../../../test/test-database';
import type { TestDatabase } from '../../../test/test-database';
import { replaceExampleData } from './example-data';
import { openMigratedDataSource } from './open-data-source';

// Supabase gives these roles every right on new tables in public, and a test database has no such default.
const GRANT_WHAT_SUPABASE_GRANTS = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated`;

const TABLES_WITH_FIRST_COLUMN_QUERY = `
  SELECT relation.relname AS name, attribute.attname AS first_column
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid AND attribute.attnum = 1
  WHERE relation.relkind IN ('r', 'p') AND namespace.nspname = 'public'`;

const ROW_SECURITY_REFUSAL = 'new row violates row-level security policy';

interface PublicTable {
  name: string;
  first_column: string;
}

describe.each(['anon', 'authenticated'])('the %s role on tables it has every right on', (role) => {
  let testDatabase: TestDatabase;
  let dataSource: DataSource;
  let tables: PublicTable[];

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    dataSource = await openMigratedDataSource(testDatabase.databaseUrl);
    await replaceExampleData(dataSource);
    await dataSource.query('INSERT INTO "closed_accounts" ("auth_user_id") VALUES ($1)', [randomUUID()]);
    await dataSource.query(GRANT_WHAT_SUPABASE_GRANTS);
    tables = await dataSource.query(TABLES_WITH_FIRST_COLUMN_QUERY);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await testDatabase?.drop();
  });

  function runAsRole(sql: string) {
    return dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL ROLE ${role}`);
      return manager.query(sql);
    });
  }

  async function countRows(table: PublicTable, count: (sql: string) => Promise<{ total: number }[]>) {
    const [{ total }] = (await count(`SELECT count(*)::int AS total FROM "${table.name}"`)) as [{ total: number }];
    return total;
  }

  it('checks the tables that hold rows', async () => {
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(['migrations', 'students', 'student_profiles', 'sessions', 'closed_accounts']),
    );
    for (const table of tables) {
      expect(await countRows(table, (sql) => dataSource.query(sql))).toBeGreaterThan(0);
    }
  });

  it('reads no row', async () => {
    for (const table of tables) {
      expect(await countRows(table, runAsRole)).toBe(0);
    }
  });

  it('adds no row', async () => {
    for (const table of tables) {
      await expect(runAsRole(`INSERT INTO "${table.name}" DEFAULT VALUES`)).rejects.toThrow(ROW_SECURITY_REFUSAL);
    }
  });

  it('changes and deletes no row', async () => {
    for (const table of tables) {
      const [, updatedRows] = await runAsRole(`UPDATE "${table.name}" SET "${table.first_column}" = "${table.first_column}"`);
      const [, deletedRows] = await runAsRole(`DELETE FROM "${table.name}"`);

      expect([updatedRows, deletedRows]).toEqual([0, 0]);
      expect(await countRows(table, (sql) => dataSource.query(sql))).toBeGreaterThan(0);
    }
  });
});
