import { type Beat, type BeatId, type BrowserMessage, clipTypedText, parseSessionEvent, type PlayReport, type SessionEvent, type StudentWork, type TurnId, type WorkVerdict } from '@astra/contracts';

export interface SessionLogOptions {
  getNowMs(): number;
  getBeat(turnId: TurnId, beatId: BeatId): Beat | undefined;
  onWritten?(event: SessionEvent): void;
  onRefused?(problem: string): void;
}

export interface SessionLog {
  write(message: BrowserMessage): SessionEvent | null;
  writeWorked(message: BrowserMessage & { type: 'worked' }, checked: { reading?: unknown; verdict: WorkVerdict; closesTask?: string }): SessionEvent | null;
  writeHeard(work: StudentWork, checked: { reading?: unknown; verdict: WorkVerdict; closesTask?: string }): SessionEvent | null;
  /** Words the transcriber heard, as text. No sound comes here. */
  writeSaid(text: string, durationMs: number): SessionEvent | null;
  getEvents(): readonly SessionEvent[];
}

const MOST_EVENTS = 50_000;
const MOST_CLOCK_IDS = 16;

/** A beat only ever plays further, so a report of fewer words or cues is an old one arriving again. */
export function isFurtherReport(next: PlayReport, known: PlayReport): boolean {
  return next.playedWords > known.playedWords || (next.playedWords === known.playedWords && next.firedCueMs.length > known.firedCueMs.length);
}

// Writes what the browser says played, on one offset per page clock, so a slow message cannot move a beat against its neighbours, and a report it refuses never ends a lesson. A beat has one row, holding the furthest report.
export function createSessionLog({ getNowMs, getBeat, onWritten, onRefused }: SessionLogOptions): SessionLog {
  const events: SessionEvent[] = [];
  const browserToSessionMs = new Map<string, number>();
  const beatRows = new Map<string, { row: number; report: PlayReport }>();

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
      const { turnId, wordStartsMs, durationMs, playedWords, firedCueMs, cueAims, ending, frozen } = message;
      return beat ? { kind: 'beatPlayed', beat, reportedBy: 'browser', turnId, wordStartsMs, durationMs, playedWords, firedCueMs, ...(cueAims ? { cueAims } : {}), ending, frozen } : null;
    }
    if (message.type === 'boardFrozen') return { kind: 'boardFrozen', turnId: message.turnId, frozen: message.frozen };
    if (message.type === 'acted') return { kind: 'studentActed', action: message.action };
    if (message.type === 'typed') return { kind: 'studentSpoke', text: message.text, source: 'typed', isReaction: false, durationMs: 0 };
    return null;
  };

  const writeBody = (message: BrowserMessage, body: object | null): SessionEvent | null => {
      const offsetMs = getOffsetMs(message);
      if (!body) return null;
      const beatKey = message.type === 'played' ? `${message.turnId}/${message.beatId}` : null;
      const known = beatKey === null ? undefined : beatRows.get(beatKey);
      if (message.type === 'played' && known && !isFurtherReport(message, known.report)) return null;
      const row = known?.row ?? events.length;
      if (row >= MOST_EVENTS) return null;
      const parsed = parseSessionEvent({ seq: row, atMs: Math.max(0, offsetMs + message.browserMs - message.startedMsAgo), ...body });
      if (!parsed.ok) {
        onRefused?.(parsed.problem);
        return null;
      }
      events[row] = parsed.value;
      if (message.type === 'played' && beatKey !== null) beatRows.set(beatKey, { row, report: message });
      onWritten?.(parsed.value);
      return parsed.value;
  };

  const addAtNow = (body: object, startedMsAgo = 0): SessionEvent | null => {
    if (events.length >= MOST_EVENTS) return null;
    const parsed = parseSessionEvent({ seq: events.length, atMs: Math.max(0, Math.round(getNowMs() - startedMsAgo)), ...body });
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
    writeHeard: (work, checked) => addAtNow({ kind: 'studentActed', action: { action: 'worked', work, ...checked } }),
    writeSaid: (text, durationMs) => addAtNow({ kind: 'studentSpoke', text: clipTypedText(text), source: 'voice', isReaction: false, durationMs }, durationMs),
    write: (message) => writeBody(message, getBody(message)),
    writeWorked: (message, checked) => writeBody(message, { kind: 'studentActed', action: { action: 'worked', work: message.work satisfies StudentWork, ...checked } }),
  };
}
