import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionRepository } from '../infrastructure/orm/repositories/session.repository';
import type { SessionListOptions } from '../infrastructure/orm/repositories/session.repository';
import type { TopicSession } from '../picks/topic-progress';
import type { CreateSessionBodyDto, SessionResponseDto, UpdateSessionBodyDto } from './session.dto';

function requireSession(session: SessionEntity | null): SessionEntity {
  if (!session) throw new NotFoundException('That session was not found.');
  return session;
}

function toSessionResponse(session: SessionEntity): SessionResponseDto {
  return {
    id: session.id,
    title: session.title,
    subject: session.subject,
    language: session.language,
    status: session.status,
    startedAt: session.startedAt,
    durationSeconds: session.durationSeconds,
    detail: session.detail,
    artwork: session.artwork,
  };
}

@Injectable()
export class SessionsService {
  constructor(private readonly sessions: SessionRepository) {}

  async createSession(studentId: string, body: CreateSessionBodyDto): Promise<SessionResponseDto> {
    return toSessionResponse(await this.sessions.createForStudent(studentId, body));
  }

  async listSessions(studentId: string, options: SessionListOptions): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.listNewestForStudent(studentId, options);
    return sessions.map(toSessionResponse);
  }

  hasStartedASession(studentId: string): Promise<boolean> {
    return this.sessions.existsForStudent(studentId);
  }

  async getSession(studentId: string, sessionId: string): Promise<SessionResponseDto> {
    return toSessionResponse(requireSession(await this.sessions.findForStudent(studentId, sessionId)));
  }

  findStudentIdOfSession(sessionId: string): Promise<string | null> {
    return this.sessions.findStudentIdOfSession(sessionId);
  }

  async updateSession(
    studentId: string,
    sessionId: string,
    changes: UpdateSessionBodyDto,
  ): Promise<SessionResponseDto> {
    const session = await this.sessions.updateUnfinishedForStudent(studentId, sessionId, changes);
    return toSessionResponse(requireSession(session));
  }

  async getNewestUnfinishedSession(studentId: string): Promise<SessionResponseDto | null> {
    const session = await this.sessions.findNewestUnfinishedForStudent(studentId);
    return session && toSessionResponse(session);
  }

  async getTopicHistory(studentId: string): Promise<TopicSession[]> {
    const sessions = await this.sessions.listNewestWithTopicForStudent(studentId);
    return sessions.flatMap(({ id, topicId, status, durationSeconds }) => (topicId ? [{ id, topicId, status, durationSeconds }] : []));
  }
}
