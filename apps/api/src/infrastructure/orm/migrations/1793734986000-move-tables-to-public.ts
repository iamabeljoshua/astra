import type { MigrationInterface, QueryRunner } from 'typeorm';

const MOVED_TABLES = ['students', 'student_profiles', 'sessions', 'closed_accounts'];

// The generator cannot see a move between schemas, so this one migration is written by hand.
export class MoveTablesToPublic1793734986000 implements MigrationInterface {
  name = 'MoveTablesToPublic1793734986000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of MOVED_TABLES) {
      await queryRunner.query(`ALTER TABLE "app"."${table}" ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "app"."${table}" SET SCHEMA "public"`);
    }
    await queryRunner.query(`ALTER TYPE "app"."session_status" SET SCHEMA "public"`);
    await queryRunner.query(`ALTER TABLE "public"."migrations" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP SCHEMA "app"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA "app"`);
    await queryRunner.query(`ALTER TABLE "public"."migrations" DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TYPE "public"."session_status" SET SCHEMA "app"`);
    for (const table of MOVED_TABLES) {
      await queryRunner.query(`ALTER TABLE "public"."${table}" SET SCHEMA "app"`);
      await queryRunner.query(`ALTER TABLE "app"."${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
