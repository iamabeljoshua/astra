import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingAndParentConsent1793741443341 implements MigrationInterface {
  name = 'AddOnboardingAndParentConsent1793741443341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "parent_consent_requests" ("student_id" uuid NOT NULL, "parent_email" text NOT NULL, "link_token_hash" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_816b9bc994d9ff70dc4f048dce6" UNIQUE ("link_token_hash"), CONSTRAINT "PK_ddd5e94fb338fe847652ab58fcf" PRIMARY KEY ("student_id"))`);
    await queryRunner.query(`ALTER TABLE "parent_consent_requests" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "student_profiles" ADD "first_question" text`);
    await queryRunner.query(`ALTER TABLE "parent_consent_requests" ADD CONSTRAINT "FK_ddd5e94fb338fe847652ab58fcf" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "parent_consent_requests" DROP CONSTRAINT "FK_ddd5e94fb338fe847652ab58fcf"`);
    await queryRunner.query(`ALTER TABLE "student_profiles" DROP COLUMN "first_question"`);
    await queryRunner.query(`DROP TABLE "parent_consent_requests"`);
  }
}
