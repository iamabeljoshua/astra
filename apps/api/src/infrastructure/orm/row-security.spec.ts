import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { createTestDatabase } from '../../../test/test-database';
import type { TestDatabase } from '../../../test/test-database';
import { EXAMPLE_STUDENT_ID, replaceExampleData } from './example-data';
import { openMigratedDataSource } from './open-data-source';

const GRANT_EVERY_RIGHT = `
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
const TABLES_WITH_EXAMPLE_ROWS = ['migrations', 'students', 'student_profiles', 'sessions', 'closed_accounts', 'student_daily_spend', 'safety_flags', 'closed_address_hashes'];

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
    await dataSource.query(`INSERT INTO "closed_address_hashes" ("address_hash") VALUES ('hash')`);
    await dataSource.query(`INSERT INTO "safety_flags" ("student_id", "kind", "source") VALUES ($1, 'danger', 'tutor')`, [EXAMPLE_STUDENT_ID]);
    await dataSource.query(GRANT_EVERY_RIGHT);
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

  async function countRows(tableName: string, runQuery: (sql: string) => Promise<{ total: number }[]>) {
    const [row] = await runQuery(`SELECT count(*)::int AS total FROM "${tableName}"`);
    return row?.total;
  }

  function countRowsAsOwner(tableName: string) {
    return countRows(tableName, (sql) => dataSource.query(sql));
  }

  it('has real rows to protect, so an empty table cannot pass by accident', async () => {
    for (const tableName of TABLES_WITH_EXAMPLE_ROWS) {
      expect(await countRowsAsOwner(tableName)).toBeGreaterThan(0);
    }
  });

  it('reads no row', async () => {
    for (const table of tables) {
      expect(await countRows(table.name, runAsRole)).toBe(0);
    }
  });

  it('adds no row', async () => {
    for (const table of tables) {
      await expect(runAsRole(`INSERT INTO "${table.name}" DEFAULT VALUES`)).rejects.toThrow(ROW_SECURITY_REFUSAL);
    }
  });

  it('changes and deletes no row', async () => {
    for (const table of tables) {
      const rowsBefore = await countRowsAsOwner(table.name);

      const [, updatedRows] = await runAsRole(`UPDATE "${table.name}" SET "${table.first_column}" = "${table.first_column}"`);
      const [, deletedRows] = await runAsRole(`DELETE FROM "${table.name}"`);

      expect([updatedRows, deletedRows]).toEqual([0, 0]);
      expect(await countRowsAsOwner(table.name)).toBe(rowsBefore);
    }
  });
});
