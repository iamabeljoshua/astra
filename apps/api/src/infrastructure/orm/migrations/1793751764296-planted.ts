import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Planted1793751764296 implements MigrationInterface {
  name = 'Planted1793751764296';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "no_such_table_planted" ADD "x" text`);
  }

  public async down(): Promise<void> {}
}
