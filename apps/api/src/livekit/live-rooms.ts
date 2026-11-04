import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { type Room, RoomAgentDispatch, RoomServiceClient } from 'livekit-server-sdk';
import { type LiveRoomKeys, ROOM_SETTINGS } from './live-room-grants';

const DEFAULT_AGENT_NAME = 'astra-tutor';
/** Ending a session waits on this, so a slow LiveKit cannot hold it for long. */
const LIVEKIT_REQUEST_SECONDS = 5;
const NOT_FOUND = 404;
/** LiveKit answers a create with the old room for a moment after a delete, so a new one takes a few tries. */
const NEW_ROOM_LIMIT_MS = 8000;
const NEW_ROOM_RETRY_MS = 300;

export function getLiveRoomKeys(environment: NodeJS.ProcessEnv): LiveRoomKeys | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, ASTRA_AGENT_NAME: agentName } = environment;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret, agentName: agentName || DEFAULT_AGENT_NAME } : null;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getClient({ url, apiKey, apiSecret }: LiveRoomKeys): RoomServiceClient {
  return new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret, { requestTimeout: LIVEKIT_REQUEST_SECONDS });
}

// The API alone opens and closes rooms. Opening one calls the tutor in, and opening it again changes nothing, so a rejoin never starts a second job.
@Injectable()
export class LiveRooms {
  private readonly logger = new Logger(LiveRooms.name);

  private async create(keys: LiveRoomKeys, roomName: string): Promise<Room> {
    try {
      return await getClient(keys).createRoom({ name: roomName, ...ROOM_SETTINGS, agents: [new RoomAgentDispatch({ agentName: keys.agentName })] });
    } catch {
      throw new ServiceUnavailableException('Live voice could not open a room.');
    }
  }

  async open(keys: LiveRoomKeys, roomName: string): Promise<void> {
    await this.create(keys, roomName);
  }

  // A tutor that crashed never comes back on its own, and a second job in a room with a live one would talk over it, so this removes the room and calls a new tutor into a new one.
  async startOver(keys: LiveRoomKeys, roomName: string): Promise<void> {
    const [old] = await getClient(keys).listRooms([roomName]).catch(() => []);
    if (!old) return this.open(keys, roomName);
    await this.deleteRoom(keys, roomName);
    const deadline = Date.now() + NEW_ROOM_LIMIT_MS;
    while (Date.now() < deadline) {
      if ((await this.create(keys, roomName)).sid !== old.sid) return;
      await delay(NEW_ROOM_RETRY_MS);
    }
    throw new ServiceUnavailableException('Live voice could not open a new room.');
  }

  // A room that will not close must not stop a session finishing. It closes itself once the student has gone, and a finished session gets no new token.
  async close(roomName: string): Promise<void> {
    const keys = getLiveRoomKeys(process.env);
    if (!keys) return;
    await this.deleteRoom(keys, roomName).catch((problem: unknown) => this.logger.warn(`Could not close a room: ${String(problem)}`));
  }

  private async deleteRoom(keys: LiveRoomKeys, roomName: string): Promise<void> {
    await getClient(keys).deleteRoom(roomName).catch((problem: { status?: number }) => {
      if (problem.status !== NOT_FOUND) throw problem;
    });
  }
}
