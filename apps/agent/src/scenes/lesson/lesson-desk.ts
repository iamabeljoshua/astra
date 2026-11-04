import type { SpendLedger } from '../spend-ledger.ts';

const MOST_LESSONS_A_WINDOW = 6;
const LESSON_WINDOW_MS = 10 * 60_000;
const MOST_LESSONS_AT_ONCE = 2;
const MOST_ID_CHARACTERS = 100;
const MOST_REQUEST_CHARACTERS = 400;
const MS_PER_SECOND = 1000;
const STUDENT_ID_SHAPE = /^[\w-]+$/;

export interface LessonRequest {
  sessionId: string;
  studentId: string;
  request: string;
  isCard: boolean;
  /** A card's own question, from the library. */
  cardLine?: string;
}

/** Each reason tells a student something different, and a wait is only stated when one is real. */
export type LessonRefusal = { refused: 'twoOpen' } | { refused: 'tooManyStarts' | 'studentSpent' | 'everyoneSpent'; retryAfterSeconds: number };

export type LessonReply = { url: string; token: string } | LessonRefusal;

interface RunningLesson {
  studentId: string;
  isClosing: boolean;
  isStudentHere: boolean;
  finished: Promise<void>;
}

const isShortText = (value: unknown, most: number): value is string => typeof value === 'string' && value !== '' && value.length <= most;

/** The API is this service's only caller, but what crosses a process is read as if it could be anything. */
export function parseLessonRequest(body: string): LessonRequest | null {
  try {
    const { sessionId, studentId, request, isCard, cardLine } = JSON.parse(body) as Record<string, unknown>;
    if (!isShortText(sessionId, MOST_ID_CHARACTERS) || !isShortText(studentId, MOST_ID_CHARACTERS) || !STUDENT_ID_SHAPE.test(studentId) || !isShortText(request, MOST_REQUEST_CHARACTERS) || typeof isCard !== 'boolean') return null;
    return { sessionId, studentId, request, isCard, ...(isShortText(cardLine, MOST_REQUEST_CHARACTERS) ? { cardLine } : {}) };
  } catch {
    return null;
  }
}

export function createLessonDesk({ run, makeToken, ledger, getNowMs, url, onFailed }: { run(lesson: LessonRequest & { onClosing(): void; onPresence(isHere: boolean): void }): Promise<void>; makeToken(room: string, identity: string): Promise<string>; ledger: SpendLedger; getNowMs(): number; url: string; onFailed?(sessionId: string, error: unknown): void }) {
  const running = new Map<string, RunningLesson>();
  const startsByStudent = new Map<string, number[]>();

  const getStartsInWindow = (studentId: string) => (startsByStudent.get(studentId) ?? []).filter((atMs) => getNowMs() - atMs < LESSON_WINDOW_MS);

  const getRefusal = (studentId: string): LessonRefusal | null => {
    const limit = ledger.getModelLimitReached(studentId);
    if (limit) return { refused: limit === 'student' ? 'studentSpent' : 'everyoneSpent', retryAfterSeconds: ledger.getSecondsToNextDay() };
    // A lesson whose student has gone back is only waiting out its rejoin time, so it does not hold a place.
    const atOnce = [...running.values()].filter((lesson) => lesson.studentId === studentId && lesson.isStudentHere).length;
    if (atOnce >= MOST_LESSONS_AT_ONCE) return { refused: 'twoOpen' };
    const starts = getStartsInWindow(studentId);
    return starts.length >= MOST_LESSONS_A_WINDOW ? { refused: 'tooManyStarts', retryAfterSeconds: Math.ceil(((starts[0] as number) + LESSON_WINDOW_MS - getNowMs()) / MS_PER_SECOND) } : null;
  };

  const startLesson = (request: LessonRequest) => {
    startsByStudent.set(request.studentId, [...getStartsInWindow(request.studentId), getNowMs()]);
    const lesson: RunningLesson = { studentId: request.studentId, isClosing: false, isStudentHere: true, finished: Promise.resolve() };
    running.set(request.sessionId, lesson);
    const onClosing = () => {
      lesson.isClosing = true;
    };
    const onPresence = (isHere: boolean) => {
      lesson.isStudentHere = isHere;
    };
    lesson.finished = Promise.resolve()
      .then(() => run({ ...request, onClosing, onPresence }))
      .catch((error: unknown) => onFailed?.(request.sessionId, error))
      .finally(() => {
        if (running.get(request.sessionId) === lesson) running.delete(request.sessionId);
      });
  };

  const start = async (request: LessonRequest): Promise<LessonReply> => {
    let found = running.get(request.sessionId);
    while (found?.isClosing) {
      await found.finished;
      found = running.get(request.sessionId);
    }
    if (found) found.isStudentHere = true;
    else {
      const refusal = getRefusal(request.studentId);
      if (refusal) return refusal;
      startLesson(request);
    }
    return { url, token: await makeToken(`lesson-${request.sessionId}`, `student-${request.sessionId}`) };
  };

  return { start };
}
