import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { isOldEnough } from '../auth/age-gate';
import { ClosedAccountEntity } from './closed-account.entity';
import type { SaveStudentProfileBodyDto, StudentProfileResponseDto } from './student-profile.dto';
import { StudentProfileEntity } from './student-profile.entity';
import type { AccountResponseDto } from './student.dto';
import { StudentEntity } from './student.entity';

const HOLD_ACCOUNT_UNTIL_COMMIT = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';

function toProfileResponse(profile: StudentProfileEntity): StudentProfileResponseDto {
  return {
    interests: profile.interests,
    level: profile.level,
    goal: profile.goal,
    voice: profile.voice,
  };
}

async function readAccount(manager: EntityManager, authUserId: string): Promise<AccountResponseDto> {
  if (await manager.existsBy(ClosedAccountEntity, { authUserId })) return { status: 'closed', student: null };
  const student = await manager.findOneBy(StudentEntity, { authUserId });
  if (!student) return { status: 'needs_birth_date', student: null };
  const profile = await manager.findOneBy(StudentProfileEntity, { studentId: student.id });
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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(StudentEntity) private readonly students: Repository<StudentEntity>,
    @InjectRepository(StudentProfileEntity)
    private readonly profiles: Repository<StudentProfileEntity>,
  ) {}

  getAccount(authUserId: string): Promise<AccountResponseDto> {
    return readAccount(this.dataSource.manager, authUserId);
  }

  // Two tabs can answer at once, so the lock makes the first answer stand and a closed account stay closed.
  answerBirthDate(authUserId: string, birthDate: string): Promise<AccountResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(HOLD_ACCOUNT_UNTIL_COMMIT, [authUserId]);
      const account = await readAccount(manager, authUserId);
      if (account.status !== 'needs_birth_date') return account;

      if (isOldEnough(birthDate, new Date())) await manager.insert(StudentEntity, { authUserId, birthDate });
      else await manager.insert(ClosedAccountEntity, { authUserId });
      return readAccount(manager, authUserId);
    });
  }

  // A closed account has no student today, and this keeps it shut if someone closes one that does.
  async findStudentId(authUserId: string): Promise<string | null> {
    if (await this.dataSource.manager.existsBy(ClosedAccountEntity, { authUserId })) return null;
    const student = await this.students.findOne({ where: { authUserId }, select: { id: true } });
    return student?.id ?? null;
  }

  async saveProfile(
    studentId: string,
    body: SaveStudentProfileBodyDto,
  ): Promise<StudentProfileResponseDto> {
    await this.profiles.upsert({ studentId, ...body }, ['studentId']);
    return toProfileResponse(await this.profiles.findOneByOrFail({ studentId }));
  }
}
