import { Injectable } from '@nestjs/common';
import type { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionRepository } from '../infrastructure/orm/repositories/session.repository';
import type { CreateSessionBodyDto, SessionResponseDto } from './session.dto';

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

  async listSessions(studentId: string, limit: number): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.listNewestForStudent(studentId, limit);
    return sessions.map(toSessionResponse);
  }

  hasStartedASession(studentId: string): Promise<boolean> {
    return this.sessions.existsForStudent(studentId);
  }

  async getNewestUnfinishedSession(studentId: string): Promise<SessionResponseDto | null> {
    const session = await this.sessions.findNewestUnfinishedForStudent(studentId);
    return session && toSessionResponse(session);
  }
}
