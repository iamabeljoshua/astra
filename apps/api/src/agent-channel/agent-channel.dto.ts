import { IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { MAX_SESSION_TITLE_LENGTH } from '../sessions/session.dto';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';

const LARGEST_CHARGE_USD = 10;

export class AddSpendBodyDto {
  /** What the turn cost, in US dollars. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(LARGEST_CHARGE_USD)
  usd!: number;
}

export class SetTitleBodyDto {
  /** What the session is about now. */
  @IsString()
  @MaxLength(MAX_SESSION_TITLE_LENGTH)
  @IsStorableText()
  title!: string;
}

export interface TutorBrief {
  level: StudentLevel | null;
  interests: StudentInterest[];
  goal: StudentGoal | null;
  /** The library's title when a card started this session, and null for a typed question. */
  cardTitle: string | null;
}
