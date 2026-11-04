import { Injectable, NotFoundException } from '@nestjs/common';
import type { SessionEntity } from '../infrastructure/orm/entities/session.entity';
import { SessionLogRepository } from '../infrastructure/orm/repositories/session-log.repository';
import { SessionRepository } from '../infrastructure/orm/repositories/session.repository';
import { LiveRooms, MOST_WARM_ROOMS, WARM_ROOM_WINDOW_MS } from '../livekit/live-rooms';
import type { SessionLogRun } from '../infrastructure/orm/repositories/session-log.repository';
import type { SessionListOptions } from '../infrastructure/orm/repositories/session.repository';
import { findLibraryTopic } from '../picks/library';
import { QUESTION_SUBJECT } from '../picks/pick-reasons';
import type { TopicSession } from '../picks/topic-progress';
import { TutorSpendService } from '../tutor-spend/tutor-spend.service';
import type { CreateSessionBodyDto, SessionReplayResponseDto, SessionResponseDto, UpdateSessionBodyDto } from './session.dto';

/** A student asking to keep a room is not trusted to let it go, so it closes after this long at most. */
const RECAP_ROOM_LASTS_MS = 120_000;

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
    canReplay: session.hasLog ?? false,
  };
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly sessionLogs: SessionLogRepository,
    private readonly liveRooms: LiveRooms,
    private readonly tutorSpend: TutorSpendService,
  ) {}

  async createSession(studentId: string, body: CreateSessionBodyDto): Promise<SessionResponseDto> {
    // A card's title comes from the library, so a browser cannot put a student's words under a shared topic.
    const topic = findLibraryTopic(body.topicId);
    const session = await this.sessions.createForStudent(studentId, topic ? { ...body, title: topic.title } : body);
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

  async getLessonRequest(studentId: string, sessionId: string): Promise<{ title: string; status: string; isCard: boolean; cardLine?: string }> {
    const { title, status, topicId } = requireSession(await this.sessions.findForStudent(studentId, sessionId));
    const topic = findLibraryTopic(topicId);
    return { title: topic?.title ?? title, status, isCard: topic !== undefined, ...(topic ? { cardLine: topic.openingLine } : {}) };
  }

  async updateSession(
    studentId: string,
    sessionId: string,
    { keepsRoomForRecap = false, ...changes }: UpdateSessionBodyDto,
  ): Promise<SessionResponseDto> {
    const session = requireSession(await this.sessions.updateUnfinishedForStudent(studentId, sessionId, changes));
    // A length save can arrive after the end, and it must not close a room kept for a recap.
    if (session.status === 'finished' && keepsRoomForRecap) this.liveRooms.closeAfter(session.id, RECAP_ROOM_LASTS_MS);
    else if (changes.status === 'finished') await this.liveRooms.close(session.id);
    return toSessionResponse(session);
  }

  async getReplay(studentId: string, sessionId: string): Promise<SessionReplayResponseDto> {
    const session = requireSession(await this.sessions.findForStudent(studentId, sessionId));
    return { recap: session.recap, recapAnswer: session.recapAnswer, runs: await this.sessionLogs.listRuns(session.id) };
  }

  async saveRecapAnswer(studentId: string, sessionId: string, answer: string): Promise<void> {
    const session = requireSession(await this.sessions.findForStudent(studentId, sessionId));
    if (!session.recap) throw new NotFoundException('That session has no recap.');
    await this.sessions.saveRecapAnswerForStudent(studentId, session.id, answer);
  }

  async deleteReplay(studentId: string, sessionId: string): Promise<void> {
    const session = requireSession(await this.sessions.findForStudent(studentId, sessionId));
    await this.sessionLogs.deleteReplayForStudent(studentId, session.id);
  }

  // Only the agent calls these two, for a session the room's name gave it.
  saveLog(sessionId: string, run: SessionLogRun): Promise<void> {
    return this.sessionLogs.saveUnlessDeleted(sessionId, run);
  }

  saveRecap(sessionId: string, recap: object): Promise<void> {
    return this.sessions.saveRecap(sessionId, recap);
  }

  renameUnfinished(studentId: string, sessionId: string, title: string): Promise<void> {
    return this.sessions.renameUnfinishedForStudent(studentId, sessionId, { title, subject: QUESTION_SUBJECT });
  }

  async getNewestUnfinishedSession(studentId: string): Promise<SessionResponseDto | null> {
    const session = await this.sessions.findNewestUnfinishedForStudent(studentId);
    return session && toSessionResponse(session);
  }

  async getHistoryForPicks(studentId: string): Promise<TopicSession[]> {
    const sessions = await this.sessions.listNewestForPicks(studentId);
    return sessions.map(({ id, topicId, title, subject, artwork, status, durationSeconds, startedAt }) => ({ id, topicId, title, subject, artwork, status, durationSeconds, startedAt }));
  }
}
