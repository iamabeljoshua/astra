import { IsIn, IsString } from 'class-validator';
import { ACCOUNT_STATUSES } from './account-options';
import type { AccountStatus } from './account-options';
import { IsBirthDate } from './is-birth-date';
import { StudentProfileResponseDto } from './student-profile.dto';

export class AnswerBirthDateBodyDto {
  /** The student's date of birth, written as YYYY-MM-DD. */
  @IsString()
  @IsBirthDate()
  birthDate!: string;
}

export class StudentResponseDto {
  /** The ID of the student. */
  id!: string;

  /** The name the tutor calls the student, or null until onboarding saves one. */
  name!: string | null;

  /** The student's profile, or null until onboarding saves one. */
  profile!: StudentProfileResponseDto | null;

  /** When a parent or guardian gave consent, or null if no one has. */
  parentConsentAt!: Date | null;
}

export class AccountResponseDto {
  /** Whether this account must answer the date of birth question, can use the app, or is closed. */
  @IsIn(ACCOUNT_STATUSES)
  status!: AccountStatus;

  /** The student, or null unless the status is active. */
  student!: StudentResponseDto | null;
}
