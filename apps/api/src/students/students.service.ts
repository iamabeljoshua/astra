import { Injectable } from '@nestjs/common';
import { isOldEnough, isUnderEighteen } from '../auth/age-gate';
import type { StudentProfileEntity } from '../infrastructure/orm/entities/student-profile.entity';
import { StudentRepository } from '../infrastructure/orm/repositories/student.repository';
import type { OpenStudent, StudentAccount } from '../infrastructure/orm/repositories/student.repository';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import type { AccountResponseDto, AnswerBirthDateBodyDto, ParentConsentResponseDto } from './student.dto';

type ActiveAccount = Extract<StudentAccount, { status: 'active' }>;

interface StudentAccess {
  studentId: string;
  isWaitingForParent: boolean;
}

function toProfileResponse(profile: StudentProfileEntity): StudentProfileResponseDto {
  return {
    interests: profile.interests,
    level: profile.level,
    goal: profile.goal,
    voice: profile.voice,
    firstQuestion: profile.firstQuestion,
  };
}

function toParentConsentResponse({ student, consentRequest }: ActiveAccount, now: Date): ParentConsentResponseDto | null {
  if (!isUnderEighteen(student.birthDate, now)) return null;
  if (!consentRequest) return { status: 'not_asked', parentEmail: null };
  return { status: student.parentConsentAt ? 'given' : 'waiting', parentEmail: consentRequest.parentEmail };
}

function toAccountResponse(account: StudentAccount, now: Date): AccountResponseDto {
  if (account.status !== 'active') return { status: account.status, student: null };
  const { student, profile } = account;
  return {
    status: 'active',
    student: {
      id: student.id,
      name: student.name,
      profile: profile && toProfileResponse(profile),
      parentConsent: toParentConsentResponse(account, now),
    },
  };
}

function isWaitingForParent({ birthDate, parentConsentAt }: OpenStudent, now: Date): boolean {
  return isUnderEighteen(birthDate, now) && !parentConsentAt;
}

@Injectable()
export class StudentsService {
  constructor(private readonly students: StudentRepository) {}

  async getAccount(authUserId: string): Promise<AccountResponseDto> {
    return toAccountResponse(await this.students.findAccount(authUserId), new Date());
  }

  async answerBirthDate(authUserId: string, { birthDate, name }: AnswerBirthDateBodyDto): Promise<AccountResponseDto> {
    const now = new Date();
    const answer = { birthDate, isOldEnough: isOldEnough(birthDate, now), name: name ?? null };
    return toAccountResponse(await this.students.saveBirthDateAnswer(authUserId, answer), now);
  }

  async findStudentAccess(authUserId: string): Promise<StudentAccess | null> {
    const student = await this.students.findOpenStudent(authUserId);
    return student && { studentId: student.id, isWaitingForParent: isWaitingForParent(student, new Date()) };
  }

  getStudentName(studentId: string): Promise<string | null> {
    return this.students.findStudentName(studentId);
  }

  async getProfile(studentId: string): Promise<StudentProfileResponseDto | null> {
    const profile = await this.students.findProfile(studentId);
    return profile && toProfileResponse(profile);
  }

  async saveProfile(studentId: string, body: SaveStudentProfileBodyDto): Promise<AccountResponseDto> {
    const { name, interests, level, goal, voice, firstQuestion } = body;
    const account = await this.students.saveProfile(studentId, { name, interests, level, goal, voice, firstQuestion });
    return toAccountResponse(account, new Date());
  }
}
