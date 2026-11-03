import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignInAndAgeGate1793686438335 implements MigrationInterface {
  name = 'AddSignInAndAgeGate1793686438335';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A student from before sign-in belongs to no user, and only example data exists, which the seed restores.
    await queryRunner.query(`DELETE FROM "app"."students"`);
    await queryRunner.query(`CREATE TABLE "app"."closed_accounts" ("auth_user_id" uuid NOT NULL, "closed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d895fdd9bf51b09256f852293d8" PRIMARY KEY ("auth_user_id"))`);
    await queryRunner.query(`ALTER TABLE "app"."students" ADD "auth_user_id" uuid NOT NULL`);
    await queryRunner.query(`ALTER TABLE "app"."students" ADD CONSTRAINT "UQ_28e48ce9163a18738864bc7c6ca" UNIQUE ("auth_user_id")`);
    await queryRunner.query(`ALTER TABLE "app"."students" ADD "birth_date" date NOT NULL`);
    await queryRunner.query(`ALTER TABLE "app"."students" ADD "parent_consent_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "app"."students" ALTER COLUMN "name" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "app"."students" SET "name" = '' WHERE "name" IS NULL`);
    await queryRunner.query(`ALTER TABLE "app"."students" ALTER COLUMN "name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "app"."students" DROP COLUMN "parent_consent_at"`);
    await queryRunner.query(`ALTER TABLE "app"."students" DROP COLUMN "birth_date"`);
    await queryRunner.query(`ALTER TABLE "app"."students" DROP CONSTRAINT "UQ_28e48ce9163a18738864bc7c6ca"`);
    await queryRunner.query(`ALTER TABLE "app"."students" DROP COLUMN "auth_user_id"`);
    await queryRunner.query(`DROP TABLE "app"."closed_accounts"`);
  }
}
