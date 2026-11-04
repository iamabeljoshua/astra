import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLearnerRecord1793810599607 implements MigrationInterface {
  name = 'AddLearnerRecord1793810599607';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."learner_note_kind" AS ENUM('showed', 'struggled', 'cares_about', 'explored')`);
    await queryRunner.query(`CREATE TABLE "learner_notes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "student_id" uuid NOT NULL, "session_id" uuid NOT NULL, "kind" "public"."learner_note_kind" NOT NULL, "topic" text NOT NULL, "topic_key" text NOT NULL, "detail" text, "evidence" jsonb NOT NULL, "noted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_d200f9ff324501cb143b0be2c9d" UNIQUE ("student_id", "session_id", "kind", "topic_key"), CONSTRAINT "PK_96f900eea93ca23703ec1f047e2" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "learner_notes" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`CREATE INDEX "IDX_6da55f99534a0e5095f201e87a" ON "learner_notes"  ("student_id", "noted_at") `);
    await queryRunner.query(`CREATE TABLE "learner_record_updates" ("session_id" uuid NOT NULL, "update_key" text NOT NULL, "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8348eae4fa2a350f3613a4b2d11" PRIMARY KEY ("session_id", "update_key"))`);
    await queryRunner.query(`ALTER TABLE "learner_record_updates" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "learner_notes" ADD CONSTRAINT "FK_31867c4e4c484d855218728d704" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "learner_notes" ADD CONSTRAINT "FK_6d93137c154a38f1d43ea46e58e" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "learner_record_updates" ADD CONSTRAINT "FK_8d525c482e6f719e15c4465107d" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "learner_record_updates" DROP CONSTRAINT "FK_8d525c482e6f719e15c4465107d"`);
    await queryRunner.query(`ALTER TABLE "learner_notes" DROP CONSTRAINT "FK_6d93137c154a38f1d43ea46e58e"`);
    await queryRunner.query(`ALTER TABLE "learner_notes" DROP CONSTRAINT "FK_31867c4e4c484d855218728d704"`);
    await queryRunner.query(`DROP TABLE "learner_record_updates"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6da55f99534a0e5095f201e87a"`);
    await queryRunner.query(`DROP TABLE "learner_notes"`);
    await queryRunner.query(`DROP TYPE "public"."learner_note_kind"`);
  }
}
