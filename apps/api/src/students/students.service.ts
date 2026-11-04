import { Injectable } from '@nestjs/common';
import { isOldEnough } from '../auth/age-gate';
import type { StudentProfileEntity } from '../infrastructure/orm/entities/student-profile.entity';
import { StudentRepository } from '../infrastructure/orm/repositories/student.repository';
import type { StudentAccount } from '../infrastructure/orm/repositories/student.repository';
import { STUDENT_INTERESTS } from './student-profile-options';
import type { StudentInterest } from './student-profile-options';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import type { AccountResponseDto, AnswerBirthDateBodyDto } from './student.dto';

function isStudentInterest(interest: string): interest is StudentInterest {
  return (STUDENT_INTERESTS as readonly string[]).includes(interest);
}

// A profile saved before interests became a list can hold free text, which no chip or reason may repeat.
function toProfileResponse(profile: StudentProfileEntity): StudentProfileResponseDto {
  return {
    interests: profile.interests.filter(isStudentInterest),
    level: profile.level,
    goal: profile.goal,
  };
}

function toAccountResponse(account: StudentAccount): AccountResponseDto {
  if (account.status !== 'active') return { status: account.status, student: null };
  const { student, profile } = account;
  return {
    status: 'active',
    student: {
      id: student.id,
      name: student.name,
      profile: profile && toProfileResponse(profile),
    },
  };
}

@Injectable()
export class StudentsService {
  constructor(private readonly students: StudentRepository) {}

  async getAccount(authUserId: string): Promise<AccountResponseDto> {
    return toAccountResponse(await this.students.findAccount(authUserId));
  }

  async answerBirthDate(authUserId: string, { birthDate, name }: AnswerBirthDateBodyDto): Promise<AccountResponseDto> {
    const answer = { birthDate, isOldEnough: isOldEnough(birthDate, new Date()), name: name ?? null };
    return toAccountResponse(await this.students.saveBirthDateAnswer(authUserId, answer));
  }

  hasBeenInvitedToTalk(studentId: string): Promise<boolean> {
    return this.students.hasBeenInvitedToTalk(studentId);
  }

  noteInvitedToTalk(studentId: string): Promise<void> {
    return this.students.noteInvitedToTalk(studentId);
  }

  findStudentId(authUserId: string): Promise<string | null> {
    return this.students.findOpenStudentId(authUserId);
  }

  getStudentName(studentId: string): Promise<string | null> {
    return this.students.findStudentName(studentId);
  }

  async getProfile(studentId: string): Promise<StudentProfileResponseDto | null> {
    const profile = await this.students.findProfile(studentId);
    return profile && toProfileResponse(profile);
  }

  async saveProfile(studentId: string, body: SaveStudentProfileBodyDto): Promise<AccountResponseDto> {
    return toAccountResponse(await this.students.saveProfile(studentId, body));
  }
}
