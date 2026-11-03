import { describe, expect, it } from 'vitest';
import {
  BEAT_LIMITS,
  COMMAND_MAX_BYTES,
  getCues,
  getPlayedCues,
  LIVE_MESSAGE_MAX_BYTES,
  parseAgentMessage,
  parseBeat,
  parseBrowserMessage,
  parseSceneCommand,
  parseSessionEvent,
  parseWrittenBeat,
} from '../src/index.ts';
import { expectRefused, getJsonBytes, makeBeat, withCommand, withoutField } from './helpers.ts';
import { SAMPLE_SESSION_EVENTS } from './sample-session.ts';

const INTERRUPTED = SAMPLE_SESSION_EVENTS.find((event) => (event as { ending?: string }).ending === 'interrupted') as Record<string, unknown>;
const FROZEN_SHOT = { target: 'shot', simulationSeconds: 0.71 };
const PLAYED = { type: 'played', turnId: 't3', beatId: 'b6', startedMsAgo: 710, wordStartsMs: [0, 320, 560], durationMs: 710, playedWords: 3, firedCues: 2, ending: 'interrupted', frozen: [FROZEN_SHOT] };
const BOARD_FROZEN = { type: 'boardFrozen', turnId: 't3', frozen: [FROZEN_SHOT] };
const STORED_BOARD_FROZEN = { seq: 3, atMs: 900, kind: 'boardFrozen', turnId: 't3', frozen: [FROZEN_SHOT] };
const LONGEST_NUMBER = 0.12345678901234568;

function makeFrozenList(length: number) {
  return Array.from({ length }, (_, index) => ({ target: `sim-${index}`, simulationSeconds: 1 }));
}

function makeStudentActed(action: unknown) {
  return { seq: 1, atMs: 0, kind: 'studentActed', action };
}

