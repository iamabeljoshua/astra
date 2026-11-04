import { IsIn } from 'class-validator';
import { ARTWORK_NAMES } from '../artwork';
import type { ArtworkName } from '../artwork';
import { LIBRARY_TOPIC_IDS } from '../picks/library';
import { SessionResponseDto } from '../sessions/session.dto';

export class PickCardResponseDto {
  /** The card's own ID. */
  id!: string;

  /** The library topic that the card starts, or null for a lesson on something from the student's notes that the library does not hold. */
  @IsIn(LIBRARY_TOPIC_IDS)
  topicId!: string | null;

  /** The topic that the card offers. */
  title!: string;

  /** The subject the topic belongs to. */
  subject!: string;

  /** How long a session on this topic takes, in minutes. */
  lengthMinutes!: number;

  /** The first thing the tutor says when a session on this topic starts, or null when the tutor opens in its own words. */
  openingLine!: string | null;

  /** Why the card suits this student. */
  reason!: string;

  /** The day the reason happened, for the page to add in the student's own time zone. Null when the reason names no day. */
  reasonDate!: Date | null;

  /** The name of the picture that the web app shows on this card. */
  @IsIn(ARTWORK_NAMES)
  artwork!: ArtworkName;

  /** The unfinished session that this card opens again, or null if the card starts a new session. */
  continueSessionId!: string | null;
}

export class HomeScreenResponseDto {
  /** The name the tutor calls the student, or null until onboarding saves one. */
  studentName!: string | null;

  /** True until the student has started a session. */
  isNewStudent!: boolean;

  /** The student's newest unfinished session, or null if there is none. */
  continueSession!: SessionResponseDto | null;

  /** The cards offered to this student. */
  picks!: PickCardResponseDto[];
}
