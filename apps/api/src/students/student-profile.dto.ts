import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { STUDENT_GOALS, STUDENT_LEVELS, TUTOR_VOICES } from './student-profile-options';
import type { StudentGoal, StudentLevel, TutorVoice } from './student-profile-options';

const MAX_INTERESTS = 20;
const MAX_INTEREST_LENGTH = 60;

export class SaveStudentProfileBodyDto {
  /** What the student is into. Onboarding lets a student skip this, so the list can be empty. */
  @IsArray()
  @ArrayMaxSize(MAX_INTERESTS)
  @IsString({ each: true })
  @MaxLength(MAX_INTEREST_LENGTH, { each: true })
  @IsStorableText({ each: true })
  interests!: string[];

  /** The stage of schooling the student is at. */
  @IsIn(STUDENT_LEVELS)
  level!: StudentLevel;

  /** Why the student is here. */
  @IsIn(STUDENT_GOALS)
  goal!: StudentGoal;

  /** The tutor voice the student picked. */
  @IsIn(TUTOR_VOICES)
  voice!: TutorVoice;
}

export class StudentProfileResponseDto {
  /** What the student is into. */
  interests!: string[];

  /** The stage of schooling the student is at. */
  @IsIn(STUDENT_LEVELS)
  level!: StudentLevel;

  /** Why the student is here. */
  @IsIn(STUDENT_GOALS)
  goal!: StudentGoal;

  /** The tutor voice the student picked. */
  @IsIn(TUTOR_VOICES)
  voice!: TutorVoice;
}
