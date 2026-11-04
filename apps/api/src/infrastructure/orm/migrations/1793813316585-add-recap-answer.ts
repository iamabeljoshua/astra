import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecapAnswer1793813316585 implements MigrationInterface {
  name = 'AddRecapAnswer1793813316585';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "recap_answer" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "recap_answer"`);
  }
}
