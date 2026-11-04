import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { JobRestartPolicy, type Room, RoomAgentDispatch, RoomServiceClient } from 'livekit-server-sdk';
import { getRoomPrefix, type LiveRoomKeys, ROOM_SETTINGS } from './live-room-grants';

const DEFAULT_AGENT_NAME = 'astra-tutor';
/** Ending a session waits on this, so a slow LiveKit cannot hold it for long. */
const LIVEKIT_REQUEST_SECONDS = 5;
const NOT_FOUND = 404;
/** A room with no student closes itself after `emptyTimeout`, so a warmed one is taken as open for less than that. */
const WARMED_ROOM_LASTS_MS = (ROOM_SETTINGS.emptyTimeout - 15) * 1000;
/** Each room runs a job of about 100 MB, and a warm one nobody joins lasts `emptyTimeout`, so sessions past this many in that time open their room when the student joins. */
export const MOST_WARM_ROOMS = 2;
export const WARM_ROOM_WINDOW_MS = ROOM_SETTINGS.emptyTimeout * 1000;
const LIMIT_WINDOW_MS = 10 * 60_000;
/** Starting over starts a job, so a student gets this many in a window. A crash or a quiet room needs one. */
const MOST_STARTS_OVER = 5;
/** One new lesson every 50 s for 10 minutes. It is here so one student cannot fill the project's room limit by asking for rooms. */
const MOST_ROOMS_OPENED = 12;
/** A live session past this many pays one slow list of rooms, and nothing else, so forgetting the oldest is safe. */
export const MOST_KNOWN_ROOMS = 2000;

// How many of something a student has started lately, and how long until they can start another. Map order is last use, so a student whose window has passed is forgotten.
class StartLimit {
  private readonly starts = new Map<string, number[]>();

  constructor(private readonly most: number) {}

  private getRecent(studentId: string, now: number): number[] {
    return (this.starts.get(studentId) ?? []).filter((atMs) => now - atMs < LIMIT_WINDOW_MS);
  }

  getWaitMs(studentId: string): number {
    const now = Date.now();
    const oldest = this.getRecent(studentId, now).at(-this.most);
    return oldest === undefined ? 0 : oldest + LIMIT_WINDOW_MS - now;
  }

  note(studentId: string): void {
    const now = Date.now();
    const recent = [...this.getRecent(studentId, now), now];
    this.starts.delete(studentId);
    this.starts.set(studentId, recent);
    for (const [student, times] of this.starts) {
      if (now - (times.at(-1) ?? 0) < LIMIT_WINDOW_MS) break;
      this.starts.delete(student);
    }
  }

  /** A start that failed started nothing, and a student must not be told to wait for it. */
  takeBack(studentId: string): void {
    this.starts.get(studentId)?.pop();
  }
}

function refuseIfAtLimit(studentId: string, ...limits: StartLimit[]): void {
  const waitMs = Math.max(...limits.map((limit) => limit.getWaitMs(studentId)));
  if (waitMs > 0) throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'This has been tried too many times.', retryAfterSeconds: Math.ceil(waitMs / 1000) }, HttpStatus.TOO_MANY_REQUESTS);
}

export function getLiveRoomKeys(environment: NodeJS.ProcessEnv): LiveRoomKeys | null {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, ASTRA_AGENT_NAME: agentName } = environment;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret, agentName: agentName || DEFAULT_AGENT_NAME } : null;
}

function getClient({ url, apiKey, apiSecret }: LiveRoomKeys): RoomServiceClient {
  return new RoomServiceClient(url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), apiKey, apiSecret, { requestTimeout: LIVEKIT_REQUEST_SECONDS });
}

const getNewest = (rooms: readonly Room[]) => rooms.reduce<Room | null>((newest, room) => (newest && newest.creationTime > room.creationTime ? newest : room), null);

interface KnownRoom {
  name: Promise<string>;
  /** Until this time a room no student has joined is certainly open, so joining it costs no call to LiveKit. After it, the room is about to close by itself, so it is not joined at all. Zero once a student has it. */
  isSureUntilMs: number;
}

// The API alone opens and closes rooms, and opening one is what calls the tutor in. Each room gets a new name, because for at least 12 s after a delete LiveKit answers a create of the same name with the old room and calls no one.
// Every call to LiveKit from here took 270 to 1700 ms, so the names it has given are kept, and the slow list of every room is only for a name this process has lost.
@Injectable()
export class LiveRooms {
  private readonly logger = new Logger(LiveRooms.name);
  private readonly knownRooms = new Map<string, KnownRoom>();
  private readonly startsOver = new StartLimit(MOST_STARTS_OVER);
  private readonly roomsOpened = new StartLimit(MOST_ROOMS_OPENED);

  private async findRooms(keys: LiveRoomKeys, sessionId: string): Promise<Room[]> {
    const prefix = getRoomPrefix(sessionId);
    return (await getClient(keys).listRooms()).filter((room) => room.name.startsWith(prefix));
  }

