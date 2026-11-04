import { type Beat, getBeatText, getCues, getSpokenWords, parseBeat } from '@astra/contracts';

const BALL = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } };

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}

export const LESSON: readonly (readonly Beat[])[] = [
  [
    makeBeat('jump-shot', [
      'Picture ',
      { kind: 'text', id: 'title', text: 'A jump shot' },
      'your jump shot. ',
      BALL,
      'The ball leaves ',
      { kind: 'vector', id: 'hand-push', on: 'shot.ball', angleDegrees: 55, length: 'medium', label: 'hand' },
      'your hand, and right then ',
      { kind: 'hide', target: 'hand-push' },
      'nothing pushes it any more. ',
    ]),
    makeBeat('the-climb', [
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak', overWords: 8 },
      'Watch it climb, slower and slower, until it reaches ',
      { kind: 'annotate', id: 'top-mark', target: 'shot.ball', mark: 'circle', label: 'top' },
      'the very top. ',
      { kind: 'writeMath', id: 'gravity', tex: 'g = 9.8' },
      'Gravity pulls at 9.8 metres per second squared, ',
      { kind: 'highlight', id: 'gravity-mark', target: 'gravity', tex: '9.8' },
      'the whole way up. ',
    ]),
    makeBeat('the-fall', [
      { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 7 },
      'So at the top it hangs, then falls. ',
      { kind: 'text', id: 'question', text: 'What still pushes it sideways?' },
      'Once it leaves your hand, what still pushes it sideways?',
    ], true),
  ],
  [
    makeBeat('sideways', [
      { kind: 'text', id: 'answer', text: 'Nothing pushes it' },
      'Nothing does. ',
      { kind: 'writeMath', id: 'sideways-speed', tex: 'v_x = 4.2' },
      'Its sideways speed stays at 4.2 metres per second, ',
      { kind: 'vector', id: 'sideways-arrow', on: 'shot.ball', angleDegrees: 0, length: 'short', label: 'sideways' },
      'because no force acts that way. ',
      { kind: 'runSimulation', target: 'shot', action: 'restart' },
      'Watch it fly again, ',
      { kind: 'focus', target: 'shot.ball' },
      'and follow the ball. ',
    ]),
  ],
];

const MOST_COMMANDS_IN_A_BEAT = 12;

// Proof only. The script's own cues sit where a writer put them, so these show what a cue on any other word would do, as near every nth word as a beat's command limit allows.
function addCueEveryWords(beat: Beat, every: number): Beat {
  const wordCount = getSpokenWords(getBeatText(beat)).length;
  const room = MOST_COMMANDS_IN_A_BEAT - getCues(beat).length;
  const spacing = Math.max(every, Math.ceil(wordCount / room));
  let wordIndex = 0;
  const script = beat.script.flatMap((part): unknown[] => {
    if (typeof part !== 'string') return [part];
    return part.split(/(?<=\s)/).flatMap((word) => {
      const index = wordIndex++;
      return index % spacing === 0 ? [{ kind: 'text', id: `${beat.id}-w${index}`, text: 'x' }, word] : [word];
    });
  });
  return makeBeat(beat.id, script, beat.expectsReply);
}

export function getLessonTurn({ lessonTurn = 0, repeats = 1, cueEveryWords }: { lessonTurn?: number; repeats?: number; cueEveryWords?: number }): readonly Beat[] {
  const beats = LESSON[lessonTurn] ?? [];
  const repeated = Array.from({ length: repeats }, (_, round) => beats.map((beat) => (repeats === 1 ? beat : makeBeat(`${beat.id}-r${round}`, [...beat.script], beat.expectsReply)))).flat();
  return cueEveryWords ? repeated.map((beat) => addCueEveryWords(beat, cueEveryWords)) : repeated;
}

export const STOCK_PHRASE = 'Let me work that out.';

export const STOCK_TURN: readonly Beat[] = [makeBeat('stock', [{ kind: 'text', id: 'working', text: 'Working it out' }, 'Let me ', { kind: 'focus', target: 'working' }, 'work that out.'])];

export const OVERLONG_LINE = 'Nine point eight metres per second squared.';
