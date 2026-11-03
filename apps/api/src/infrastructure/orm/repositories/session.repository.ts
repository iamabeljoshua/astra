import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Repository } from 'typeorm';
import { SessionEntity } from '../entities/session.entity';

type NewSession = Pick<SessionEntity, 'title' | 'subject' | 'language'>;

@Injectable()
export class SessionRepository {
  private readonly sessions: Repository<SessionEntity>;

  constructor(@InjectDataSource() dataSource: DataSource) {
    this.sessions = dataSource.getRepository(SessionEntity);
  }

  async createForStudent(studentId: string, session: NewSession): Promise<SessionEntity> {
    const { id } = await this.sessions.save(this.sessions.create({ ...session, studentId }));
    return this.sessions.findOneByOrFail({ id });
  }

  listNewestForStudent(studentId: string, limit: number): Promise<SessionEntity[]> {
    return this.sessions.find({
      where: { studentId },
      order: { startedAt: 'DESC', id: 'DESC' },
      take: limit,
    });
  }

  existsForStudent(studentId: string): Promise<boolean> {
    return this.sessions.existsBy({ studentId });
  }

  findNewestUnfinishedForStudent(studentId: string): Promise<SessionEntity | null> {
    return this.sessions.findOne({
      where: { studentId, status: 'in_progress' },
      order: { startedAt: 'DESC', id: 'DESC' },
    });
  }
}