  private remember(sessionId: string, known: KnownRoom): void {
    this.knownRooms.delete(sessionId);
    this.knownRooms.set(sessionId, known);
    if (this.knownRooms.size > MOST_KNOWN_ROOMS) this.knownRooms.delete(this.knownRooms.keys().next().value as string);
  }

  // A restarted job remembers nothing, and the student would hear a tutor who has forgotten the lesson with no word why, so a crash stays a crash and the page says so.
  private openNew(keys: LiveRoomKeys, sessionId: string, studentId: string, isSureUntilMs = 0): Promise<string> {
    this.roomsOpened.note(studentId);
    const roomName = `${getRoomPrefix(sessionId)}-${randomBytes(4).toString('hex')}`;
    const name = getClient(keys)
      .createRoom({ name: roomName, ...ROOM_SETTINGS, agents: [new RoomAgentDispatch({ agentName: keys.agentName, restartPolicy: JobRestartPolicy.JRP_NEVER })] })
      .then(() => roomName);
    name.catch(() => this.roomsOpened.takeBack(studentId));
    this.remember(sessionId, { name, isSureUntilMs });
    return name;
  }

  private async findOpenRoom(keys: LiveRoomKeys, sessionId: string): Promise<string | null> {
    const known = this.knownRooms.get(sessionId);
    if (!known) {
      const found = getNewest(await this.findRooms(keys, sessionId))?.name ?? null;
      if (found) this.remember(sessionId, { name: Promise.resolve(found), isSureUntilMs: 0 });
      return found;
    }
    this.remember(sessionId, known);
    const name = await known.name.catch(() => null);
    if (!name) return null;
    const { isSureUntilMs } = known;
    known.isSureUntilMs = 0;
    if (isSureUntilMs > 0) return Date.now() < isSureUntilMs ? name : null;
    const [room] = await getClient(keys).listRooms([name]);
    return room ? name : null;
  }

  /** A new session is about to talk, and a job takes about 2.3 s to start, so the tutor starts now. It hears nothing until the student joins, and the room closes itself if none does. */
  warm(sessionId: string, studentId: string): void {
    const keys = getLiveRoomKeys(process.env);
    if (!keys || this.roomsOpened.getWaitMs(studentId) > 0) return;
    this.openNew(keys, sessionId, studentId, Date.now() + WARMED_ROOM_LASTS_MS).catch((problem: unknown) => {
      this.knownRooms.delete(sessionId);
      this.logger.warn(`Could not warm a room: ${String(problem)}`);
    });
  }

  /** Joins the room this session has open, so a rejoin or a reload finds its tutor, or opens one if it has none. */
  async open(keys: LiveRoomKeys, sessionId: string, studentId: string): Promise<string> {
    const found = await this.findOpenRoom(keys, sessionId).catch(() => {
      throw new ServiceUnavailableException('Live voice could not open a room.');
    });
    if (found) return found;
    refuseIfAtLimit(studentId, this.roomsOpened);
    return this.openNew(keys, sessionId, studentId).catch(() => {
      throw new ServiceUnavailableException('Live voice could not open a room.');
    });
  }

  /** For a tutor that has gone. A second job beside a live one would talk over it, so the old room goes first. */
  async startOver(keys: LiveRoomKeys, sessionId: string, studentId: string): Promise<string> {
    refuseIfAtLimit(studentId, this.startsOver, this.roomsOpened);
    this.startsOver.note(studentId);
    try {
      await this.closeAll(keys, sessionId);
      return await this.openNew(keys, sessionId, studentId);
    } catch {
      this.startsOver.takeBack(studentId);
      throw new ServiceUnavailableException('Live voice could not open a room.');
    }
  }

  /** The tutor closes its own room after a recap. This is for a tutor that never does. */
  closeAfter(sessionId: string, waitMs: number): void {
    setTimeout(() => void this.close(sessionId), waitMs).unref();
  }

  // A room that will not close must not stop a session finishing. It closes itself once the student has gone, and a finished session gets no new token.
  async close(sessionId: string): Promise<void> {
    const keys = getLiveRoomKeys(process.env);
    if (!keys) return;
    await this.closeAll(keys, sessionId).catch((problem: unknown) => this.logger.warn(`Could not close a room: ${String(problem)}`));
  }

  private async closeAll(keys: LiveRoomKeys, sessionId: string): Promise<void> {
    const known = this.knownRooms.get(sessionId);
    this.knownRooms.delete(sessionId);
    const knownName = await known?.name.catch(() => null);
    const names = knownName ? [knownName] : (await this.findRooms(keys, sessionId)).map((room) => room.name);
    await Promise.all(
      names.map((name) =>
        getClient(keys)
          .deleteRoom(name)
          .catch((problem: { status?: number }) => {
            if (problem.status !== NOT_FOUND) throw problem;
          }),
      ),
    );
  }
}
