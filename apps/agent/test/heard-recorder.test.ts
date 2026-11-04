import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AudioFrame } from '@livekit/rtc-node';
import { type Beat, parseBeat, type TurnId } from '@astra/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createHeardRecorder } from '../src/live/heard-recorder.ts';

const folders: string[] = [];
const makeFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'astra-heard-'));
  folders.push(folder);
  return folder;
};

const parsed = parseBeat({ id: 'b1', script: [{ kind: 'text', id: 'n', text: 'note' }, 'Look at this.'], expectsReply: false });
if (!parsed.ok) throw new Error(parsed.problem);
const beat: Beat = parsed.value;

describe('saving what the tutor sent out', () => {
  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  it('saves the text, what the page was told, and a wav named by session and turn', () => {
    const folder = makeFolder();
    const turn = createHeardRecorder(folder, 'session-1')({ turnId: 't1' as TurnId, kind: 'reply' });
    turn.addBeat(beat);
    turn.addMessage({ type: 'turnStarted', turnId: 't1' as TurnId });
    turn.addFrame({ data: new Int16Array([1, -2, 3]), sampleRate: 24000 } as unknown as AudioFrame);
    turn.finish([{ ours: 'this.', theirs: 'that.' }]);
    const saved = JSON.parse(readFileSync(join(folder, 'session-1-t1.json'), 'utf8')) as Record<string, unknown>;
    expect(saved).toMatchObject({ kind: 'reply', beats: [{ sentToVoice: 'Look at this.', commands: ['text'] }], wordMismatches: [{ ours: 'this.', theirs: 'that.' }], messages: [{ type: 'turnStarted' }] });
    const wav = readFileSync(join(folder, 'session-1-t1.wav'));
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(6);
    expect(wav.readInt16LE(46)).toBe(-2);
  });
});
