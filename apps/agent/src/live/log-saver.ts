import type { SessionEvent } from '@astra/contracts';
import { ApiRefusedError } from '../tutor/api-link.ts';

const SAVE_EVERY_MS = 5000;
const MOST_EVENTS_IN_A_SAVE = 200;
/** The API refuses a body past 100 KB. */
const MOST_BYTES_IN_A_SAVE = 80_000;

export interface LogSaverOptions {
  save(events: readonly SessionEvent[]): Promise<void>;
  onFailed?(problem: string): void;
}

export interface LogSaver {
  note(event: SessionEvent): void;
  close(): Promise<void>;
}

// Sends the log as it grows, so a crash loses seconds and not a lesson. A beat's row grows as it plays, so a later write of a row replaces the waiting one.
export function createLogSaver({ save, onFailed = () => {} }: LogSaverOptions): LogSaver {
  const unsaved = new Map<number, SessionEvent>();
  let saving: Promise<void> = Promise.resolve();

  const takeSave = (): SessionEvent[] => {
    const taken: SessionEvent[] = [];
    let bytes = 0;
    for (const [seq, event] of unsaved) {
      bytes += Buffer.byteLength(JSON.stringify(event));
      if (taken.length > 0 && (bytes > MOST_BYTES_IN_A_SAVE || taken.length >= MOST_EVENTS_IN_A_SAVE)) break;
      taken.push(event);
      unsaved.delete(seq);
    }
    return taken;
  };

  // A save the API refuses for good would otherwise come back every 5 s and hold up the log behind it, so it splits until only the bad event is left, and that goes.
  const saveOrDropRefused = async (events: SessionEvent[]): Promise<void> => {
    try {
      await save(events);
    } catch (problem) {
      if (!(problem instanceof ApiRefusedError)) throw problem;
      if (events.length === 1) return onFailed(`dropped: ${String(problem)}`);
      const middle = Math.ceil(events.length / 2);
      await saveOrDropRefused(events.slice(0, middle));
      await saveOrDropRefused(events.slice(middle));
    }
  };

  const saveAll = async () => {
    while (unsaved.size > 0) {
      const taken = takeSave();
      try {
        await saveOrDropRefused(taken);
      } catch (problem) {
        for (const event of taken) if (!unsaved.has(event.seq)) unsaved.set(event.seq, event);
        return onFailed(String(problem));
      }
    }
  };

  const flush = () => {
    saving = saving.then(saveAll);
    return saving;
  };
  const timer = setInterval(() => void flush(), SAVE_EVERY_MS);
  timer.unref();

  return {
    note: (event) => void unsaved.set(event.seq, event),
    async close() {
      clearInterval(timer);
      await flush();
    },
  };
}
