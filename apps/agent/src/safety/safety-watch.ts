import { promisesEmergencyHelp } from './help-words.ts';
import type { SafetyCheck, SafetyKind, StudentReading } from './safety-check.ts';

type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export type FlagSource = 'student' | 'tutor';
export type FlagKind = SafetyKind | 'tutor_slip';

/** What goes to the review queue. It has no field that could hold a word of what was said. */
export interface SafetyFlag {
  kind: FlagKind;
  source: FlagSource;
}

export interface SafetyWatch {
  /** Reads the student's words beside the reply. A kind has already raised a flag and shown the help by the time it resolves. */
  readStudent(text: string, tutorSaid: string): Promise<StudentReading>;
  noteTurnEnd(turn: { spoken: string; safetyRead: Promise<void>; getKind(): SafetyKind | null }): void;
  showHelp(): void;
  /** Sends what the API has not heard yet, so a room closing does not lose a flag. */
  flush(): Promise<void>;
}

export interface SafetyWatchOptions {
  check: SafetyCheck;
  addFlag(flag: SafetyFlag): Promise<void>;
  showHelp(): void;
  trace: TraceNote;
}

const getFlagKey = ({ kind, source }: SafetyFlag) => `${kind}/${source}`;

// One room's safety reads. It raises each kind of flag once, and keeps any the API has not taken. Traces name a reading and never the words.
export function createSafetyWatch({ check, addFlag, showHelp, trace }: SafetyWatchOptions): SafetyWatch {
  const raised = new Set<string>();
  let unsent: SafetyFlag[] = [];
  let sending: Promise<void> = Promise.resolve();
  let isHelpShown = false;

  const send = () => {
    sending = sending.then(async () => {
      const flags = unsent;
      unsent = [];
      for (const flag of flags) {
        await addFlag(flag).catch((error: unknown) => {
          unsent.push(flag);
          trace('flagFailed', { problem: String(error) });
        });
      }
    });
  };

  const raise = (flag: SafetyFlag) => {
    trace('safetyFlag', { kind: flag.kind, source: flag.source });
    if (raised.has(getFlagKey(flag))) return;
    raised.add(getFlagKey(flag));
    unsent.push(flag);
    send();
  };

  const showHelpOnce = () => {
    if (isHelpShown) return;
    isHelpShown = true;
    showHelp();
  };

  return {
    showHelp: showHelpOnce,
    async readStudent(text, tutorSaid) {
      const reading = await check.readStudent(text, tutorSaid);
      trace('safetyRead', { reading });
      if (reading === 'none' || reading === 'unread') return reading;
      showHelpOnce();
      raise({ kind: reading, source: 'student' });
      return reading;
    },
    noteTurnEnd({ spoken, safetyRead, getKind }) {
      if (spoken === '') return;
      void safetyRead.then(() => {
        if (!getKind() && promisesEmergencyHelp(spoken)) raise({ kind: 'danger', source: 'tutor' });
      });
      void check.readTutor(spoken).then((reading) => {
        trace('safetyRead', { reading, of: 'tutor' });
        if (reading === 'tutor_slip') raise({ kind: reading, source: 'tutor' });
      });
    },
    async flush() {
      send();
      await sending;
    },
  };
}
