import type { MigrationInterface, QueryRunner } from 'typeorm';

// A rename was the only way a card session lost its picture, and until now it left the card's topic and subject behind.
export class ClearCardFromMovedSessions1793830000000 implements MigrationInterface {
  name = 'ClearCardFromMovedSessions1793830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "sessions" SET "topic_id" = NULL, "subject" = 'Your question' WHERE "topic_id" IS NOT NULL AND "artwork" IS NULL`);
  }

  public async down(): Promise<void> {
    // The card a session left is not kept anywhere, so there is nothing to restore.
  }
}
