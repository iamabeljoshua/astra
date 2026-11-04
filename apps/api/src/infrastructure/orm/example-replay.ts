const WORD_MS = 300;

function spoken(seq: number, atMs: number, id: string, turnId: string, script: (string | object)[], { firedCueMs = [] as number[], expectsReply = false } = {}) {
  const words = script.filter((part) => typeof part === 'string').join('').trim().split(/\s+/);
  return { seq, atMs, kind: 'beatPlayed', turnId, reportedBy: 'browser', ending: 'finished', frozen: [], beat: { id, script, expectsReply }, wordStartsMs: words.map((_, index) => index * WORD_MS), durationMs: words.length * WORD_MS, playedWords: words.length, firedCueMs };
}

function worked(seq: number, atMs: number, id: string, text: string, tex: string, verdict: object, closes: object = {}) {
  return { seq, atMs, kind: 'studentActed', action: { action: 'worked', work: { way: 'write', id, task: 'try', text }, reading: { kind: 'math', parts: [{ type: 'math', text, tex }], isAsking: false }, verdict, ...closes } };
}

export const EXAMPLE_REPLAY_EVENTS: object[] = [
  spoken(0, 1000, 'greet', 'turn-seed-1', ['Welcome back, Maya.']),
  spoken(1, 2500, 'set', 'turn-seed-2', [{ kind: 'writeMath', id: 'steps', tex: 'x^2 - 5x + 6 = 0', claim: 'new' }, 'Here is one to factor, x squared minus five x plus six equals zero.'], { firedCueMs: [0] }),
  spoken(2, 7000, 'ask', 'turn-seed-2', [{ kind: 'task', id: 'try', way: 'write', on: 'steps' }, 'Which two numbers add to negative five and multiply to six?'], { firedCueMs: [0], expectsReply: true }),
  { seq: 3, atMs: 11_500, kind: 'studentSpoke', text: 'is it minus two and minus three', source: 'voice', isReaction: false, durationMs: 1800 },
  worked(4, 14_000, 's1', '(x - 1)(x - 6) = 0', '(x-1)(x-6)=0', { status: 'unknown' }),
  spoken(5, 16_000, 'hint', 'turn-seed-3', ['Check that one. Minus one and minus six multiply to six, but do they add to minus five?']),
  worked(6, 22_000, 's2', 'x = 2', 'x=2', { status: 'right' }),
  worked(7, 25_000, 's3', 'x = 3', 'x=3', { status: 'right' }, { closesTask: 'try' }),
  spoken(8, 27_000, 'yes', 'turn-seed-4', [{ kind: 'annotate', id: 'tick', mark: 'check', target: 's3' }, 'Yes, two and three. Both make the whole thing zero.'], { firedCueMs: [0] }),
  spoken(9, 32_000, 'recap-0', 'turn-seed-5', ['We worked on factoring x squared minus five x plus six.']),
  spoken(10, 35_300, 'recap-1', 'turn-seed-5', ['You got x equals two and x equals three.']),
  spoken(11, 38_000, 'recap-2', 'turn-seed-5', ['Try factoring x squared minus seven x plus twelve on your own.']),
];

export const EXAMPLE_RECAP = { kind: 'lesson', covered: 'We worked on factoring x squared minus five x plus six.', gotRight: 'You got x equals two and x equals three.', tryNext: 'Try factoring x squared minus seven x plus twelve on your own.' };

export const EXAMPLE_REPLAY_SESSION_TITLE = 'Solving quadratic equations';
