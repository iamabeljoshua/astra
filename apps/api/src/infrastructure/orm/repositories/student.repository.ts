import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { ClosedAccountEntity } from '../entities/closed-account.entity';
import { ClosedAddressHashEntity } from '../entities/closed-address-hash.entity';
import { SafetyFlagEntity } from '../entities/safety-flag.entity';
import { StudentProfileEntity } from '../entities/student-profile.entity';
import { StudentEntity } from '../entities/student.entity';

const HOLD_ACCOUNT_UNTIL_COMMIT = 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))';

export type StudentAccount =
  | { status: 'closed' }
  | { status: 'needs_birth_date' }
  | { status: 'active'; student: StudentEntity; profile: StudentProfileEntity | null };

interface BirthDateAnswer {
  birthDate: string;
  isOldEnough: boolean;
  name: string | null;
  addressHash: string | null;
}

type ProfileFields = Pick<StudentProfileEntity, 'level' | 'goal'> & {
  name: string;
  interests: string[];
};

async function readAccount(manager: EntityManager, authUserId: string): Promise<StudentAccount> {
  if (await manager.existsBy(ClosedAccountEntity, { authUserId })) return { status: 'closed' };
  const student = await manager.findOneBy(StudentEntity, { authUserId });
  if (!student) return { status: 'needs_birth_date' };
  const profile = await manager.findOneBy(StudentProfileEntity, { studentId: student.id });
  return { status: 'active', student, profile };
}

async function closeAccount(manager: EntityManager, authUserId: string, addressHash: string | null): Promise<void> {
  await manager.insert(ClosedAccountEntity, { authUserId });
  if (addressHash) await manager.upsert(ClosedAddressHashEntity, { addressHash }, ['addressHash']);
}

@Injectable()
export class StudentRepository {
  private readonly students: Repository<StudentEntity>;
  private readonly profiles: Repository<StudentProfileEntity>;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.students = dataSource.getRepository(StudentEntity);
    this.profiles = dataSource.getRepository(StudentProfileEntity);
  }

  async hasBeenInvitedToTalk(studentId: string): Promise<boolean> {
    const student = await this.dataSource.manager.findOneBy(StudentEntity, { id: studentId });
    return student?.talkInvitedAt != null;
  }

  async noteInvitedToTalk(studentId: string): Promise<void> {
    await this.dataSource.manager.update(StudentEntity, { id: studentId, talkInvitedAt: IsNull() }, { talkInvitedAt: new Date() });
  }

  findAccount(authUserId: string): Promise<StudentAccount> {
    return readAccount(this.dataSource.manager, authUserId);
  }

  // Two tabs can answer at once, so the lock makes the first answer stand and a closed account stay closed.
  saveBirthDateAnswer(authUserId: string, { birthDate, isOldEnough, name, addressHash }: BirthDateAnswer): Promise<StudentAccount> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(HOLD_ACCOUNT_UNTIL_COMMIT, [authUserId]);
      const account = await readAccount(manager, authUserId);
      if (account.status !== 'needs_birth_date') return account;

      if (isOldEnough) await manager.insert(StudentEntity, { authUserId, birthDate, name });
      else await closeAccount(manager, authUserId, addressHash);
      return readAccount(manager, authUserId);
    });
  }

  isAddressClosed(addressHash: string): Promise<boolean> {
    return this.dataSource.manager.existsBy(ClosedAddressHashEntity, { addressHash });
  }

  async forgetClosedAccount(authUserId: string): Promise<void> {
    await this.dataSource.manager.delete(ClosedAccountEntity, { authUserId });
  }

  hasStudent(authUserId: string): Promise<boolean> {
    return this.students.existsBy({ authUserId });
  }

  async findStudentIdOfUser(authUserId: string): Promise<string | null> {
    const student = await this.students.findOne({ where: { authUserId }, select: { id: true } });
    return student?.id ?? null;
  }

  deleteStudent({ studentId, authUserId }: { studentId: string; authUserId: string }): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(SafetyFlagEntity, { reviewedBy: authUserId }, { reviewedBy: null });
      await manager.delete(StudentEntity, { id: studentId });
    });
  }

  async findOpenStudentId(authUserId: string): Promise<string | null> {
    const student = await this.students
      .createQueryBuilder('student')
      .select('student.id')
      .leftJoin(ClosedAccountEntity, 'closed', 'closed.authUserId = student.authUserId')
      .where('student.authUserId = :authUserId', { authUserId })
      .andWhere('closed.authUserId IS NULL')
      .getOne();
    return student?.id ?? null;
  }

  async findStudentName(studentId: string): Promise<string | null> {
    const student = await this.students.findOne({ where: { id: studentId }, select: { name: true } });
    return student?.name ?? null;
  }

  findProfile(studentId: string): Promise<StudentProfileEntity | null> {
    return this.profiles.findOneBy({ studentId });
  }

  saveProfile(studentId: string, { name, ...profileFields }: ProfileFields): Promise<StudentAccount> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(StudentEntity, { id: studentId }, { name });
      await manager.upsert(StudentProfileEntity, { ...profileFields, studentId }, ['studentId']);
      const { authUserId } = await manager.findOneByOrFail(StudentEntity, { id: studentId });
      return readAccount(manager, authUserId);
    });
  }
}
