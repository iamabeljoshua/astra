import { describe, expect, it } from 'vitest';
import { isLessonDone, type WatchedMoment } from '../src/scenes/proof/lesson-watch.ts';

const at = (atS: number, fields: Partial<WatchedMoment> = {}): WatchedMoment => ({ atS, closedBeats: [], hasScene: false, ...fields });

describe('how long a proof watches a lesson', () => {
  it('does not stop at a question in the middle of the lesson', () => {
    expect(isLessonDone([at(1), at(10)])).toBe(false);
  });

  it('keeps watching after the close, because a scene can land for 20 s after it', () => {
    expect(isLessonDone([at(30, { closedBeats: ['close'] }), at(34, { closedBeats: ['close'] })])).toBe(false);
    expect(isLessonDone([at(30, { closedBeats: ['close'] }), at(49, { closedBeats: ['close'] })])).toBe(false);
  });

  it('sees a scene landing after the close, and stops once the question has come back', () => {
    const moments = [at(30, { closedBeats: ['close'] }), at(38, { closedBeats: ['close'], hasScene: true })];
    expect(isLessonDone(moments)).toBe(false);
    expect(isLessonDone([...moments, at(55, { closedBeats: ['close', 'close-again'], hasScene: true })])).toBe(true);
  });

  it('stops when no scene came and the window has passed', () => {
    expect(isLessonDone([at(30, { closedBeats: ['close'] }), at(56, { closedBeats: ['close'] })])).toBe(true);
  });

  it('stops soon after the close when the scene was shown before it', () => {
    expect(isLessonDone([at(10, { hasScene: true }), at(30, { closedBeats: ['close'], hasScene: true }), at(30.5, { closedBeats: ['close'], hasScene: true })])).toBe(false);
    expect(isLessonDone([at(10, { hasScene: true }), at(30, { closedBeats: ['close'], hasScene: true }), at(33, { closedBeats: ['close'], hasScene: true })])).toBe(true);
  });
});