describe('parseSessionEvent', () => {
  it.each<[string, unknown, RegExp]>([
    ['an unknown kind', { seq: 1, atMs: 0, kind: 'tutorThought' }, /event\.kind: expected one of/],
    ['a negative sequence number', { seq: -1, atMs: 0, kind: 'connectionGap', durationMs: 900 }, /seq: expected a whole number/],
    ['no time', { seq: 1, kind: 'connectionGap', durationMs: 900 }, /atMs: expected a whole number/],
    ['more words played than it has word times', { ...INTERRUPTED, playedWords: 4 }, /playedWords: expected no more words/],
    ['more word times than the beat has words', { ...INTERRUPTED, wordStartsMs: [0, 100, 200, 300] }, /wordStartsMs: expected no more than the beat's 3 words/],
    ['word times out of order', { ...INTERRUPTED, wordStartsMs: [0, 560, 320] }, /wordStartsMs: expected times in order/],
    ['audio that stops before the last word', { ...INTERRUPTED, durationMs: 100 }, /durationMs: expected the audio to reach/],
    ['a finished beat that did not play every word', { ...INTERRUPTED, ending: 'finished', wordStartsMs: [0, 320], playedWords: 2 }, /playedWords: expected all 3 words/],
    ['a sequence number too big to be exact', { seq: 1e308, atMs: 0, kind: 'connectionGap', durationMs: 900 }, /seq: expected a whole number/],
    ['a NUL in what the student said', { seq: 1, atMs: 0, kind: 'studentSpoke', text: 'a\u0000', source: 'voice', isReaction: false, durationMs: 1 }, /text: expected text with no NUL/],
    ['a field from another event kind', { ...INTERRUPTED, text: 'hello' }, /text: unknown field/],
    ['an unknown slider value', makeStudentActed({ action: 'sliderDragged', target: 'shot', parameter: 'spin', samples: [] }), /parameter: expected one of/],
  ])('rejects %s', (_name, input, reason) => {
    expectRefused(parseSessionEvent(input), reason);
  });
});

describe('firedCues', () => {
  it('is required on a stored beat', () => {
    expectRefused(parseSessionEvent(withoutField(INTERRUPTED, 'firedCues')), /firedCues: expected a whole number/);
  });

  it('can equal the beat cue count', () => {
    expect(parseSessionEvent({ ...INTERRUPTED, firedCues: 2 }).ok).toBe(true);
  });

  it('cannot pass the beat cue count', () => {
    expectRefused(parseSessionEvent({ ...INTERRUPTED, firedCues: 3 }), /firedCues: expected no more than the beat's 2 cues/);
  });

  it('leaves a late cue out of what played, though its word did play', () => {
    const parsed = parseSessionEvent({ ...INTERRUPTED, firedCues: 1 });
    if (!parsed.ok || parsed.value.kind !== 'beatPlayed') throw new Error('expected a played beat');
    const { beat, playedWords, firedCues } = parsed.value;
    const lateCue = getCues(beat)[1];
    expect(lateCue?.atWord).toBeLessThan(playedWords);
    expect(getPlayedCues(beat, firedCues).map((cue) => cue.command.kind)).toEqual(['runSimulation']);
  });

  it('is required on what the browser reports, and fits any beat', () => {
    expectRefused(parseBrowserMessage(withoutField(PLAYED, 'firedCues')), /firedCues: expected a whole number/);
    expect(parseBrowserMessage({ ...PLAYED, firedCues: BEAT_LIMITS.commands }).ok).toBe(true);
    expectRefused(parseBrowserMessage({ ...PLAYED, firedCues: BEAT_LIMITS.commands + 1 }), /firedCues: expected at most 12 cues/);
  });
});

describe('boardFrozen', () => {
  it('is accepted as a stored event and as a browser message', () => {
    expect(parseSessionEvent(STORED_BOARD_FROZEN)).toEqual({ ok: true, value: STORED_BOARD_FROZEN });
    expect(parseBrowserMessage(BOARD_FROZEN)).toEqual({ ok: true, value: BOARD_FROZEN });
  });

  it('is not something the agent sends', () => {
    expectRefused(parseAgentMessage(BOARD_FROZEN), /type: expected one of/);
  });

  it.each<[string, unknown, RegExp]>([
    ['no turn', { type: 'boardFrozen', frozen: [] }, /turnId: expected a turn id/],
    ['no frozen list', { type: 'boardFrozen', turnId: 't3' }, /frozen: expected a list/],
    ['a bad frozen entry', { ...BOARD_FROZEN, frozen: [{ target: 'shot' }] }, /simulationSeconds: expected a finite number/],
    ['a stray field', { ...BOARD_FROZEN, beat: {} }, /beat: unknown field/],
  ])('refuses a message with %s', (_name, message, reason) => {
    expectRefused(parseBrowserMessage(message), reason);
  });

  it('refuses a stored event with no time', () => {
    expectRefused(parseSessionEvent(withoutField(STORED_BOARD_FROZEN, 'atMs')), /atMs: expected a whole number/);
  });

  it('holds 32 frozen simulations and no more', () => {
    expect(parseBrowserMessage({ ...BOARD_FROZEN, frozen: makeFrozenList(32) }).ok).toBe(true);
    expectRefused(parseBrowserMessage({ ...BOARD_FROZEN, frozen: makeFrozenList(33) }), /frozen: expected at most 32 items/);
    expectRefused(parseSessionEvent({ ...INTERRUPTED, frozen: makeFrozenList(33) }), /frozen: expected at most 32 items/);
  });
});

describe('student work', () => {
  const STROKE = { action: 'inkStroke', id: 'ink-1', points: [[0, 0, 0], [0.5, 0.25, 16], [1, 1, 32]] };

  it('accepts ink in fractions of the board, erased ink, and a shared file', () => {
    for (const action of [STROKE, { action: 'inkErased', target: 'ink-1' }, { action: 'fileShared', fileId: 'file-1', name: 'worksheet.pdf' }]) {
      expect(parseSessionEvent(makeStudentActed(action))).toEqual({ ok: true, value: makeStudentActed(action) });
      expect(parseBrowserMessage({ type: 'acted', action })).toEqual({ ok: true, value: { type: 'acted', action } });
    }
  });

  it.each<[string, unknown, RegExp]>([
    ['no id on a stroke', { action: 'inkStroke', points: [] }, /\.id: expected an element id/],
    ['a stroke in pixels', { ...STROKE, points: [[120, 40, 0]] }, /points\[0\]\[0\]: expected a fraction from 0 to 1/],
    ['a y past the panel', { ...STROKE, points: [[0, 1.5, 0]] }, /points\[0\]\[1\]: expected a fraction from 0 to 1/],
    ['a negative x', { ...STROKE, points: [[-0.1, 0, 0]] }, /points\[0\]\[0\]: expected a fraction from 0 to 1/],
    ['a point with no time', { ...STROKE, points: [[0, 0]] }, /points\[0\]: expected x, y, and afterMs/],
    ['a point with too many values', { ...STROKE, points: [[0, 0, 0, 0]] }, /points\[0\]: expected at most 3 items/],
    ['a time before the event', { ...STROKE, points: [[0, 0, -1]] }, /points\[0\]\[2\]: expected a whole number/],
    ['more points than one action holds', { ...STROKE, points: Array.from({ length: 301 }, () => [0, 0, 0]) }, /points: expected at most 300 items/],
    ['more samples than one action holds', { action: 'sliderDragged', target: 'shot', parameter: 'gravity', samples: Array.from({ length: 301 }, () => ({ afterMs: 0, value: 1 })) }, /samples: expected at most 300 items/],
    ['no target on an erase', { action: 'inkErased' }, /target: expected an element id/],
    ['a stray field on an erase', { action: 'inkErased', target: 'ink-1', points: [] }, /points: unknown field/],
    ['a path as a file id', { action: 'fileShared', fileId: '../../../secret', name: 'a.pdf' }, /fileId: expected a file id/],
    ['an inherited action', { action: 'toString' }, /action: expected one of/],
  ])('refuses %s', (_name, action, reason) => {
    expectRefused(parseSessionEvent(makeStudentActed(action)), reason);
  });
});

describe('the messages between the agent and the browser', () => {
  const words = [{ text: 'Watch', startMs: 0 }, { text: 'this', startMs: 320 }];

  it.each([
    [{ type: 'turnStarted', turnId: 't3' }],
    [{ type: 'cue', turnId: 't3', beatId: 'b6', atWord: 1, command: { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 3 } }],
    [{ type: 'words', turnId: 't3', beatId: 'b6', firstWord: 0, words }],
    [{ type: 'beatClosed', turnId: 't3', beatId: 'b6', wordCount: 3 }],
    [{ type: 'yield', turnId: 't3', isYielding: true }],
    [{ type: 'stop', turnId: 't3' }],
  ])('accepts an agent message %#', (message) => {
    expect(parseAgentMessage(message)).toEqual({ ok: true, value: message });
  });

  it.each<[string, unknown, RegExp]>([
    ['an unknown type', { type: 'dance', turnId: 't3' }, /type: expected one of/],
    ['a bad command in a cue', { type: 'cue', turnId: 't3', beatId: 'b6', atWord: 1, command: { kind: 'playVideo' } }, /command\.kind: expected one of/],
    ['a word with no time', { type: 'words', turnId: 't3', beatId: 'b6', firstWord: 0, words: [{ text: 'Watch' }] }, /startMs: expected a whole number/],
    ['a missing turn', { type: 'stop' }, /turnId: expected a turn id/],
  ])('rejects an agent message with %s', (_name, message, reason) => {
    expectRefused(parseAgentMessage(message), reason);
  });

  it('accepts what the browser reports', () => {
    expect(parseBrowserMessage(PLAYED)).toEqual({ ok: true, value: PLAYED });
    const acted = { type: 'acted', action: { action: 'rewound', toBeat: 'b5' } };
    expect(parseBrowserMessage(acted)).toEqual({ ok: true, value: acted });
  });

  it.each<[string, unknown, RegExp]>([
    ['more words played than timed', { ...PLAYED, playedWords: 4 }, /playedWords: expected no more words/],
    ['an agent-only field', { ...PLAYED, reportedBy: 'browser' }, /reportedBy: unknown field/],
    ['an unknown action', { type: 'acted', action: { action: 'dance' } }, /action: expected one of/],
  ])('rejects a browser message with %s', (_name, message, reason) => {
    expectRefused(parseBrowserMessage(message), reason);
  });

  it('lets one timed word be as long as a beat, for languages with no spaces', () => {
    const longWord = { type: 'words', turnId: 't3', beatId: 'b6', firstWord: 0, words: [{ text: 'a'.repeat(BEAT_LIMITS.characters), startMs: 0 }] };
    expect(parseAgentMessage(longWord).ok).toBe(true);
    longWord.words[0] = { text: 'a'.repeat(BEAT_LIMITS.characters + 1), startMs: 0 };
    expectRefused(parseAgentMessage(longWord), /text: expected at most 600 characters/);
  });
});

describe('the size limits on the wire', () => {
  const WIDEST_CELL = '€'.repeat(80);
  const OVERSIZE_TABLE = {
    kind: 'table',
    id: 'values',
    columns: Array.from({ length: 8 }, () => WIDEST_CELL),
    rows: Array.from({ length: 12 }, () => Array.from({ length: 8 }, () => WIDEST_CELL)),
  };

  function makeDeepValue(depth: number): unknown {
    let value: unknown = 'x';
    for (let level = 0; level < depth; level += 1) value = [value];
    return value;
  }

  function makeWordsMessageOfBytes(totalBytes: number) {
    const words = Array.from({ length: 30 }, () => ({ text: 'a', startMs: 0 }));
    const message = { type: 'words', turnId: 't3', beatId: 'b6', firstWord: 0, words };
    let missingBytes = totalBytes - getJsonBytes(message);
    for (const word of words) {
      const addedBytes = Math.min(missingBytes, BEAT_LIMITS.characters - 1);
      word.text += 'a'.repeat(addedBytes);
      missingBytes -= addedBytes;
    }
    return message;
  }

  it('refuses the 70,359 byte stroke the verifiers built', () => {
    const points = Array.from({ length: 3100 }, (_, index) => [0.123456, 0.654321, index]);
    const message = { type: 'acted', action: { action: 'inkStroke', id: 'ink-1', points } };
    expect(getJsonBytes(message)).toBeGreaterThanOrEqual(70_359);
    expectRefused(parseBrowserMessage(message), /^message: expected at most 15360 bytes/);
  });

  it('refuses the 19,677 byte drag the verifiers built', () => {
    const samples = Array.from({ length: 600 }, (_, index) => ({ afterMs: index, value: 4.123456 }));
    const message = { type: 'acted', action: { action: 'sliderDragged', target: 'shot', parameter: 'horizontalSpeed', samples } };
    expect(getJsonBytes(message)).toBeGreaterThanOrEqual(19_677);
    expectRefused(parseBrowserMessage(message), /^message: expected at most 15360 bytes/);
  });

  it('accepts a message at the limit and refuses one byte more', () => {
    const atLimit = makeWordsMessageOfBytes(LIVE_MESSAGE_MAX_BYTES);
    const overLimit = makeWordsMessageOfBytes(LIVE_MESSAGE_MAX_BYTES + 1);
    expect(getJsonBytes(atLimit)).toBe(LIVE_MESSAGE_MAX_BYTES);
    expect(parseAgentMessage(atLimit).ok).toBe(true);
    expect(getJsonBytes(overLimit)).toBe(LIVE_MESSAGE_MAX_BYTES + 1);
    expectRefused(parseAgentMessage(overLimit), /^message: expected at most 15360 bytes/);
  });

  it('counts bytes, not characters', () => {
    const words = Array.from({ length: 20 }, () => ({ text: 'é'.repeat(500), startMs: 0 }));
    const message = { type: 'words', turnId: 't3', beatId: 'b6', firstWord: 0, words };
    expect(JSON.stringify(message).length).toBeLessThan(LIVE_MESSAGE_MAX_BYTES);
    expectRefused(parseAgentMessage(message), /^message: expected at most 15360 bytes/);
  });

  it('lets the largest normal student actions through at full number precision', () => {
    const points = Array.from({ length: 300 }, () => [LONGEST_NUMBER, LONGEST_NUMBER, 1_234_567]);
    const samples = Array.from({ length: 300 }, () => ({ afterMs: 1_234_567, value: LONGEST_NUMBER }));
    expect(parseBrowserMessage({ type: 'acted', action: { action: 'inkStroke', id: 'ink-1', points } }).ok).toBe(true);
    expect(parseBrowserMessage({ type: 'acted', action: { action: 'sliderDragged', target: 'shot', parameter: 'gravity', samples } }).ok).toBe(true);
  });

  it('keeps room for the cue wrapper around the largest command', () => {
    const longestId = 'x'.repeat(40);
    const wrapper = { type: 'cue', turnId: longestId, beatId: longestId, atWord: BEAT_LIMITS.words - 1, command: null };
    expect(getJsonBytes(wrapper) + COMMAND_MAX_BYTES).toBeLessThanOrEqual(LIVE_MESSAGE_MAX_BYTES);
  });

  it('refuses an oversize command in every reader that holds one', () => {
    const tooBig = new RegExp(`expected at most ${COMMAND_MAX_BYTES} bytes`);
    expect(getJsonBytes(OVERSIZE_TABLE)).toBeGreaterThan(COMMAND_MAX_BYTES);
    expect(getJsonBytes(OVERSIZE_TABLE)).toBeLessThan(LIVE_MESSAGE_MAX_BYTES * 2);
    expectRefused(parseSceneCommand(OVERSIZE_TABLE), tooBig);
    expectRefused(parseBeat(withCommand(OVERSIZE_TABLE)), tooBig);
  });

  it('accepts a command just under its limit in a cue', () => {
    const command = { kind: 'code', id: 'snippet', language: 'python', source: 'x'.repeat(2000) };
    expect(parseAgentMessage({ type: 'cue', turnId: 't3', beatId: 'b6', atWord: 0, command }).ok).toBe(true);
  });

  it('drops an oversize written command and keeps the words', () => {
    const written = parseWrittenBeat(makeBeat({ script: ['Watch ', OVERSIZE_TABLE, 'this.'] }));
    expect(written.ok && written.value.beat.script).toEqual(['Watch ', 'this.']);
    expect(written.ok && written.value.droppedCommandProblems).toEqual([`beat.script[1]: expected at most ${COMMAND_MAX_BYTES} bytes of JSON`]);
  });

  it('refuses a value nested too deep to measure, rather than throwing', () => {
    const deep = makeDeepValue(200_000);
    expectRefused(parseBrowserMessage({ type: 'acted', action: deep }), /^message: expected at most 15360 bytes/);
    expectRefused(parseAgentMessage({ type: 'stop', turnId: deep }), /^message: expected at most 15360 bytes/);
    expectRefused(parseSceneCommand(deep), /^command: expected at most/);
  });

  it('does not apply the wire limit to a stored event', () => {
    const largeSource = '€'.repeat(2000);
    const script = ['Watch ', ...Array.from({ length: 12 }, (_, index) => ({ kind: 'code', id: `code-${index}`, language: 'python', source: largeSource })), 'this.'];
    const stored = { seq: 1, atMs: 0, kind: 'beatPlayed', turnId: 't1', beat: makeBeat({ script }), wordStartsMs: [0, 100], durationMs: 200, playedWords: 2, firedCues: 12, ending: 'finished', frozen: [], reportedBy: 'browser' };
    expect(getJsonBytes(stored)).toBeGreaterThan(LIVE_MESSAGE_MAX_BYTES);
    expect(parseSessionEvent(stored).ok).toBe(true);
  });
});
