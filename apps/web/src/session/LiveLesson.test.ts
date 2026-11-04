import { describe, expect, it } from 'vitest';
import { SESSION_LABELS } from '../strings';
import { getOpeningMessage } from './LiveLesson';

describe('what a new lesson opens with', () => {
  it('sends a typed question as it stands', () => {
    expect(getOpeningMessage({ title: 'Why is the sky blue?', subject: SESSION_LABELS.questionSubject, durationSeconds: 0 })).toBe('Why is the sky blue?');
  });

  it('asks about a topic chosen from a card', () => {
    expect(getOpeningMessage({ title: 'Saturn’s rings', subject: 'Physics', durationSeconds: 0 })).toBe("I'd like to learn about Saturn’s rings.");
  });

  it('asks nothing when a student comes back to a session', () => {
    expect(getOpeningMessage({ title: 'Why is the sky blue?', subject: SESSION_LABELS.questionSubject, durationSeconds: 90 })).toBeNull();
  });
});
