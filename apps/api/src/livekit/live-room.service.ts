import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { makeStudentToken } from './live-room-grants';
import type { LiveRoomResponseDto } from './live-room.dto';
import { getLiveRoomKeys, LiveRooms } from './live-rooms';

@Injectable()
export class LiveRoomService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly liveRooms: LiveRooms,
  ) {}

  private async requireUnfinishedSession(studentId: string, sessionId: string) {
    const session = await this.sessionsService.getSession(studentId, sessionId);
    if (session.status === 'finished') throw new ConflictException('This session has finished.');
    return session;
  }

  // The room belongs to the session, and the session lookup answers 404 for another student, so no student can get a token for another's room. Only this calls the tutor in, so a finished session can never get a job.
  async openLiveRoom(studentId: string, sessionId: string, { startOver = false }: { startOver?: boolean } = {}): Promise<LiveRoomResponseDto> {
    const session = await this.requireUnfinishedSession(studentId, sessionId);
    const keys = getLiveRoomKeys(process.env);
    if (!keys) throw new ServiceUnavailableException('Live voice is not set up.');
    const roomName = await (startOver ? this.liveRooms.startOver(keys, session.id, studentId) : this.liveRooms.open(keys, session.id, studentId));
    // The session can finish while the room opens, and that finish closed nothing, so this closes what it just opened.
    await this.requireUnfinishedSession(studentId, sessionId).catch(async (problem: unknown) => {
      await this.liveRooms.close(session.id);
      throw problem;
    });
    return { url: keys.url, roomName, token: await makeStudentToken({ keys, roomName, studentId }) };
  }
}
