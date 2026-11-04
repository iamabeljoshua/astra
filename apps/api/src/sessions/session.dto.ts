import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ARTWORK_NAMES } from '../artwork';
import type { ArtworkName } from '../artwork';
import { IsStorableText } from '../is-storable-text';
import { LIBRARY_TOPIC_IDS } from '../picks/library';
import { ToStrictInteger } from '../to-strict-integer';
import { SESSION_END_STATUS, SESSION_LANGUAGES, SESSION_STATUSES } from './session-options';
import type { SessionLanguage, SessionStatus } from './session-options';

export const MAX_SESSION_TITLE_LENGTH = 200;
const MAX_SESSION_SUBJECT_LENGTH = 60;
const MAX_SESSIONS_PER_LIST = 100;
const MAX_SEARCH_LENGTH = 200;
const LARGEST_DATABASE_INTEGER = 2_147_483_647;
const MAX_SESSION_SECONDS = 24 * 60 * 60;
const MAX_RECAP_ANSWER_LENGTH = 2000;

export class CreateSessionBodyDto {
  /** What the session is about. When a card started this session, the API uses the title in its library and ignores this one. */
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

  /** The name of the picture that the web app shows for this session. Leave it out if there is none. */
  @IsOptional()
  @IsIn(ARTWORK_NAMES)
  artwork?: ArtworkName;

  /** The ID of the topic, when a card started this session. Leave it out for a typed question. */
  @IsOptional()
  @IsIn(LIBRARY_TOPIC_IDS)
  topicId?: string;
}

export class ListSessionsQueryDto {
  /** The largest number of sessions to return. The API returns up to 50 if this is left out. */
  @IsOptional()
  @ToStrictInteger()
  @IsInt()
  @Min(1)
  @Max(MAX_SESSIONS_PER_LIST)
  limit?: number;

  /** How many of the newest matching sessions to skip. The API skips none if this is left out. */
  @IsOptional()
  @ToStrictInteger()
  @IsInt()
  @Min(0)
  @Max(LARGEST_DATABASE_INTEGER)
  offset?: number;

  /** Text to find in a session's title or subject, in any letter case. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  @IsStorableText()
  search?: string;
}

export class SessionParamsDto {
  /** The ID of the session. */
  @IsUUID()
  id!: string;
}

export class UpdateSessionBodyDto {
  /** How long the session has run in total, in seconds. A longer length is saved as 24 hours, so ending a session always works. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? Math.min(value, MAX_SESSION_SECONDS) : value))
  @IsInt()
  @Min(0)
  @Max(MAX_SESSION_SECONDS)
  durationSeconds!: number;

  /** Send `finished` to end the session. A finished session does not change again. */
  @IsOptional()
  @IsIn([SESSION_END_STATUS])
  status?: typeof SESSION_END_STATUS;

  /** With `finished`, leaves the room open for a short while, so the tutor can speak its recap. */
  @IsOptional()
  @IsBoolean()
  keepsRoomForRecap?: boolean;
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
  @IsIn(ARTWORK_NAMES)
  artwork!: ArtworkName | null;

  /** Whether this session has a saved log to replay. */
  canReplay!: boolean;
}

export class SaveRecapAnswerBodyDto {
  /** The student's own answer to the thing the recap asked them to try. */
  @IsString()
  @MaxLength(MAX_RECAP_ANSWER_LENGTH)
  @IsStorableText()
  answer!: string;
}

export class SessionReplayRunDto {
  /** When this stretch of the session started. A session the student came back to has one stretch per tutor. */
  startedAt!: Date;

  /** What happened in this stretch, in order, as the agent logged it. Read these with `parseSessionEvent`. */
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  events!: object[];
}

export class SessionReplayResponseDto {
  /** What the session's end said, or null if it said nothing. Read this with `parseSessionRecap`. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  recap!: object | null;

  /** What the student answered to the recap's thing to try, or null. */
  recapAnswer!: string | null;

  /** Each stretch of the session, oldest first. */
  runs!: SessionReplayRunDto[];
}
