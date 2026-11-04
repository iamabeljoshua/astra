import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionLogAndRecap1793811283935 implements MigrationInterface {
  name = 'AddSessionLogAndRecap1793811283935';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "session_log_events" ("session_id" uuid NOT NULL, "run_id" uuid NOT NULL, "seq" integer NOT NULL, "run_started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "event" jsonb NOT NULL, CONSTRAINT "PK_c6a2445863626a9fb1be6083610" PRIMARY KEY ("session_id", "run_id", "seq"))`);
    await queryRunner.query(`ALTER TABLE "session_log_events" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "recap" jsonb`);
    await queryRunner.query(`ALTER TABLE "sessions" ADD "replay_deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "session_log_events" ADD CONSTRAINT "FK_99c76a3e947961bc8f2ab9c14e5" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "session_log_events" DROP CONSTRAINT "FK_99c76a3e947961bc8f2ab9c14e5"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "replay_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "recap"`);
    await queryRunner.query(`DROP TABLE "session_log_events"`);
  }
}
