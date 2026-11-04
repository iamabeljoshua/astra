import { IsNumber, Max, Min } from 'class-validator';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';

const LARGEST_CHARGE_USD = 10;

export class AddSpendBodyDto {
  /** What the turn cost, in US dollars. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(LARGEST_CHARGE_USD)
  usd!: number;
}

export interface TutorBrief {
  level: StudentLevel | null;
  interests: StudentInterest[];
  goal: StudentGoal | null;
  /** The library's title when a card started this session, and null for a typed question. */
  cardTitle: string | null;
}
