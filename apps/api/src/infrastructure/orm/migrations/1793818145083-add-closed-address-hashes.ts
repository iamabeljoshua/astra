import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClosedAddressHashes1793818145083 implements MigrationInterface {
  name = 'AddClosedAddressHashes1793818145083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "closed_address_hashes" ("address_hash" text NOT NULL, CONSTRAINT "PK_4ac355bb841c7f77d81273f6452" PRIMARY KEY ("address_hash"))`);
    await queryRunner.query(`ALTER TABLE "closed_address_hashes" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "closed_address_hashes"`);
  }
}
