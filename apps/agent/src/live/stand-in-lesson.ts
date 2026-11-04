import { type Beat, parseBeat } from '@astra/contracts';

const BALL = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 } } };

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}

/** A long line with something moving, so a stop can be seen on the board. */
export const LESSON: readonly Beat[] = [
  makeBeat('flight', [BALL, 'Watch the ball. ', { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 20 }, 'It leaves your hand, it climbs slower and slower, it hangs at the very top, and then it falls back down.']),
  makeBeat('question', ['Once it leaves your hand, what still pushes it sideways?'], true),
];
