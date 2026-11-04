import { randomBytes } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { JobRestartPolicy, type Room, RoomAgentDispatch, RoomServiceClient } from 'livekit-server-sdk';
import { getRoomPrefix, type LiveRoomKeys, ROOM_SETTINGS } from './live-room-grants';

const DEFAULT_AGENT_NAME = 'astra-tutor';
/** Ending a session waits on this, so a slow LiveKit cannot hold it for long. */
const LIVEKIT_REQUEST_SECONDS = 5;
const NOT_FOUND = 404;

export function getLiveRoomKeys(environment: NodeJS.ProcessEnv): LiveRoomKeys | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, ASTRA_AGENT_NAME: agentName } = environment;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret, agentName: agentName || DEFAULT_AGENT_NAME } : null;
}

function getClient({ url, apiKey, apiSecret }: LiveRoomKeys): RoomServiceClient {
  return new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret, { requestTimeout: LIVEKIT_REQUEST_SECONDS });
}

const getNewest = (rooms: readonly Room[]) => rooms.reduce<Room | null>((newest, room) => (newest && newest.creationTime > room.creationTime ? newest : room), null);

// The API alone opens and closes rooms, and opening one is what calls the tutor in. Each room gets a new name, because for at least 12 s after a delete LiveKit answers a create of the same name with the old room and calls no one.
@Injectable()
export class LiveRooms {
  private readonly logger = new Logger(LiveRooms.name);

  private async findRooms(keys: LiveRoomKeys, sessionId: string): Promise<Room[]> {
    const prefix = getRoomPrefix(sessionId);
    return (await getClient(keys).listRooms()).filter((room) => room.name.startsWith(prefix));
  }

  // A restarted job remembers nothing, and the student would hear a tutor who has forgotten the lesson with no word why, so a crash stays a crash and the page says so.
  private async openNew(keys: LiveRoomKeys, sessionId: string): Promise<string> {
    const name = `${getRoomPrefix(sessionId)}-${randomBytes(4).toString('hex')}`;
    await getClient(keys).createRoom({ name, ...ROOM_SETTINGS, agents: [new RoomAgentDispatch({ agentName: keys.agentName, restartPolicy: JobRestartPolicy.JRP_NEVER })] });
    return name;
  }

  /** Joins the room this session has open, so a rejoin or a reload finds its tutor, or opens one if it has none. */
  async open(keys: LiveRoomKeys, sessionId: string): Promise<string> {
    try {
      return getNewest(await this.findRooms(keys, sessionId))?.name ?? (await this.openNew(keys, sessionId));
    } catch {
      throw new ServiceUnavailableException('Live voice could not open a room.');
    }
  }

  /** For a tutor that has gone. A second job beside a live one would talk over it, so the old room goes first. */
  async startOver(keys: LiveRoomKeys, sessionId: string): Promise<string> {
    try {
      await this.closeAll(keys, sessionId);
      return await this.openNew(keys, sessionId);
    } catch {
      throw new ServiceUnavailableException('Live voice could not open a room.');
    }
  }

  // A room that will not close must not stop a session finishing. It closes itself once the student has gone, and a finished session gets no new token.
  async close(sessionId: string): Promise<void> {
    const keys = getLiveRoomKeys(process.env);
    if (!keys) return;
    await this.closeAll(keys, sessionId).catch((problem: unknown) => this.logger.warn(`Could not close a room: ${String(problem)}`));
  }

  private async closeAll(keys: LiveRoomKeys, sessionId: string): Promise<void> {
    const rooms = await this.findRooms(keys, sessionId);
    await Promise.all(
      rooms.map((room) =>
        getClient(keys)
          .deleteRoom(room.name)
          .catch((problem: { status?: number }) => {
            if (problem.status !== NOT_FOUND) throw problem;
          }),
      ),
    );
  }
}
