import { describe, expect, it } from 'vitest';
import { SESSION_LABELS } from '../strings';
import { getOpeningMessage } from './SessionScreen';

describe('what a new lesson opens with', () => {
  it('sends a typed question as it stands', () => {
    expect(getOpeningMessage({ title: 'Why is the sky blue?', subject: SESSION_LABELS.questionSubject, durationSeconds: 0 })).toBe('Why is the sky blue?');
  });

  it('asks about a topic chosen from a card', () => {
    expect(getOpeningMessage({ title: 'Saturn’s rings', subject: 'Physics', durationSeconds: 0 })).toBe("I'd like to learn about Saturn’s rings.");
  });

  it('picks the topic back up when a student comes back to a session, so the tutor speaks first there too', () => {
    expect(getOpeningMessage({ title: 'Why is the sky blue?', subject: SESSION_LABELS.questionSubject, durationSeconds: 90 })).toBe("I'm back to carry on with this: Why is the sky blue?");
  });
});
