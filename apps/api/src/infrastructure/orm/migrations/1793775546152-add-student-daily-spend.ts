import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudentDailySpend1793775546152 implements MigrationInterface {
  name = 'AddStudentDailySpend1793775546152';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "student_daily_spend" ("student_id" uuid NOT NULL, "spent_on" date NOT NULL, "spent_micro_usd" bigint NOT NULL, CONSTRAINT "PK_03203059825d6cd543d34b8bb3c" PRIMARY KEY ("student_id", "spent_on"))`);
    await queryRunner.query(`ALTER TABLE "student_daily_spend" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "student_daily_spend" ADD CONSTRAINT "FK_77a39fc4978fe5f52c715d81b41" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "student_daily_spend" DROP CONSTRAINT "FK_77a39fc4978fe5f52c715d81b41"`);
    await queryRunner.query(`DROP TABLE "student_daily_spend"`);
  }
}
