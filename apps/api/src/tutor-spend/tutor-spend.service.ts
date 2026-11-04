import { Injectable } from '@nestjs/common';
import { StudentSpendRepository } from '../infrastructure/orm/repositories/student-spend.repository';

const MICRO_USD_PER_USD = 1_000_000;
const DEFAULT_DAILY_LIMIT_USD = 3;
const DATE_LENGTH = 'YYYY-MM-DD'.length;

const toMicroUsd = (usd: number) => Math.round(usd * MICRO_USD_PER_USD);

function getUtcDay(now: Date): string {
  return now.toISOString().slice(0, DATE_LENGTH);
}

// An unusable value falls back to the default, so a typo cannot lift the limit.
function getDailyLimitMicroUsd({ ASTRA_DAILY_LIMIT_USD: configured }: NodeJS.ProcessEnv): number {
  const limitUsd = Number(configured || DEFAULT_DAILY_LIMIT_USD);
  return toMicroUsd(Number.isFinite(limitUsd) && limitUsd >= 0 ? limitUsd : DEFAULT_DAILY_LIMIT_USD);
}

const isOverDailyLimit = (dayTotalMicroUsd: bigint) => dayTotalMicroUsd >= getDailyLimitMicroUsd(process.env);

@Injectable()
export class TutorSpendService {
  constructor(private readonly spends: StudentSpendRepository) {}

  async isOverDailyLimit(studentId: string): Promise<boolean> {
    return isOverDailyLimit(await this.spends.findDayTotal(studentId, getUtcDay(new Date())));
  }

  async addSpend(studentId: string, usd: number): Promise<{ isOverDailyLimit: boolean }> {
    const dayTotalMicroUsd = await this.spends.addToDayTotal({ studentId, spentOn: getUtcDay(new Date()), microUsd: toMicroUsd(usd) });
    return { isOverDailyLimit: isOverDailyLimit(dayTotalMicroUsd) };
  }
}
