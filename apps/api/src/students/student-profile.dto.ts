import { ArrayUnique, IsArray, IsIn, IsString, MaxLength } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { STUDENT_GOALS, STUDENT_INTERESTS, STUDENT_LEVELS } from './student-profile-options';
import type { StudentGoal, StudentInterest, StudentLevel } from './student-profile-options';

export const MAX_STUDENT_NAME_LENGTH = 60;

export class SaveStudentProfileBodyDto {
  /** The name the tutor calls the student. */
  @IsString()
  @MaxLength(MAX_STUDENT_NAME_LENGTH)
  @IsStorableText()
  name!: string;

  /** The interests the student chose from the list. A student can choose none. */
  @IsArray()
  @ArrayUnique()
  @IsIn(STUDENT_INTERESTS, { each: true })
  interests!: StudentInterest[];

  /** The stage of schooling the student is at. */
  @IsIn(STUDENT_LEVELS)
  level!: StudentLevel;

  /** Why the student is here. */
  @IsIn(STUDENT_GOALS)
  goal!: StudentGoal;
}

export class StudentProfileResponseDto {
  /** The interests the student chose from the list. */
  @IsIn(STUDENT_INTERESTS, { each: true })
  interests!: StudentInterest[];

  /** The stage of schooling the student is at. */
  @IsIn(STUDENT_LEVELS)
  level!: StudentLevel;

  /** Why the student is here. */
  @IsIn(STUDENT_GOALS)
  goal!: StudentGoal;
}
