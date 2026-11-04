import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalYield } from './localYield';
import type { OutputLevel } from '@astra/board';

function makeYield() {
  const levels: OutputLevel[] = [];
  const localYield = createLocalYield({ setLevel: (level) => levels.push(level) });
  return { levels, localYield };
}

describe('the local yield', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('lowers the voice at once on the student\'s first sound', () => {
    const { levels, localYield } = makeYield();
    localYield.noteLevel('full');
    localYield.onStudentSound();
    expect(levels).toEqual(['lowered']);
  });

  it('brings the voice back if the agent heard no voice in that sound', () => {
    const { levels, localYield } = makeYield();
    localYield.noteLevel('full');
    localYield.onStudentSound();
    vi.advanceTimersByTime(2000);
    expect(levels).toEqual(['lowered', 'full']);
  });

  it('leaves the voice lowered once the agent has agreed', () => {
    const { levels, localYield } = makeYield();
    localYield.noteLevel('full');
    localYield.onStudentSound();
    localYield.noteAgentYield(true);
    vi.advanceTimersByTime(2000);
    expect(levels).toEqual(['lowered']);
  });

  it('never opens a stopped turn, because a stop must stay silent', () => {
    const { levels, localYield } = makeYield();
    localYield.noteLevel('silent');
    localYield.onStudentSound();
    vi.advanceTimersByTime(2000);
    expect(levels).toEqual([]);
  });

  it('does not raise a voice that a stop cut during the wait', () => {
    const { levels, localYield } = makeYield();
    localYield.noteLevel('full');
    localYield.onStudentSound();
    localYield.noteLevel('silent');
    vi.advanceTimersByTime(2000);
    expect(levels).toEqual(['lowered']);
  });
});
