import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike } from 'typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

type NewSession = Pick<SessionEntity, 'title' | 'subject' | 'language'> & Partial<Pick<SessionEntity, 'artwork'>>;
type SessionChanges = Pick<SessionEntity, 'durationSeconds'> & Partial<Pick<SessionEntity, 'status'>>;

export interface SessionListOptions {
  limit: number;
  offset: number;
  search?: string;
}

const LIKE_PATTERN_CHARACTERS = /[\\%_]/g;

// Every branch names the student, because the branches of a filter are joined with OR.
function getListFilter(studentId: string, search?: string): FindOptionsWhere<SessionEntity>[] {
  if (!search) return [{ studentId }];
  const containsSearch = ILike(`%${search.replace(LIKE_PATTERN_CHARACTERS, '\\$&')}%`);
  return [
    { studentId, title: containsSearch },
    { studentId, subject: containsSearch },
  ];
}

@Injectable()
export class SessionRepository {
  private readonly sessions: Repository<SessionEntity>;

  constructor(@InjectDataSource() dataSource: DataSource) {
    this.sessions = dataSource.getRepository(SessionEntity);
  }

  async createForStudent(studentId: string, session: NewSession): Promise<SessionEntity> {
    const { id } = await this.sessions.save(this.sessions.create({ ...session, studentId }));
    return this.sessions.findOneByOrFail({ id, studentId });
  }

  listNewestForStudent(studentId: string, { limit, offset, search }: SessionListOptions): Promise<SessionEntity[]> {
    return this.sessions.find({
      where: getListFilter(studentId, search),
      order: { startedAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  findForStudent(studentId: string, sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.findOneBy({ id: sessionId, studentId });
  }

  async updateUnfinishedForStudent(
    studentId: string,
    sessionId: string,
    changes: SessionChanges,
  ): Promise<SessionEntity | null> {
    await this.sessions.update({ id: sessionId, studentId, status: 'in_progress' }, changes);
    return this.findForStudent(studentId, sessionId);
  }

  findNewestUnfinishedForStudent(studentId: string): Promise<SessionEntity | null> {
    return this.sessions.findOne({
      where: { studentId, status: 'in_progress' },
      order: { startedAt: 'DESC', id: 'DESC' },
    });
  }
}
