import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { StudentRepository } from '../infrastructure/orm/repositories/student.repository';
import { SessionsService } from '../sessions/sessions.service';
import type { LiveRoomResponseDto } from './live-room.dto';

const TOKEN_LIFETIME = '30m';
const AGENT_NAME = 'astra-tutor';

export interface LiveRoomSettings {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export const LIVE_ROOM_SETTINGS = Symbol('LIVE_ROOM_SETTINGS');

export function readLiveRoomSettings(env: NodeJS.ProcessEnv): LiveRoomSettings | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

@Injectable()
export class LiveRoomService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly students: StudentRepository,
    @Inject(LIVE_ROOM_SETTINGS) private readonly settings: LiveRoomSettings | null,
  ) {}

  async joinSession(studentId: string, sessionId: string): Promise<LiveRoomResponseDto> {
    if (!this.settings) throw new ServiceUnavailableException('Live lessons are not set up on this server.');
    const session = await this.sessions.getSession(studentId, sessionId);
    if (session.status !== 'in_progress') throw new ConflictException('This session has finished.');
    return { url: this.settings.url, token: await this.makeToken(studentId, `session-${session.id}`, await this.getTutorBrief(studentId)) };
  }

  // Only what teaching needs goes to the tutor. The name, date of birth, and email address stay here.
  private async getTutorBrief(studentId: string): Promise<string> {
    const profile = await this.students.findProfile(studentId);
    return profile ? JSON.stringify({ level: profile.level, interests: profile.interests, goal: profile.goal }) : '';
  }

  // The room starts the tutor when it is first made, and a rejoin finds the same room and the same tutor.
  private makeToken(studentId: string, roomName: string, tutorBrief: string): Promise<string> {
    const { apiKey, apiSecret } = this.settings as LiveRoomSettings;
    const token = new AccessToken(apiKey, apiSecret, { identity: `student-${studentId}`, ttl: TOKEN_LIFETIME });
    token.addGrant({ room: roomName, roomJoin: true, canSubscribe: true, canPublishData: true, canPublish: false });
    token.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata: tutorBrief })] });
    return token.toJwt();
  }
}
