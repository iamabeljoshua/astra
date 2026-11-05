import { soundsLikeCrisisReply } from './help-words.ts';
import type { SafetyCheck } from './safety-check.ts';
import { isSafetyKind, type SafetyKind, type StudentReading } from './student-reading.ts';

type TraceNote = (name: string, fields?: Record<string, unknown>) => void;

export type FlagSource = 'student' | 'tutor';
export type FlagKind = SafetyKind | 'vague' | 'tutor_slip';
/** The most worrying thing raised in this room. `danger` means a person is needed, and `vague` that nothing plain was read. */
export type SessionReading = 'danger' | 'vague' | 'none';

export interface SafetyFlag {
  kind: FlagKind;
  source: FlagSource;
}

export interface SafetyWatch {
  /** A kind, or `vague` outside a school talk, has raised a flag and shown the help by the time this resolves, and `vague` in a school talk resolves as `school`. `onlySteersTheLesson` says the words only ask something of the lesson, so `vague` stands down unless something worrying has been raised already. */
  readStudent(text: string, tutorSaid: string, onlySteersTheLesson?: () => Promise<boolean>): Promise<StudentReading>;
  noteTurnEnd(turn: { spoken: string; safetyRead: Promise<void>; getKind(): SafetyKind | null }): void;
  showHelp(): void;
  showHelpIfRaised?(): void;
  readSession(): Promise<SessionReading>;
  flush(): Promise<void>;
}

export interface SafetyWatchOptions {
  check: SafetyCheck;
  addFlag(flag: SafetyFlag): Promise<void>;
  showHelp(): void;
  trace: TraceNote;
  flagRetryWaitMs?: number;
}

const FLAG_RETRY_WAIT_MS = 1000;

const getFlagKey = ({ kind, source }: SafetyFlag) => `${kind}/${source}`;

// One room's safety reads. Each kind of flag is raised once and kept until the API takes it, and traces never hold the words.
export function createSafetyWatch({ check, addFlag, showHelp, trace, flagRetryWaitMs = FLAG_RETRY_WAIT_MS }: SafetyWatchOptions): SafetyWatch {
  const raised = new Set<string>();
  let unsent: SafetyFlag[] = [];
  let sending: Promise<void> = Promise.resolve();
  let isHelpShown = false;
  let reading: Promise<unknown> = Promise.resolve();
  let studentSaid = '';
  let isInSchoolTalk = false;
  let sessionReading: SessionReading = 'none';

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
    if (isSafetyKind(flag.kind)) sessionReading = 'danger';
    else if (flag.kind === 'vague' && sessionReading === 'none') sessionReading = 'vague';
    if (raised.has(getFlagKey(flag))) return;
    raised.add(getFlagKey(flag));
    unsent.push(flag);
    send();
  };

  // One vague read in a school talk is excused. A second in a row, or anything worrying, means the talk no longer explains the words.
  const settleReading = (studentReading: StudentReading): StudentReading => {
    const isExcused = studentReading === 'vague' && isInSchoolTalk;
    isInSchoolTalk = studentReading === 'school' || (isInSchoolTalk && (studentReading === 'none' || studentReading === 'unread'));
    if (isExcused) trace('vagueInSchoolTalk');
    return isExcused ? 'school' : studentReading;
  };

  const showHelpOnce = () => {
    if (isHelpShown) return;
    isHelpShown = true;
    showHelp();
  };

  return {
    showHelp: showHelpOnce,
    showHelpIfRaised() {
      if (isHelpShown) showHelp();
    },
    readStudent(text, tutorSaid, onlySteersTheLesson) {
      const before = { studentSaid, tutorSaid };
      const read = check.readStudent(text, before).then(async (firstReading) => {
        const heldBack = isSafetyKind(firstReading) && isInSchoolTalk && (await check.fitsSchoolTalk(text, before)) ? 'vague' : firstReading;
        const studentReading = heldBack === 'vague' && sessionReading === 'none' && (await onlySteersTheLesson?.()) ? 'none' : heldBack;
        trace('safetyRead', { reading: studentReading });
        const settled = settleReading(studentReading);
        if (isSafetyKind(settled) || settled === 'vague') {
          showHelpOnce();
          raise({ kind: settled, source: 'student' });
        }
        return settled;
      });
      studentSaid = text;
      reading = Promise.all([reading, read]);
      return read;
    },
    noteTurnEnd({ spoken, safetyRead, getKind }) {
      if (spoken === '') return;
      reading = Promise.all([
        reading,
        safetyRead.then(() => {
          if (!getKind() && soundsLikeCrisisReply(spoken)) raise({ kind: 'danger', source: 'tutor' });
        }),
        check.readTutor(spoken).then((tutorReading) => {
          trace('safetyRead', { reading: tutorReading, of: 'tutor' });
          if (tutorReading === 'tutor_slip') raise({ kind: tutorReading, source: 'tutor' });
        }),
      ]);
    },
    async readSession() {
      await reading;
      return sessionReading;
    },
    // A student who says something serious and closes the tab must still reach the queue, so this waits for reads still running.
    async flush() {
      await reading;
      send();
      await sending;
      if (unsent.length === 0) return;
      await new Promise((done) => setTimeout(done, flagRetryWaitMs));
      send();
      await sending;
    },
  };
}
