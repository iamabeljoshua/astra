import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike, IsNull, MoreThan, Not } from 'typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

type NewSession = Pick<SessionEntity, 'title' | 'subject' | 'language'> & Partial<Pick<SessionEntity, 'artwork' | 'topicId'>>;
type SessionChanges = Pick<SessionEntity, 'durationSeconds'> & Partial<Pick<SessionEntity, 'status'>>;

export interface SessionListOptions {
  limit: number;
  offset: number;
  search?: string;
}

const LIKE_PATTERN_CHARACTERS = /[\\%_]/g;
const MAX_TOPIC_HISTORY_SESSIONS = 1_000;

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

  countStartedSince(studentId: string, since: Date): Promise<number> {
    return this.sessions.countBy({ studentId, startedAt: MoreThan(since) });
  }

  existsForStudent(studentId: string): Promise<boolean> {
    return this.sessions.existsBy({ studentId });
  }

  findForStudent(studentId: string, sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.findOneBy({ id: sessionId, studentId });
  }

  // Only the agent asks this, because it holds a key and no student's token. Every other read names the student.
  async findStudentIdOfSession(sessionId: string): Promise<string | null> {
    const session = await this.sessions.findOne({ where: { id: sessionId }, select: { studentId: true } });
    return session?.studentId ?? null;
  }

  async updateUnfinishedForStudent(
    studentId: string,
    sessionId: string,
    changes: SessionChanges,
  ): Promise<SessionEntity | null> {
    await this.sessions.update({ id: sessionId, studentId, status: 'in_progress' }, changes);
    return this.findForStudent(studentId, sessionId);
  }

  async renameUnfinishedForStudent(studentId: string, sessionId: string, title: string): Promise<void> {
    // A card's picture belongs to the card's topic, so it goes with the title that named it.
    await this.sessions.update({ id: sessionId, studentId, status: 'in_progress' }, { title, artwork: null });
  }

  listNewestWithTopicForStudent(studentId: string): Promise<SessionEntity[]> {
    return this.sessions.find({
      select: { id: true, topicId: true, status: true, durationSeconds: true },
      where: { studentId, topicId: Not(IsNull()) },
      order: { startedAt: 'DESC', id: 'DESC' },
      take: MAX_TOPIC_HISTORY_SESSIONS,
    });
  }

  findNewestUnfinishedForStudent(studentId: string): Promise<SessionEntity | null> {
    return this.sessions.findOne({
      where: { studentId, status: 'in_progress' },
      order: { startedAt: 'DESC', id: 'DESC' },
    });
  }
}
