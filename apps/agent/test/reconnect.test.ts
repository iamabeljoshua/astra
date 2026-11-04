import { type Beat, getBeatText, getCues, parseBeat, type PlayReport } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { getResumeBeats } from '../src/live/resume-plan.ts';

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

const FIRST = makeBeat('first', ['One two ', { kind: 'text', id: 'a', text: 'a' }, 'three four ', { kind: 'text', id: 'b', text: 'b' }, 'five six.']);
const SECOND = makeBeat('second', [{ kind: 'text', id: 'c', text: 'c' }, 'Seven eight nine?'], true);

const report = (playedWords: number, firedCues: number, ending: PlayReport['ending'] = 'interrupted'): PlayReport => ({ wordStartsMs: [], durationMs: 0, playedWords, firedCueMs: Array.from({ length: firedCues }, () => 0), ending, frozen: [] });

describe('getResumeBeats', () => {
  it('starts on the word it was cut on, and fires no cue twice', () => {
    const [resumed, next] = getResumeBeats({ beats: [FIRST, SECOND], reports: new Map([[FIRST.id, report(3, 1)]]), wordsSent: new Map(), resumeTag: 'r1' });
    expect(getBeatText(resumed as Beat)).toBe('three four five six.');
    expect(getCues(resumed as Beat).map((cue) => cue.command.kind === 'text' && cue.command.id)).toEqual(['b']);
    expect(next).toBe(SECOND);
  });

  it('skips a beat the browser heard to its end', () => {
    expect(getResumeBeats({ beats: [FIRST, SECOND], reports: new Map([[FIRST.id, report(6, 2, 'finished')]]), wordsSent: new Map(), resumeTag: 'r1' })).toEqual([SECOND]);
  });

  it('does not fire a beat again when its report has not landed, and works from the words the agent sent', () => {
    const [resumed] = getResumeBeats({ beats: [FIRST, SECOND], reports: new Map(), wordsSent: new Map([[FIRST.id, 4]]), resumeTag: 'r1' });
    expect(getBeatText(resumed as Beat)).toBe('four five six.');
    expect(getCues(resumed as Beat)).toHaveLength(1);
    expect((resumed as Beat).id).not.toBe(FIRST.id);
  });

  it('sends a beat whole when none of it was sent', () => {
    expect(getResumeBeats({ beats: [SECOND], reports: new Map(), wordsSent: new Map(), resumeTag: 'r1' })).toEqual([SECOND]);
  });

  it('keeps a resume within the command limit, because the parser would refuse the beat and lose its words', () => {
    const crowded = makeBeat('crowded', [...Array.from({ length: 12 }, (_, index) => ({ kind: 'text', id: `n${index}`, text: 'n' })), 'One two three.']);
    const cut = report(1, 0);
    const frozen = [{ target: 'shot', simulationSeconds: 1 }] as unknown as PlayReport['frozen'];
    const beats = getResumeBeats({ beats: [crowded], reports: new Map([[crowded.id, { ...cut, frozen }]]), wordsSent: new Map(), resumeTag: 'r1' });
    expect(beats.map(getBeatText).join(' ')).toBe('One two three.');
    expect(beats.flatMap(getCues).length).toBe(13);
  });

  it('says nothing for a beat with no words left', () => {
    expect(getResumeBeats({ beats: [SECOND], reports: new Map([[SECOND.id, report(4, 1)]]), wordsSent: new Map(), resumeTag: 'r1' })).toEqual([]);
  });
});
