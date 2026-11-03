import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { ClosedAccountEntity } from '../entities/closed-account.entity';
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
}

type ProfileFields = Pick<StudentProfileEntity, 'interests' | 'level' | 'goal' | 'voice'>;

async function readAccount(manager: EntityManager, authUserId: string): Promise<StudentAccount> {
  if (await manager.existsBy(ClosedAccountEntity, { authUserId })) return { status: 'closed' };
  const student = await manager.findOneBy(StudentEntity, { authUserId });
  if (!student) return { status: 'needs_birth_date' };
  const profile = await manager.findOneBy(StudentProfileEntity, { studentId: student.id });
  return { status: 'active', student, profile };
}

@Injectable()
export class StudentRepository {
  private readonly students: Repository<StudentEntity>;
  private readonly profiles: Repository<StudentProfileEntity>;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.students = dataSource.getRepository(StudentEntity);
    this.profiles = dataSource.getRepository(StudentProfileEntity);
  }

  findAccount(authUserId: string): Promise<StudentAccount> {
    return readAccount(this.dataSource.manager, authUserId);
  }

  // Two tabs can answer at once, so the lock makes the first answer stand and a closed account stay closed.
  saveBirthDateAnswer(authUserId: string, { birthDate, isOldEnough }: BirthDateAnswer): Promise<StudentAccount> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(HOLD_ACCOUNT_UNTIL_COMMIT, [authUserId]);
      const account = await readAccount(manager, authUserId);
      if (account.status !== 'needs_birth_date') return account;

      if (isOldEnough) await manager.insert(StudentEntity, { authUserId, birthDate });
      else await manager.insert(ClosedAccountEntity, { authUserId });
      return readAccount(manager, authUserId);
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

  async saveProfile(studentId: string, fields: ProfileFields): Promise<StudentProfileEntity> {
    await this.profiles.upsert({ ...fields, studentId }, ['studentId']);
    return this.profiles.findOneByOrFail({ studentId });
  }
}
