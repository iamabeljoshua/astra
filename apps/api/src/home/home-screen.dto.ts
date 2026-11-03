import { IsIn } from 'class-validator';
import { ARTWORK_NAMES } from '../artwork';
import type { ArtworkName } from '../artwork';
import { SessionResponseDto } from '../sessions/session.dto';

export class PickCardResponseDto {
  /** The ID of the card. */
  id!: string;

  /** The topic that the card offers. */
  title!: string;

  /** The subject the topic belongs to. */
  subject!: string;

  /** How long a session on this topic takes, in minutes. */
  lengthMinutes!: number;

  /** Why the card suits this student. */
  reason!: string;

  /** The name of the picture that the web app shows on this card. */
  @IsIn(ARTWORK_NAMES)
  artwork!: ArtworkName;
}

export class HomeScreenResponseDto {
  /** The name the tutor calls the student. */
  studentName!: string;

  /** The student's newest unfinished session, or null if there is none. */
  continueSession!: SessionResponseDto | null;

  /** The cards offered to this student. */
  picks!: PickCardResponseDto[];
}
