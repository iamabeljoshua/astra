import { type Beat, type BeatId, type BrowserMessage, parseSessionEvent, type SessionEvent, type TurnId } from '@astra/contracts';

export interface SessionLogOptions {
  getNowMs(): number;
  getBeat(turnId: TurnId, beatId: BeatId): Beat | undefined;
  onWritten?(event: SessionEvent): void;
}

export interface SessionLog {
  write(message: BrowserMessage): SessionEvent | null;
  getEvents(): readonly SessionEvent[];
}

// The agent is the only writer, and it writes what the browser says played. M3.10 moves this into the database.
export function createSessionLog({ getNowMs, getBeat, onWritten }: SessionLogOptions): SessionLog {
  const events: SessionEvent[] = [];
  let browserToSessionMs: number | null = null;

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
      // One offset for the whole session, so a slow message cannot move a beat against the ones around it.
      browserToSessionMs ??= Math.round(getNowMs()) - message.browserMs;
      const body = getBody(message);
      if (!body) return null;
      const parsed = parseSessionEvent({ seq: events.length, atMs: Math.max(0, browserToSessionMs + message.browserMs - message.startedMsAgo), ...body });
      if (!parsed.ok) throw new Error(`log refused: ${parsed.problem}`);
      events.push(parsed.value);
      onWritten?.(parsed.value);
      return parsed.value;
    },
  };
}
