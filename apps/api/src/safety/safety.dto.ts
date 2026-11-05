import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SAFETY_FLAG_KINDS, SAFETY_FLAG_SOURCES } from './safety-flag-options';
import type { SafetyFlagKind, SafetyFlagSource } from './safety-flag-options';

export class AddSafetyFlagBodyDto {
  /** What kind of concern the check found. */
  @IsIn(SAFETY_FLAG_KINDS)
  kind!: SafetyFlagKind;

  /** Whose words raised it, the student's or the tutor's. */
  @IsIn(SAFETY_FLAG_SOURCES)
  source!: SafetyFlagSource;
}

export class SafetyFlagResponseDto {
  /** The ID of the flag. */
  id!: string;

  /** The student the flag is about. */
  studentId!: string;

  /** The session it came from, or null if that session is gone. */
  sessionId!: string | null;

  /** What kind of concern the check found. */
  @ApiProperty({ enum: SAFETY_FLAG_KINDS, enumName: 'SafetyFlagKind' })
  kind!: SafetyFlagKind;

  /** Whose words raised it, the student's or the tutor's. */
  @ApiProperty({ enum: SAFETY_FLAG_SOURCES, enumName: 'SafetyFlagSource' })
  source!: SafetyFlagSource;

  /** When the flag was raised. */
  createdAt!: Date;

  /** When a reviewer marked it reviewed, or null if nobody has yet. */
  reviewedAt!: Date | null;

  /** The auth user who reviewed it, or null if nobody has yet. */
  reviewedBy!: string | null;
}
