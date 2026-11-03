import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStudentsAndSessions1793666578779 implements MigrationInterface {
  name = 'CreateStudentsAndSessions1793666578779';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'finished')`);
    await queryRunner.query(`CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "student_id" uuid NOT NULL, "title" text NOT NULL, "subject" text NOT NULL, "language" text NOT NULL, "status" "public"."session_status" NOT NULL DEFAULT 'in_progress', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "duration_seconds" integer NOT NULL DEFAULT '0', "detail" text, "artwork" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_d25cda32a7dfed8bd88701abf4" ON "sessions"  ("student_id", "started_at") `);
    await queryRunner.query(`CREATE TABLE "student_profiles" ("student_id" uuid NOT NULL, "interests" text array NOT NULL, "level" text NOT NULL, "goal" text NOT NULL, "voice" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4cedc08d3dc1f2c2da8a12f7a88" PRIMARY KEY ("student_id"))`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD CONSTRAINT "FK_09b10a0e637ff9fed3b328827ce" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "student_profiles" ADD CONSTRAINT "FK_4cedc08d3dc1f2c2da8a12f7a88" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "student_profiles" DROP CONSTRAINT "FK_4cedc08d3dc1f2c2da8a12f7a88"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_09b10a0e637ff9fed3b328827ce"`);
    await queryRunner.query(`DROP TABLE "student_profiles"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d25cda32a7dfed8bd88701abf4"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TYPE "public"."session_status"`);
    await queryRunner.query(`DROP TABLE "students"`);
  }
}
