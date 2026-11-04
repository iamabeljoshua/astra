import { describe, expect, it } from 'vitest';
import { BOARD_WORK_LABELS } from '../strings';
import type { LiveVoiceView } from './liveVoice';
import { getTutorState } from './tutorState';

const { tutorState: labels } = BOARD_WORK_LABELS;
const quiet = { phase: 'live', closedBecause: null, isTutorSpeaking: false, isThinking: false, isStopped: false, tutorHeard: [], tutorComing: [] } as unknown as LiveVoiceView;
const after = (changes: Partial<LiveVoiceView>) => ({ ...quiet, ...changes });

describe('what the top of the page says the tutor is doing', () => {
  it.each([
    ['ready before anything is said', quiet, false, labels.ready],
    ['talking', after({ isTutorSpeaking: true }), false, labels.talking],
    ['reading while it thinks', after({ isThinking: true }), false, labels.reading],
    ['stopped after Esc', after({ isStopped: true, tutorHeard: ['Well'] }), false, labels.stopped],
    ['waiting on a task', after({ tutorHeard: ['Go', 'on.'] }), true, labels.waiting],
    ['waiting on a question', after({ tutorHeard: ['Why?'] }), false, labels.waiting],
    ['watching otherwise', after({ tutorHeard: ['Good.'] }), false, labels.watching],
  ])('says %s', (_name, view, hasOpenTask, label) => {
    expect(getTutorState(view, hasOpenTask)).toBe(label);
  });

  it('says nothing once the room is over', () => {
    expect(getTutorState(after({ phase: 'ended' }), false)).toBeNull();
    expect(getTutorState(after({ closedBecause: 'sessionLimit' }), false)).toBeNull();
  });
});
