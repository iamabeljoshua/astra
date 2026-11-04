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

// Writes what the browser says played, on one clock offset so a slow message cannot move a beat against its neighbours.
export function createSessionLog({ getNowMs, getBeat, onWritten }: SessionLogOptions): SessionLog {
  const events: SessionEvent[] = [];
  let browserToSessionMs: number | null = null;

  const getBody = (message: BrowserMessage): object | null => {
    if (message.type === 'played') {
      const beat = getBeat(message.turnId, message.beatId);
      const { turnId, wordStartsMs, durationMs, playedWords, firedCueMs, cueAims, ending, frozen } = message;
      return beat ? { kind: 'beatPlayed', beat, reportedBy: 'browser', turnId, wordStartsMs, durationMs, playedWords, firedCueMs, ...(cueAims ? { cueAims } : {}), ending, frozen } : null;
    }
    if (message.type === 'boardFrozen') return { kind: 'boardFrozen', turnId: message.turnId, frozen: message.frozen };
    if (message.type === 'acted') return { kind: 'studentActed', action: message.action };
    return null;
  };

  return {
    getEvents: () => events,
    write(message) {
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
