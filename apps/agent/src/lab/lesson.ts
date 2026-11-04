import { type Beat, parseBeat } from '@astra/contracts';

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

export const STOCK_PHRASE = 'Let me work that out.';

export const STOCK_TURN: readonly Beat[] = [makeBeat('stock', [{ kind: 'text', id: 'working', text: 'Working it out' }, 'Let me ', { kind: 'focus', target: 'working' }, 'work that out.'])];

export const OVERLONG_LINE = 'Nine point eight metres per second squared.';
