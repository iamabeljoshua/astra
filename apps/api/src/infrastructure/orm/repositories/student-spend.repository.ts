import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import { StudentDailySpendEntity } from '../entities/student-daily-spend.entity';

const ADD_TO_DAY_TOTAL = `
  INSERT INTO "student_daily_spend" ("student_id", "spent_on", "spent_micro_usd")
  VALUES ($1, $2, $3)
  ON CONFLICT ("student_id", "spent_on")
  DO UPDATE SET "spent_micro_usd" = "student_daily_spend"."spent_micro_usd" + EXCLUDED."spent_micro_usd"
  RETURNING "spent_micro_usd"`;

interface DayCharge {
  studentId: string;
  spentOn: string;
  microUsd: number;
}

@Injectable()
export class StudentSpendRepository {
  private readonly spends: Repository<StudentDailySpendEntity>;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.spends = dataSource.getRepository(StudentDailySpendEntity);
  }

  // One statement, so two turns that end together both count.
  async addToDayTotal({ studentId, spentOn, microUsd }: DayCharge): Promise<bigint> {
    const [row] = (await this.dataSource.query(ADD_TO_DAY_TOTAL, [studentId, spentOn, microUsd])) as [{ spent_micro_usd: string }];
    return BigInt(row.spent_micro_usd);
  }

  async findDayTotal(studentId: string, spentOn: string): Promise<bigint> {
    const spend = await this.spends.findOneBy({ studentId, spentOn });
    return BigInt(spend?.spentMicroUsd ?? 0);
  }
}
