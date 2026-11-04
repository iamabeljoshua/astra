import { Injectable, Logger } from '@nestjs/common';
import { isOldEnough } from '../auth/age-gate';
import type { SignIn } from '../auth/route-access';
import type { StudentProfileEntity } from '../infrastructure/orm/entities/student-profile.entity';
import { StudentRepository } from '../infrastructure/orm/repositories/student.repository';
import type { StudentAccount } from '../infrastructure/orm/repositories/student.repository';
import { AuthAccountEraser } from './auth-account-eraser';
import { getAddressHash } from './closed-address-hash';
import { getSceneStorePaths, removeStudentSceneFiles } from './student-scene-files';
import { STUDENT_INTERESTS } from './student-profile-options';
import type { StudentInterest } from './student-profile-options';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import type { AccountResponseDto, AnswerBirthDateBodyDto, DeletedAccountResponseDto } from './student.dto';

const CLOSED_ACCOUNT: AccountResponseDto = { status: 'closed', student: null };

export function isStudentInterest(interest: string): interest is StudentInterest {
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
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly students: StudentRepository,
    private readonly authAccounts: AuthAccountEraser,
  ) {}

  async getAccount(signIn: SignIn): Promise<AccountResponseDto> {
    if (signIn.isAddressClosed) return this.refuseAndEraseNewSignUp(signIn);
    const account = await this.students.findAccount(signIn.authUserId);
    if (account.status === 'closed') await this.finishClosing(signIn);
    return toAccountResponse(account);
  }

  async answerBirthDate(signIn: SignIn, { birthDate, name }: AnswerBirthDateBodyDto): Promise<AccountResponseDto> {
    if (signIn.isAddressClosed) return this.refuseAndEraseNewSignUp(signIn);
    const answer = {
      birthDate,
      isOldEnough: isOldEnough(birthDate, new Date()),
      name: name ?? null,
      addressHash: signIn.email && getAddressHash(signIn.email),
    };
    const account = await this.students.saveBirthDateAnswer(signIn.authUserId, answer);
    if (account.status === 'closed') await this.finishClosing(signIn);
    return toAccountResponse(account);
  }

  async deleteAccount({ authUserId, email }: SignIn): Promise<DeletedAccountResponseDto> {
    const studentId = await this.students.findStudentIdOfUser(authUserId);
    if (studentId) {
      await removeStudentSceneFiles({ ...getSceneStorePaths(process.env), studentId });
      await this.students.deleteStudent({ studentId, authUserId });
    }
    await this.authAccounts.erase({ authUserId, email });
    return { deleted: true };
  }

  async isAddressClosed(email: string | null): Promise<boolean> {
    return email !== null && this.students.isAddressClosed(getAddressHash(email));
  }

  private async refuseAndEraseNewSignUp(signIn: SignIn): Promise<AccountResponseDto> {
    if (!(await this.students.hasStudent(signIn.authUserId))) await this.finishClosing(signIn);
    return CLOSED_ACCOUNT;
  }

  // The close already stands, so a failure here only logs, and the next request from this account tries again.
  private async finishClosing({ authUserId, email }: SignIn): Promise<void> {
    try {
      const isErased = await this.authAccounts.erase({ authUserId, email });
      if (isErased && email) await this.students.forgetClosedAccount(authUserId);
    } catch (thrown) {
      this.logger.error(`Could not erase a closed account from Auth: ${thrown instanceof Error ? thrown.message : 'unknown error'}`);
    }
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
