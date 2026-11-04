import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import type { SceneLessonResponseDto } from './scene.dto';

const REPLY_LIMIT_MS = 5_000;

@Injectable()
export class ScenesService {
  constructor(private readonly sessionsService: SessionsService) {}

  // The title is read here and not from the browser, so a page cannot put other words into a lesson. A card's title is the topic, and a typed title goes to the router.
  async openLesson(studentId: string, sessionId: string): Promise<SceneLessonResponseDto> {
    const session = await this.sessionsService.getLessonRequest(studentId, sessionId);
    if (session.status === 'finished') throw new ConflictException('This session has finished.');
    const serviceUrl = process.env.SCENE_LESSON_SERVICE_URL;
    if (!serviceUrl) throw new ServiceUnavailableException('Lessons are not set up.');
    const reply = await fetch(`${serviceUrl}/lessons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, request: session.title, isCard: session.isCard }), signal: AbortSignal.timeout(REPLY_LIMIT_MS) }).catch(() => null);
    if (!reply?.ok) throw new ServiceUnavailableException('The lesson could not start.');
    return (await reply.json()) as SceneLessonResponseDto;
  }
}
