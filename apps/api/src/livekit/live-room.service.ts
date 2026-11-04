import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { getRoomName, type LiveRoomKeys, makeStudentToken } from './live-room-grants';
import type { LiveRoomResponseDto } from './live-room.dto';

const DEFAULT_AGENT_NAME = 'astra-tutor';

export function getLiveRoomKeys(environment: NodeJS.ProcessEnv): LiveRoomKeys | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, ASTRA_AGENT_NAME: agentName } = environment;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret, agentName: agentName || DEFAULT_AGENT_NAME } : null;
}

@Injectable()
export class LiveRoomService {
  constructor(private readonly sessionsService: SessionsService) {}

  // The room belongs to the session, and the session lookup answers 404 for another student, so no student can get a token for another's room.
  async openLiveRoom(studentId: string, sessionId: string): Promise<LiveRoomResponseDto> {
    const session = await this.sessionsService.getSession(studentId, sessionId);
    if (session.status === 'finished') throw new ConflictException('This session has finished.');
    const keys = getLiveRoomKeys(process.env);
    if (!keys) throw new ServiceUnavailableException('Live voice is not set up.');
    const roomName = getRoomName(session.id);
    return { url: keys.url, roomName, token: await makeStudentToken({ keys, roomName, studentId }) };
  }
}
