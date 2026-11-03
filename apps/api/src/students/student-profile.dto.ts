import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { STUDENT_GOALS, STUDENT_LEVELS, TUTOR_VOICES } from './student-profile-options';
import type { StudentGoal, StudentLevel, TutorVoice } from './student-profile-options';

const MAX_INTERESTS = 20;
const MAX_INTEREST_LENGTH = 60;
const MAX_FIRST_QUESTION_LENGTH = 500;
export const MAX_STUDENT_NAME_LENGTH = 60;

export class SaveStudentProfileBodyDto {
  /** The name the tutor calls the student. */
  @IsString()
  @MaxLength(MAX_STUDENT_NAME_LENGTH)
  @IsStorableText()
  name!: string;

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

  /** The student's answer to the tutor's first question, or null until they give it. A null never clears a saved answer. */
  @ValidateIf((body: SaveStudentProfileBodyDto) => body.firstQuestion !== null)
  @IsString()
  @MaxLength(MAX_FIRST_QUESTION_LENGTH)
  @IsStorableText()
  firstQuestion!: string | null;
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

  /** The student's answer to the tutor's first question, or null until they give it. */
  firstQuestion!: string | null;
}
