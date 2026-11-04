import { type Beat, type BeatId, type BrowserMessage, parseSessionEvent, type SessionEvent, type StudentWork, type TurnId, type WorkVerdict } from '@astra/contracts';

export interface SessionLogOptions {
  getNowMs(): number;
  getBeat(turnId: TurnId, beatId: BeatId): Beat | undefined;
  onWritten?(event: SessionEvent): void;
  onRefused?(problem: string): void;
}

export interface SessionLog {
  write(message: BrowserMessage): SessionEvent | null;
  /** Writes work on the board with what code made of it, because a browser's own word for it is not evidence. */
  writeWorked(message: BrowserMessage & { type: 'worked' }, checked: { reading?: unknown; verdict: WorkVerdict; closesTask?: string }): SessionEvent | null;
  /** Writes work the agent heard, on the session's own clock, because no page sent it. */
  writeHeard(work: StudentWork, checked: { reading?: unknown; verdict: WorkVerdict; closesTask?: string }): SessionEvent | null;
  getEvents(): readonly SessionEvent[];
}

const MOST_EVENTS = 50_000;
const MOST_CLOCK_IDS = 16;

// Writes what the browser says played, on one offset per page clock, so a slow message cannot move a beat against its neighbours, and a report it refuses never ends a lesson.
export function createSessionLog({ getNowMs, getBeat, onWritten, onRefused }: SessionLogOptions): SessionLog {
  const events: SessionEvent[] = [];
  const browserToSessionMs = new Map<string, number>();

  const getOffsetMs = ({ clockId, browserMs }: BrowserMessage): number => {
    const known = browserToSessionMs.get(clockId);
    if (known !== undefined) return known;
    const offsetMs = Math.round(getNowMs()) - browserMs;
    if (browserToSessionMs.size >= MOST_CLOCK_IDS) browserToSessionMs.delete(browserToSessionMs.keys().next().value as string);
    browserToSessionMs.set(clockId, offsetMs);
    return offsetMs;
  };

  const getBody = (message: BrowserMessage): object | null => {
    if (message.type === 'played') {
      const beat = getBeat(message.turnId, message.beatId);
      const { turnId, wordStartsMs, durationMs, playedWords, firedCueMs, ending, frozen } = message;
      return beat ? { kind: 'beatPlayed', beat, reportedBy: 'browser', turnId, wordStartsMs, durationMs, playedWords, firedCueMs, ending, frozen } : null;
    }
    if (message.type === 'boardFrozen') return { kind: 'boardFrozen', turnId: message.turnId, frozen: message.frozen };
    if (message.type === 'acted') return { kind: 'studentActed', action: message.action };
    return null;
  };

  const writeBody = (message: BrowserMessage, body: object | null): SessionEvent | null => {
      const offsetMs = getOffsetMs(message);
      if (!body || events.length >= MOST_EVENTS) return null;
      const parsed = parseSessionEvent({ seq: events.length, atMs: Math.max(0, offsetMs + message.browserMs - message.startedMsAgo), ...body });
      if (!parsed.ok) {
        onRefused?.(parsed.problem);
        return null;
      }
      events.push(parsed.value);
      onWritten?.(parsed.value);
      return parsed.value;
  };

  return {
    getEvents: () => events,
    writeHeard(work, checked) {
      if (events.length >= MOST_EVENTS) return null;
      const parsed = parseSessionEvent({ seq: events.length, atMs: Math.max(0, Math.round(getNowMs())), kind: 'studentActed', action: { action: 'worked', work, ...checked } });
      if (!parsed.ok) {
        onRefused?.(parsed.problem);
        return null;
      }
      events.push(parsed.value);
      onWritten?.(parsed.value);
      return parsed.value;
    },
    write: (message) => writeBody(message, getBody(message)),
    writeWorked: (message, checked) => writeBody(message, { kind: 'studentActed', action: { action: 'worked', work: message.work satisfies StudentWork, ...checked } }),
  };
}
