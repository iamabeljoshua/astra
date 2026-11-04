import { ConflictException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import type { SceneLessonResponseDto } from './scene.dto';

const REPLY_LIMIT_MS = 5_000;
const TOO_MANY_REQUESTS = 429;

@Injectable()
export class ScenesService {
  constructor(private readonly sessionsService: SessionsService) {}

  async openLesson(studentId: string, sessionId: string): Promise<SceneLessonResponseDto> {
    const session = await this.sessionsService.getLessonRequest(studentId, sessionId);
    if (session.status === 'finished') throw new ConflictException('This session has finished.');
    const serviceUrl = process.env.SCENE_LESSON_SERVICE_URL;
    if (!serviceUrl) throw new ServiceUnavailableException('Lessons are not set up.');
    const reply = await fetch(`${serviceUrl}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, studentId, request: session.title, isCard: session.isCard, cardLine: session.cardLine }), signal: AbortSignal.timeout(REPLY_LIMIT_MS) }).catch(() => null);
    // The page tells a student which limit they hit and how long it really lasts, so the reason crosses as it came.
    if (reply?.status === TOO_MANY_REQUESTS) throw new HttpException({ message: 'This student has reached a lesson limit.', ...((await reply.json().catch(() => ({}))) as object) }, TOO_MANY_REQUESTS);
    if (!reply?.ok) throw new ServiceUnavailableException('The lesson could not start.');
    return (await reply.json()) as SceneLessonResponseDto;
  }
}
