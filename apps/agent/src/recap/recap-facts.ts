import { getBeatText, getSpokenWords, type SessionEvent, type StudentWork } from '@astra/contracts';

export type WorkStatus = 'right' | 'wrong' | 'unknown';

/** What the log can stand behind, and all a recap may draw on. */
export interface RecapFacts {
  /** The line the page sent to start the tutor. It may hold the student's own question. */
  opening: string | null;
  /** The topic the student last moved this session to, which is its title now. The log does not hold it, so the brain fills it in. */
  movedTo: string | null;
  /** Only what played, so words the student never heard cannot be recapped. */
  tutorWords: readonly string[];
  studentLines: readonly string[];
  work: readonly { line: string; status: WorkStatus }[];
}

function getWorkLine(work: StudentWork): string | null {
  switch (work.way) {
    case 'write':
      return work.text;
    case 'pick':
      return work.part;
    case 'place':
      return work.placed.filter((item) => item !== null).join(', ');
    case 'drag':
      return `x = ${work.x}`;
    case 'leave':
      return null;
  }
}

export function getRecapFacts(log: readonly SessionEvent[], opening: string | null): RecapFacts {
  const facts = { opening, movedTo: null, tutorWords: [] as string[], studentLines: [] as string[], work: [] as { line: string; status: WorkStatus }[] };
  for (const event of log) {
    if (event.kind === 'beatPlayed') facts.tutorWords.push(...getSpokenWords(getBeatText(event.beat)).slice(0, event.playedWords));
    if (event.kind === 'studentSpoke' && !event.isReaction) facts.studentLines.push(event.text);
    if (event.kind === 'studentActed' && event.action.action === 'worked') {
      const line = getWorkLine(event.action.work);
      if (line) facts.work.push({ line, status: event.action.verdict.status });
    }
  }
  return facts;
}
