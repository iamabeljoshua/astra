import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Entity, PrimaryColumn } from 'typeorm';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { createTestDatabase } from '../../../test/test-database';
import type { TestDatabase } from '../../../test/test-database';
import { createDataSourceOptions } from './data-source-options';
import { isMigrationName, planMigration, writeMigration } from './generate-migration';
import { openMigratedDataSource } from './open-data-source';

const LATER_THAN_EVERY_MIGRATION = 9999999999999;

@Entity('planted_things')
class PlantedThingEntity {
  @PrimaryColumn('uuid')
  id!: string;
}

describe('generating a migration', () => {
  let testDatabase: TestDatabase;
  let folder: string;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    folder = mkdtempSync(join(__dirname, '../../../test/generated-migration-'));
  });

  afterAll(async () => {
    rmSync(folder, { recursive: true, force: true });
    await testDatabase?.drop();
  });

  function openWithPlantedEntity(extraOptions: Partial<DataSourceOptions> = {}) {
    const options = createDataSourceOptions(testDatabase.databaseUrl);
    return new DataSource({
      ...options,
      entities: [...(options.entities as string[]), PlantedThingEntity],
      ...extraOptions,
    } as DataSourceOptions).initialize();
  }

  it('plans nothing when the entities match the migrations', async () => {
    const dataSource = await openMigratedDataSource(testDatabase.databaseUrl);

    expect(await planMigration(dataSource)).toEqual({ up: [], down: [] });

    await dataSource.destroy();
  });

  it('writes a file that TypeORM runs, and the new table has row security and no policy', async () => {
    const planner = await openWithPlantedEntity();
    const plan = await planMigration(planner);
    await planner.destroy();

    const path = writeMigration({ folder, name: 'add-planted-things', timestamp: LATER_THAN_EVERY_MIGRATION, plan });
    expect(readFileSync(path, 'utf8')).toContain(`class AddPlantedThings${LATER_THAN_EVERY_MIGRATION} implements`);

    const options = createDataSourceOptions(testDatabase.databaseUrl);
    const dataSource = await openWithPlantedEntity({
      migrations: [...(options.migrations as string[]), join(folder, '*.ts')],
    });
    await dataSource.runMigrations();

    expect(
      await dataSource.query(`SELECT relrowsecurity AS has_row_security FROM pg_class WHERE oid = 'planted_things'::regclass`),
    ).toEqual([{ has_row_security: true }]);
    expect(await dataSource.query('SELECT policyname FROM pg_policies')).toEqual([]);
    expect((await planMigration(dataSource)).up).toEqual([]);

    await dataSource.undoLastMigration();
    expect(await dataSource.query(`SELECT to_regclass('planted_things') AS table_path`)).toEqual([{ table_path: null }]);
    await dataSource.destroy();
  });

  it('keeps a value that would end the query text in the file', () => {
    const query = 'SELECT `a` AS "${b}", \'c\\d\'';
    const path = writeMigration({
      folder,
      name: 'odd-text',
      timestamp: LATER_THAN_EVERY_MIGRATION,
      plan: { up: [{ query, parameters: ['value'] }], down: [] },
    });

    expect(readFileSync(path, 'utf8')).toContain(
      'await queryRunner.query(`SELECT \\`a\\` AS "\\${b}", \'c\\\\d\'`, ["value"]);',
    );
    rmSync(path);
  });

  it.each(['add-student-goal', 'add2-things'])('accepts the name %s', (name) => {
    expect(isMigrationName(name)).toBe(true);
  });

  it.each(['', 'AddThing', 'add thing', '../add-thing', 'add-', '1-add'])('refuses the name "%s"', (name) => {
    expect(isMigrationName(name)).toBe(false);
  });
});
