import { getTopicKey } from '../learner-record/learner-note-options';
import type { LearnerNoteDto } from '../learner-record/learner-record.dto';

const MILLISECONDS_PER_DAY = 86_400_000;
const MOST_DAYS_A_NOTE_COUNTS = 120;

// A second net after the agent's screens. Those lean on "my" and "I'm", and this refuses the subject itself. It leans toward refusing, because a lost card costs little.
const DISTRESS_OR_HEALTH = [
  /\b(?:suicid\w*|sewerslide|unalive|self[- ]?harm\w*|overdos\w*|kms|kill\w* my\s?self|hurt\w* my\s?self|cut\w* my\s?self|wan(?:t|ted|na)(?: to)? die|end(?:ing)? (?:it all|my life)|abus\w+|rape\w*|molest\w*|groom(?:ed|ing)|bruises?)\b/i,
  /\b(?:anxi\w+|depress\w*|stress(?:ed|ful)?|panic\w*|lonely|hopeless|worthless|sad|cry|cried|crying|scared|afraid|overwhelmed|upset|trauma\w*|ptsd|bull(?:y|ies|ied|ying))\b/i,
  /\b(?:health\w*|ill|illness\w*|sick\w*|disease\w*|diabet\w*|cancer\w*|asthma\w*|allerg\w*|medicat\w*|medicine\w*|meds|pills?|doctors?|therap\w*|diagnos\w*|adhd|autis\w*|dyslexi\w*|anorexi\w*|bulimi\w*|eating disorders?|pregnan\w*|puberty|weight loss|lose weight|diets?|dieting)\b/i,
];

function isFitForACard({ topic, detail, evidence, sessionTitle }: LearnerNoteDto): boolean {
  const words = [topic, detail ?? '', sessionTitle, ...evidence.map(({ text }) => text)].join(' \n ');
  return !DISTRESS_OR_HEALTH.some((pattern) => pattern.test(words));
}

// A liking stands apart from how the work went, so "showed" and "struggled" on one topic replace each other and leave "cares_about" alone.
const getStandingKey = ({ kind, topic }: LearnerNoteDto) => `${kind === 'cares_about' ? 'liking' : 'work'} ${getTopicKey(topic)}`;

function keepNewestStanding(newestFirst: LearnerNoteDto[]): LearnerNoteDto[] {
  const seenKeys = new Set<string>();
  return newestFirst.filter((note) => {
    const key = getStandingKey(note);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

/** The notes that may shape a card: the newest word on each topic, within the days the tutor still reads it, about nothing private. */
export function getUsableNotes(newestFirst: LearnerNoteDto[], now: Date): LearnerNoteDto[] {
  const oldestCounted = now.getTime() - MOST_DAYS_A_NOTE_COUNTS * MILLISECONDS_PER_DAY;
  return keepNewestStanding(newestFirst.filter(({ kind }) => kind !== 'explored'))
    .filter(({ notedAt }) => notedAt.getTime() >= oldestCounted)
    .filter(isFitForACard);
}
