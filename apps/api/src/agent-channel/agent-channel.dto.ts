import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsInt, IsNumber, IsObject, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsStorableJson, IsStorableText } from '../is-storable-text';
import { MAX_SESSION_TITLE_LENGTH } from '../sessions/session.dto';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';

const LARGEST_CHARGE_USD = 10;
const MOST_EVENTS_IN_A_SAVE = 500;
const LARGEST_POSTGRES_INTEGER = 2_147_483_647;

export class AddSpendBodyDto {
  /** What the turn cost, in US dollars. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(LARGEST_CHARGE_USD)
  usd!: number;
}

export class LoggedEventDto {
  /** Where this event sits in its run's log. Saving the same place again changes nothing, unless it is a beat that has played further. */
  @IsInt()
  @Min(0)
  @Max(LARGEST_POSTGRES_INTEGER)
  seq!: number;

  /** The whole event, which the agent has parsed. */
  @IsObject()
  @IsStorableJson()
  event!: object;
}

export class SaveLogBodyDto {
  /** Names one tutor's run of this session, because each new tutor starts its own clock and count. */
  @IsUUID()
  runId!: string;

  @Type(() => Date)
  @IsDate()
  runStartedAt!: Date;

  @IsArray()
  @ArrayMaxSize(MOST_EVENTS_IN_A_SAVE)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LoggedEventDto)
  events!: LoggedEventDto[];
}

export class SaveRecapBodyDto {
  @IsObject()
  @IsStorableJson()
  recap!: object;
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
}
