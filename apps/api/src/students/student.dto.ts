import { IsString, IsUUID, MaxLength } from 'class-validator';
import { IsStorableText } from '../is-storable-text';
import { StudentProfileResponseDto } from './student-profile.dto';

const MAX_STUDENT_NAME_LENGTH = 80;

export class CreateStudentBodyDto {
  /** The name the tutor calls the student. */
  @IsString()
  @MaxLength(MAX_STUDENT_NAME_LENGTH)
  @IsStorableText()
  name!: string;
}

export class StudentRouteParamsDto {
  /** The ID of the student. */
  @IsUUID()
  studentId!: string;
}

export class StudentResponseDto {
  /** The ID of the student. */
  id!: string;

  /** The name the tutor calls the student. */
  name!: string;

  /** The student's profile, or null until onboarding saves one. */
  profile!: StudentProfileResponseDto | null;
}
