import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import {
  LEARNER_EVIDENCE_CHECKS,
  LEARNER_EVIDENCE_SOURCES,
  LEARNER_NOTE_KINDS,
  MAX_DETAIL_LENGTH,
  MAX_EVIDENCE_PER_NOTE,
  MAX_EVIDENCE_TEXT_LENGTH,
  MAX_NOTES_PER_UPDATE,
  MAX_TOPIC_LENGTH,
  MAX_UPDATE_KEY_LENGTH,
} from './learner-note-options';
import type { LearnerEvidenceCheck, LearnerEvidenceSource, LearnerNoteKind } from './learner-note-options';

export class LearnerNoteParamsDto {
  /** The ID of a note. */
  @IsUUID()
  id!: string;
}

export class LearnerEvidenceDto {
  /** Where this came from. `board` is a line of math or a task that code checked. `words` says the note stands on what the student said. */
  @IsIn(LEARNER_EVIDENCE_SOURCES)
  source!: LearnerEvidenceSource;

  /** The checked line on `board`. Always empty on `words`, because a student's own words are never stored. */
  @IsString()
  @MaxLength(MAX_EVIDENCE_TEXT_LENGTH)
  @IsStorableText()
  text!: string;

  /** What code found when it checked a line of work. Words have no check. */
  @IsOptional()
  @IsIn(LEARNER_EVIDENCE_CHECKS)
  check!: LearnerEvidenceCheck | null;
}

export class LearnerNoteDto {
  /** The note's ID. */
  id!: string;

  /** What the note says about the student: `showed`, `struggled`, `cares_about`, or `explored`. */
  @IsIn(LEARNER_NOTE_KINDS)
  kind!: LearnerNoteKind;

  /** The thing itself, in a few plain words. */
  topic!: string;

  /** One plain detail, if there is one. */
  detail!: string | null;

  /** What really happened, which is why this note exists. */
  @Type(() => LearnerEvidenceDto)
  evidence!: LearnerEvidenceDto[];

  /** The session this note came from. */
  sessionId!: string;

  /** That session's title. */
  sessionTitle!: string;

  /** When the note was written. */
  notedAt!: Date;
}

export class LearnerRecordDto {
  /** Everything the tutor remembers about this student, newest first. */
  @Type(() => LearnerNoteDto)
  notes!: LearnerNoteDto[];
}

export class NewLearnerNoteDto {
  /** What the note says about the student. */
  @IsIn(LEARNER_NOTE_KINDS)
  kind!: LearnerNoteKind;

  /** The thing itself, in a few plain words. */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TOPIC_LENGTH)
  @IsStorableText()
  topic!: string;

  /** One plain detail, if there is one. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_DETAIL_LENGTH)
  @IsStorableText()
  detail!: string | null;

  /** What really happened, which is why this note exists. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVIDENCE_PER_NOTE)
  @ValidateNested({ each: true })
  @Type(() => LearnerEvidenceDto)
  evidence!: LearnerEvidenceDto[];
}

export class WriteLearnerNotesBodyDto {
  /** Names this update, so a repeat of it adds nothing. */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_UPDATE_KEY_LENGTH)
  @IsStorableText()
  updateKey!: string;

  /** The notes to add. */
  @IsArray()
  @ArrayMaxSize(MAX_NOTES_PER_UPDATE)
  @ValidateNested({ each: true })
  @Type(() => NewLearnerNoteDto)
  notes!: NewLearnerNoteDto[];
}
