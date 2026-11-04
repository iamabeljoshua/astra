import { type Beat, parseBeat } from '@astra/contracts';
import type { TutorBrain } from '../tutor/brain.ts';
import { LESSON } from './stand-in-lesson.ts';

export type { TutorBrain } from '../tutor/brain.ts';

const MOST_ECHOED_WORDS = 12;
const ASKS_FOR_THE_LESSON = /\b(ball|shot|show|explain|lesson)\b/i;

function makeBeat(id: string, script: readonly unknown[], expectsReply = false): Beat[] {
  const parsed = parseBeat({ id, script, expectsReply });
  return parsed.ok ? [parsed.value] : [];
}

function getEchoedWords(text: string): string {
  const words = text.replace(/[^\p{L}\p{N}\s'.,?-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, MOST_ECHOED_WORDS).join(' ').replace(/[.?!,]+$/, '');
}

// It only repeats simple lines, so voice, captions, interruption, and the board can be proven before a model is in the path. Asking for the ball gets a long line with motion, to interrupt.
export function createStandInTutor(): TutorBrain {
  let replyCount = 0;
  return {
    async *reply({ text }, signal) {
      replyCount += 1;
      const lessonBeats = ASKS_FOR_THE_LESSON.test(text) ? LESSON : [];
      const echoed = getEchoedWords(text);
      const beats = [...makeBeat(`reply-${replyCount}-echo`, [`You said ${echoed}.`]), ...lessonBeats.map((beat) => ({ ...beat, id: `reply-${replyCount}-${beat.id}` as Beat['id'] }))];
      for (const beat of beats) {
        if (signal.aborted) return;
        yield beat;
      }
    },
  };
}
