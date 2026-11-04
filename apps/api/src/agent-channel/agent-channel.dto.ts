import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsInt, IsNumber, IsObject, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';

const LARGEST_CHARGE_USD = 10;
const MOST_EVENTS_IN_A_SAVE = 500;

export class AddSpendBodyDto {
  /** What the turn cost, in US dollars. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(LARGEST_CHARGE_USD)
  usd!: number;
}

export class LoggedEventDto {
  /** Where this event sits in its run's log. Saving the same place again replaces it, because a beat's row grows as it plays. */
  @IsInt()
  @Min(0)
  seq!: number;

  /** The whole event, which the agent has parsed. */
  @IsObject()
  event!: object;
}

export class SaveLogBodyDto {
  /** Names one tutor's run of this session, because each new tutor starts its own clock and count. */
  @IsUUID()
  runId!: string;

  /** When that run started. */
  @Type(() => Date)
  @IsDate()
  runStartedAt!: Date;

  /** The events to save. */
  @IsArray()
  @ArrayMaxSize(MOST_EVENTS_IN_A_SAVE)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LoggedEventDto)
  events!: LoggedEventDto[];
}

export class SaveRecapBodyDto {
  /** What the session's end said. */
  @IsObject()
  recap!: object;
}

export interface TutorBrief {
  level: StudentLevel | null;
  interests: StudentInterest[];
  goal: StudentGoal | null;
}
