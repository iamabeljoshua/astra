import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionTopicId1793751764295 implements MigrationInterface {
  name = 'AddSessionTopicId1793751764295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "topic_id" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "topic_id"`);
  }
}
