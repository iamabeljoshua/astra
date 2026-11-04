import { getCues, type StudentWork } from '@astra/contracts';
import { type CheckedWork, cleanStudentText } from '@astra/board/shared';
import type { TurnSummary } from '../tutor/brain.ts';
import { getWorkWords } from '../tutor/watcher/watch-rule.ts';
import { isCrisis, isSafeToRemember, isTutorSafetyLine } from './screens.ts';

export type WordsEvent = { id: string; kind: 'words'; text: string; isOpening: boolean };
export type BoardEvent = { id: string; kind: 'board'; text: string; check: 'right' | 'wrong'; why: string | null; task: string | null; wasShownFirst: boolean };
export type TutorEvent = { id: string; kind: 'tutor'; text: string };
export type DigestEvent = WordsEvent | BoardEvent | TutorEvent;

export type DigestReading = { canRemember: false; why: 'safety' | 'nothingHappened' } | { canRemember: true; events: readonly DigestEvent[] };

/** What code actually saw in one room, in order. It is the only ground a note can stand on. */
export interface SessionDigest {
  addTurn(summary: Pick<TurnSummary, 'studentText' | 'spokenText' | 'endedAs' | 'beats'>): void;
  addWork(work: StudentWork, checked: CheckedWork): void;
  noteNeedsAPerson(): void;
  read(): DigestReading;
}

const MOST_EVENTS_KEPT = 120;
const MOST_CHARACTERS_OF_TUTOR = 200;
const MOST_CHARACTERS_OF_STUDENT = 160;
const WRITTEN_BY_THE_APP = /^\(.*\)$/;

const toLineKey = (text: string) => text.toLowerCase().replace(/\s+/g, '');

function getWorkText(work: StudentWork): string {
  return getWorkWords(work).replace(/^\((.*)\)$/, '$1');
}

// A wrong read of handwriting or speech is the reader's mistake as often as the student's, so only a sure read counts, and only typing can count as wrong.
function isTrustedCheck(work: StudentWork, checked: CheckedWork): checked is CheckedWork & { verdict: { status: 'right' | 'wrong' } } {
  if (checked.verdict.status === 'unknown') return false;
  if (work.way !== 'write') return true;
  const read = work.ink ?? work.heard;
  if (!read) return true;
  return checked.verdict.status === 'right' && !read.isUnsure;
}

function getLinesTheTutorWrote(beats: TurnSummary['beats']): string[] {
  return beats.flatMap((beat) => getCues(beat).flatMap(({ command }) => ('tex' in command && typeof command.tex === 'string' ? [toLineKey(command.tex)] : [])));
}

export function createSessionDigest(): SessionDigest {
  let events: DigestEvent[] = [];
  let isSafetyStop = false;
  let hasStudentActed = false;
  let turnsSeen = 0;
  let lastWorkText: string | null = null;
  let nextId = 1;
  const tutorLines = new Set<string>();

  const add = (event: Omit<WordsEvent, 'id'> | Omit<BoardEvent, 'id'> | Omit<TutorEvent, 'id'>) => {
    const prefix = event.kind === 'words' ? 'w' : event.kind === 'board' ? 'b' : 't';
    events = [...events, { ...event, id: `${prefix}${nextId++}` } as DigestEvent].slice(-MOST_EVENTS_KEPT);
  };

  const addWords = (rawText: string, isOpening: boolean) => {
    const text = cleanStudentText(rawText).slice(0, MOST_CHARACTERS_OF_STUDENT);
    if (text !== '' && isSafeToRemember(text)) add({ kind: 'words', text, isOpening });
  };

  return {
    addTurn({ studentText, spokenText, endedAs, beats }) {
      turnsSeen += 1;
      const isOpening = turnsSeen === 1;
      if (endedAs === 'refused' || isCrisis(studentText) || isTutorSafetyLine(spokenText)) isSafetyStop = true;
      for (const line of getLinesTheTutorWrote(beats)) tutorLines.add(line);
      const isWrittenByTheApp = WRITTEN_BY_THE_APP.test(studentText.trim()) || cleanStudentText(studentText) === lastWorkText;
      lastWorkText = null;
      if (!isWrittenByTheApp && endedAs !== 'rejected') {
        hasStudentActed ||= !isOpening;
        addWords(studentText, isOpening);
      }
      const tutorWords = spokenText.trim().slice(0, MOST_CHARACTERS_OF_TUTOR);
      if (tutorWords !== '') add({ kind: 'tutor', text: tutorWords });
    },
    addWork(work, checked) {
      if (work.way === 'leave') return;
      const text = cleanStudentText(getWorkText(work)).slice(0, MOST_CHARACTERS_OF_STUDENT);
      if (isCrisis(text)) isSafetyStop = true;
      hasStudentActed = true;
      lastWorkText = work.way === 'write' ? cleanStudentText(work.text) : null;
      if (text === '' || !isSafeToRemember(text)) return;
      if (isTrustedCheck(work, checked)) {
        const { status } = checked.verdict;
        add({ kind: 'board', text, check: status, why: status === 'wrong' ? (checked.verdict.why ?? null) : null, task: work.task ?? null, wasShownFirst: tutorLines.has(toLineKey(text)) });
      } else if (work.way === 'write' && !work.ink && !work.heard) {
        add({ kind: 'words', text, isOpening: false });
      }
    },
    noteNeedsAPerson() {
      isSafetyStop = true;
    },
    read() {
      if (isSafetyStop) return { canRemember: false, why: 'safety' };
      if (!hasStudentActed) return { canRemember: false, why: 'nothingHappened' };
      return { canRemember: true, events };
    },
  };
}
