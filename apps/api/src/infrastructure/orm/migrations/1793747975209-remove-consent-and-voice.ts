import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveConsentAndVoice1793747975209 implements MigrationInterface {
  name = 'RemoveConsentAndVoice1793747975209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "parent_consent_at"`);
    await queryRunner.query(`ALTER TABLE "student_profiles" DROP COLUMN "voice"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "student_profiles" ADD "voice" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "students" ADD "parent_consent_at" TIMESTAMP WITH TIME ZONE`);
  }
}
