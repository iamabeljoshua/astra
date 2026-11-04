import { type Beat, BEAT_LIMITS, type BeatId, type FrozenFrame, getCues, getResumeScript, getSpokenWords, parseBeat, type PlayReport } from '@astra/contracts';

export interface ResumeRequest {
  beats: readonly Beat[];
  /** What the browser said played. */
  reports: ReadonlyMap<BeatId, PlayReport>;
  /** Words of each beat whose audio left the agent, the only record when a report is lost. */
  wordsSent: ReadonlyMap<BeatId, number>;
  /** Keeps a resumed beat's id apart from the beat it continues. */
  resumeTag: string;
}

interface BeatCut {
  fromWord: number;
  firedCues: number;
  frozen: readonly FrozenFrame[];
}

function getCut(beat: Beat, { reports, wordsSent }: ResumeRequest): BeatCut | null {
  const report = reports.get(beat.id);
  if (report) return { fromWord: Math.max(report.playedWords - 1, 0), firedCues: report.firedCueMs.length, frozen: report.frozen };
  const sent = wordsSent.get(beat.id) ?? 0;
  if (sent === 0) return null;
  const fromWord = Math.max(sent - 1, 0);
  return { fromWord, firedCues: getCues(beat).filter((cue) => cue.atWord < fromWord).length, frozen: [] };
}

function makeBeat(id: string, script: Beat['script'], expectsReply: boolean): Beat[] {
  const parsed = parseBeat({ id, script, expectsReply });
  return parsed.ok ? [parsed.value] : [];
}

// The parser caps a beat's commands, and a resume adds some, so the commands past the limit go in a beat of their own that holds the rest of the words.
function splitAtCommandLimit(id: string, script: Beat['script'], expectsReply: boolean): Beat[] {
  const commands = script.filter((part) => typeof part !== 'string').length;
  if (commands <= BEAT_LIMITS.commands) return makeBeat(id, script, expectsReply);
  const firstText = script.findIndex((part) => typeof part === 'string');
  const leading = script.slice(0, firstText).slice(0, BEAT_LIMITS.commands);
  const overflow = script.slice(0, firstText).slice(BEAT_LIMITS.commands);
  const text = getSpokenWords(script.filter((part) => typeof part === 'string').join(''));
  if (text.length === 0) return [];
  const [firstWord, ...laterWords] = text;
  const later = script.slice(firstText).filter((part) => typeof part !== 'string');
  return [...makeBeat(id, [...leading, `${firstWord} `], false), ...makeBeat(`${id}-rest`, [...overflow, ...later.slice(0, BEAT_LIMITS.commands), laterWords.join(' ') || '...'], expectsReply)];
}

function getResumedBeat(beat: Beat, cut: BeatCut, resumeTag: string): Beat[] {
  const script = getResumeScript(beat, cut);
  const hasWords = script.some((part) => typeof part === 'string' && part.trim() !== '');
  return hasWords ? splitAtCommandLimit(`${beat.id}-${resumeTag}`, script, beat.expectsReply) : [];
}

// The rest of a cut turn, from the word it was cut on. Every cue the browser fired stays fired, so a late or lost report never draws anything twice.
export function getResumeBeats(request: ResumeRequest): Beat[] {
  return request.beats.flatMap((beat) => {
    if (request.reports.get(beat.id)?.ending === 'finished') return [];
    const cut = getCut(beat, request);
    return cut ? getResumedBeat(beat, cut, request.resumeTag) : [beat];
  });
}

