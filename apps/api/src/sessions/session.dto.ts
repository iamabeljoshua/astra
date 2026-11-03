import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { SESSION_LANGUAGES, SESSION_STATUSES } from './session-options';
import type { SessionLanguage, SessionStatus } from './session-options';

const MAX_SESSION_TITLE_LENGTH = 200;
const MAX_SESSION_SUBJECT_LENGTH = 60;
const DEFAULT_SESSIONS_PER_LIST = 50;
const MAX_SESSIONS_PER_LIST = 100;

export class CreateSessionBodyDto {
  /** What the session is about. */
  @IsString()
  @MaxLength(MAX_SESSION_TITLE_LENGTH)
  @IsStorableText()
  title!: string;

  /** The subject the session belongs to. */
  @IsString()
  @MaxLength(MAX_SESSION_SUBJECT_LENGTH)
  @IsStorableText()
  subject!: string;

  /** The language the tutor speaks in this session. */
  @IsIn(SESSION_LANGUAGES)
  language!: SessionLanguage;
}

export class ListSessionsQueryDto {
  /** The largest number of sessions to return. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SESSIONS_PER_LIST)
  limit: number = DEFAULT_SESSIONS_PER_LIST;
}

export class SessionResponseDto {
  /** The ID of the session. */
  id!: string;

  /** What the session is about. */
  title!: string;

  /** The subject the session belongs to. */
  subject!: string;

  /** The language the tutor speaks in this session. */
  @IsIn(SESSION_LANGUAGES)
  language!: SessionLanguage;

  /** Whether the session is still going or has finished. */
  @IsIn(SESSION_STATUSES)
  status!: SessionStatus;

  /** When the session started. */
  startedAt!: Date;

  /** How long the session has run, in seconds. */
  durationSeconds!: number;

  /** A line on where the session left off, or null if there is none. */
  detail!: string | null;

  /** The name of the picture that the web app shows for this session, or null if there is none. */
  artwork!: string | null;
}
