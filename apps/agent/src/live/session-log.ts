import { type Beat, type BeatId, type BrowserMessage, parseSessionEvent, type SessionEvent, type TurnId } from '@astra/contracts';

export interface SessionLogOptions {
  getNowMs(): number;
  getBeat(turnId: TurnId, beatId: BeatId): Beat | undefined;
  onWritten?(event: SessionEvent): void;
  onRefused?(problem: string): void;
}

export interface SessionLog {
  write(message: BrowserMessage): SessionEvent | null;
  getEvents(): readonly SessionEvent[];
}

// Writes what the browser says played, on one offset per page clock, so a slow message cannot move a beat against its neighbours, and a report it refuses never ends a lesson.
export function createSessionLog({ getNowMs, getBeat, onWritten, onRefused }: SessionLogOptions): SessionLog {
  const events: SessionEvent[] = [];
  const browserToSessionMs = new Map<string, number>();

  const getOffsetMs = ({ clockId, browserMs }: BrowserMessage): number => {
    const known = browserToSessionMs.get(clockId);
    if (known !== undefined) return known;
    const offsetMs = Math.round(getNowMs()) - browserMs;
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

  return {
    getEvents: () => events,
    write(message) {
      const offsetMs = getOffsetMs(message);
      const body = getBody(message);
      if (!body) return null;
      const parsed = parseSessionEvent({ seq: events.length, atMs: Math.max(0, offsetMs + message.browserMs - message.startedMsAgo), ...body });
      if (!parsed.ok) {
        onRefused?.(parsed.problem);
        return null;
      }
      events.push(parsed.value);
      onWritten?.(parsed.value);
      return parsed.value;
    },
  };
}
