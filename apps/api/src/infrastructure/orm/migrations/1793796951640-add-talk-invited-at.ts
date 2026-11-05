import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTalkInvitedAt1793796951640 implements MigrationInterface {
  name = 'AddTalkInvitedAt1793796951640';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" ADD "talk_invited_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "talk_invited_at"`);
  }
}
