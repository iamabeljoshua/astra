import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionRepository } from '../infrastructure/orm/repositories/session.repository';
import { LiveRooms, MOST_WARM_ROOMS, WARM_ROOM_WINDOW_MS } from '../livekit/live-rooms';
import type { SessionListOptions } from '../infrastructure/orm/repositories/session.repository';
import type { TopicSession } from '../picks/topic-progress';
import { TutorSpendService } from '../tutor-spend/tutor-spend.service';
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
  constructor(
    private readonly sessions: SessionRepository,
    private readonly liveRooms: LiveRooms,
    private readonly tutorSpend: TutorSpendService,
  ) {}

  async createSession(studentId: string, body: CreateSessionBodyDto): Promise<SessionResponseDto> {
    const session = await this.sessions.createForStudent(studentId, body);
    // Warming starts a job, which spends, and a student past today's limit gets no reply from it.
    if (await this.tutorSpend.isOverDailyLimit(studentId)) return toSessionResponse(session);
    // Counted after the insert, in the table every API process shares, so however many sessions arrive at once only the first few can read a small count.
    const startedLately = await this.sessions.countStartedSince(studentId, new Date(Date.now() - WARM_ROOM_WINDOW_MS));
    if (startedLately <= MOST_WARM_ROOMS) this.liveRooms.warm(session.id, studentId);
    return toSessionResponse(session);
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
    const session = requireSession(await this.sessions.updateUnfinishedForStudent(studentId, sessionId, changes));
    if (session.status === 'finished') await this.liveRooms.close(session.id);
    return toSessionResponse(session);
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
