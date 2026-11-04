import { describe, expect, it } from 'vitest';
import { getPickReason } from './getPickReason';

const REASON = 'You got stuck on free-body diagrams';
const THURSDAY_NOON = new Date(2026, 10, 5, 12);

function getReasonNotedAt(notedAt: Date, now = THURSDAY_NOON) {
  return getPickReason({ reason: REASON, reasonDate: notedAt.toISOString() }, now);
}

describe('the reason on a card', () => {
  it('stays as it came when it names no day', () => {
    expect(getPickReason({ reason: 'Often taught in high school', reasonDate: null }, THURSDAY_NOON)).toBe('Often taught in high school');
  });

  it.each([
    ['earlier today', new Date(2026, 10, 5, 9), `${REASON} today`],
    ['last night', new Date(2026, 10, 4, 23, 30), `${REASON} yesterday`],
    ['two days back', new Date(2026, 10, 3, 12), `${REASON} on Tuesday`],
    ['six days back', new Date(2026, 9, 30, 12), `${REASON} on Friday`],
    ['a week back, when a weekday would point at the wrong one', new Date(2026, 9, 29, 12), `${REASON} on 29 October`],
  ])('names the day for a note from %s', (_when, notedAt, expected) => {
    expect(getReasonNotedAt(notedAt)).toBe(expected);
  });

  it('counts days by the student\'s own midnight, not by hours passed', () => {
    expect(getReasonNotedAt(new Date(2026, 10, 3, 23, 50), new Date(2026, 10, 4, 0, 10))).toBe(`${REASON} yesterday`);
  });

  it('never says a day in the future when a clock is behind', () => {
    expect(getReasonNotedAt(new Date(2026, 10, 6, 1), THURSDAY_NOON)).toBe(`${REASON} today`);
  });
});
