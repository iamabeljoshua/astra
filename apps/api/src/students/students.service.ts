import { Injectable } from '@nestjs/common';
import { isOldEnough } from '../auth/age-gate';
import type { StudentProfileEntity } from '../infrastructure/orm/entities/student-profile.entity';
import { StudentRepository } from '../infrastructure/orm/repositories/student.repository';
import type { StudentAccount } from '../infrastructure/orm/repositories/student.repository';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import type { AccountResponseDto } from './student.dto';

function toProfileResponse(profile: StudentProfileEntity): StudentProfileResponseDto {
  return {
    interests: profile.interests,
    level: profile.level,
    goal: profile.goal,
    voice: profile.voice,
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
      parentConsentAt: student.parentConsentAt,
    },
  };
}

@Injectable()
export class StudentsService {
  constructor(private readonly students: StudentRepository) {}

  async getAccount(authUserId: string): Promise<AccountResponseDto> {
    return toAccountResponse(await this.students.findAccount(authUserId));
  }

  async answerBirthDate(authUserId: string, birthDate: string): Promise<AccountResponseDto> {
    const answer = { birthDate, isOldEnough: isOldEnough(birthDate, new Date()) };
    return toAccountResponse(await this.students.saveBirthDateAnswer(authUserId, answer));
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

  async saveProfile(
    studentId: string,
    body: SaveStudentProfileBodyDto,
  ): Promise<StudentProfileResponseDto> {
    return toProfileResponse(await this.students.saveProfile(studentId, body));
  }
}
