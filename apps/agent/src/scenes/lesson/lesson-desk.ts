import type { SpendLedger } from '../spend-ledger.ts';

const MOST_LESSONS_A_WINDOW = 6;
const LESSON_WINDOW_MS = 10 * 60_000;
const MOST_LESSONS_AT_ONCE = 2;
const MOST_ID_CHARACTERS = 100;
const MOST_REQUEST_CHARACTERS = 400;

export interface LessonRequest {
  sessionId: string;
  studentId: string;
  request: string;
  isCard: boolean;
}

export type LessonReply = { url: string; token: string } | { refused: 'tooMany' | 'spent' };

interface RunningLesson {
  studentId: string;
  isClosing: boolean;
  finished: Promise<void>;
}

const isShortText = (value: unknown, most: number): value is string => typeof value === 'string' && value !== '' && value.length <= most;

/** The API is this service's only caller, but what crosses a process is read as if it could be anything. */
export function parseLessonRequest(body: string): LessonRequest | null {
  try {
    const { sessionId, studentId, request, isCard } = JSON.parse(body) as Record<string, unknown>;
    if (!isShortText(sessionId, MOST_ID_CHARACTERS) || !isShortText(studentId, MOST_ID_CHARACTERS) || !isShortText(request, MOST_REQUEST_CHARACTERS) || typeof isCard !== 'boolean') return null;
    return { sessionId, studentId, request, isCard };
  } catch {
    return null;
  }
}

export function createLessonDesk({ run, makeToken, ledger, getNowMs, url, onFailed }: { run(lesson: LessonRequest & { onClosing(): void }): Promise<void>; makeToken(room: string, identity: string): Promise<string>; ledger: SpendLedger; getNowMs(): number; url: string; onFailed?(sessionId: string, error: unknown): void }) {
  const running = new Map<string, RunningLesson>();
  const startsByStudent = new Map<string, number[]>();

  const getStartsInWindow = (studentId: string) => (startsByStudent.get(studentId) ?? []).filter((atMs) => getNowMs() - atMs < LESSON_WINDOW_MS);

  const getRefusal = (studentId: string): 'tooMany' | 'spent' | null => {
    if (ledger.isOverModelLimit(studentId)) return 'spent';
    const atOnce = [...running.values()].filter((lesson) => lesson.studentId === studentId).length;
    return atOnce >= MOST_LESSONS_AT_ONCE || getStartsInWindow(studentId).length >= MOST_LESSONS_A_WINDOW ? 'tooMany' : null;
  };

  const startLesson = (request: LessonRequest) => {
    startsByStudent.set(request.studentId, [...getStartsInWindow(request.studentId), getNowMs()]);
    const lesson: RunningLesson = { studentId: request.studentId, isClosing: false, finished: Promise.resolve() };
    running.set(request.sessionId, lesson);
    lesson.finished = Promise.resolve()
      .then(() => run({ ...request, onClosing: () => { lesson.isClosing = true; } }))
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
    if (!found) {
      const refused = getRefusal(request.studentId);
      if (refused) return { refused };
      startLesson(request);
    }
    return { url, token: await makeToken(`lesson-${request.sessionId}`, `student-${request.sessionId}`) };
  };

  return { start };
}
