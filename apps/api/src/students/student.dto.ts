import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { ACCOUNT_STATUSES } from './account-options';
import type { AccountStatus } from './account-options';
import { IsBirthDate } from './is-birth-date';
import { MAX_STUDENT_NAME_LENGTH, StudentProfileResponseDto } from './student-profile.dto';

export class AnswerBirthDateBodyDto {
  /** The student's date of birth, written as YYYY-MM-DD. */
  @IsString()
  @IsBirthDate()
  birthDate!: string;

  /** The name the tutor calls the student. It is stored only if the account opens. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STUDENT_NAME_LENGTH)
  @IsStorableText()
  name?: string | null;
}

export class StudentResponseDto {
  /** The ID of the student. */
  id!: string;

  /** The name the tutor calls the student, or null until onboarding saves one. */
  name!: string | null;

  /** The student's profile, or null until onboarding saves one. */
  profile!: StudentProfileResponseDto | null;
}

export class AccountResponseDto {
  /** Whether this account must answer the date of birth question, can use the app, or is closed. */
  @IsIn(ACCOUNT_STATUSES)
  status!: AccountStatus;

  /** The student, or null unless the status is active. */
  student!: StudentResponseDto | null;
}

export class NoteTalkInvitationBodyDto {
  /** Always true. The tutor told this student they can talk. */
  @IsIn([true])
  heard!: true;
}

