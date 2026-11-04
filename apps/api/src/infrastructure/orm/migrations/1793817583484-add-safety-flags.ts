import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSafetyFlags1793817583484 implements MigrationInterface {
  name = 'AddSafetyFlags1793817583484';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."safety_flag_kind" AS ENUM('self_harm', 'abuse', 'danger', 'grooming', 'tutor_slip')`);
    await queryRunner.query(`CREATE TYPE "public"."safety_flag_source" AS ENUM('student', 'tutor')`);
    await queryRunner.query(`CREATE TABLE "safety_flags" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "student_id" uuid NOT NULL, "session_id" uuid, "kind" "public"."safety_flag_kind" NOT NULL, "source" "public"."safety_flag_source" NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reviewed_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, CONSTRAINT "PK_2d0fdfc45618e30dd3c6878bc69" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "safety_flags" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`CREATE INDEX "IDX_5ebcdb26b3af905d9173e5f39f" ON "safety_flags"  ("created_at") `);
    await queryRunner.query(`ALTER TABLE "safety_flags" ADD CONSTRAINT "FK_edb7b544c9d84362b78a7ed7a10" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "safety_flags" ADD CONSTRAINT "FK_39507e520cda35aa43f8a2516bc" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "safety_flags" DROP CONSTRAINT "FK_39507e520cda35aa43f8a2516bc"`);
    await queryRunner.query(`ALTER TABLE "safety_flags" DROP CONSTRAINT "FK_edb7b544c9d84362b78a7ed7a10"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5ebcdb26b3af905d9173e5f39f"`);
    await queryRunner.query(`DROP TABLE "safety_flags"`);
    await queryRunner.query(`DROP TYPE "public"."safety_flag_source"`);
    await queryRunner.query(`DROP TYPE "public"."safety_flag_kind"`);
  }
}
