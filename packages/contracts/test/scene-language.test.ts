import { describe, expect, it } from 'vitest';
import {
  BEAT_LIMITS,
  getBeatText,
  type FrozenFrame,
  getCues,
  getPlayedCues,
  getResumeScript,
  getScriptFromWord,
  getScriptText,
  getSpokenWords,
  parseBeat,
  parseBrowserMessage,
  parseSceneCommand,
  parseSessionEvent,
  parseWrittenBeat,
  SCENE_COMMAND_KINDS,
} from '../src/index.ts';
import { expectRefused, makeBeat, ONE_OF_EACH_COMMAND, parseOrThrow, withCommand } from './helpers.ts';

const INVALID_BEATS: [string, unknown, RegExp][] = [
  ['not an object', 'Watch this arrow.', /^beat: expected an object/],
  ['a list', [], /^beat: expected an object/],
  ['null', null, /^beat: expected an object/],
  ['no words', makeBeat({ script: ['   '] }), /at least one spoken word/],
  ['only a command', makeBeat({ script: [{ kind: 'clearBoard' }] }), /at least one spoken word/],
  ['an empty script', makeBeat({ script: [] }), /at least one spoken word/],
  ['a zero-width space as its only word', makeBeat({ script: ['\u200B'] }), /at least one spoken word/],
  ['only punctuation', makeBeat({ script: ['... ?!'] }), /at least one spoken word/],
  ['a word made only of zero-width characters', makeBeat({ script: ['Watch \u200B\u200D this.'] }), /no word made only of zero-width characters/],
  ['a script that is not a list', makeBeat({ script: 'Watch this arrow.' }), /beat\.script: expected a list/],
  ['too many words', makeBeat({ script: [Array.from({ length: 61 }, () => 'word').join(' ')] }), /at most 60 words/],
  ['too much text', makeBeat({ script: ['a'.repeat(601)] }), /at most 600 characters/],
  ['too many parts', makeBeat({ script: Array.from({ length: 201 }, () => 'a') }), /at most 200 items/],
  ['too many commands', makeBeat({ script: ['Watch ', ...Array.from({ length: 13 }, () => ({ kind: 'clearBoard' }))] }), /at most 12 commands/],
  ['the same id created twice', makeBeat({ script: [{ kind: 'writeMath', id: 'a', tex: 'x' }, 'Watch ', { kind: 'writeMath', id: 'a', tex: 'y' }] }), /each id to be created once/],
  ['a NUL in the spoken text', makeBeat({ script: ['Watch\u0000 this.'] }), /no NUL or broken characters/],
  ['a broken character in the spoken text', makeBeat({ script: ['Watch \uD83D this.'] }), /no NUL or broken characters/],
  ['a handwritten flag that is not true or false', withCommand({ kind: 'text', id: 'note', text: 'x', handwritten: 'yes' }), /handwritten: expected true or false/],
  ['a NUL in a label', withCommand({ kind: 'text', id: 'note', text: 'a\u0000b' }), /text: expected text with no NUL/],
  ['a table row of the wrong length', withCommand({ kind: 'table', id: 'values', columns: ['x', 'y'], rows: [['1']] }), /rows: expected 2 cells/],
  ['no id', { script: ['Watch.'], expectsReply: false }, /beat\.id: expected a beat id/],
  ['a bad id', makeBeat({ id: 'Beat One' }), /beat\.id: expected a beat id/],
  ['no script', { id: 'b1', expectsReply: false }, /beat\.script: expected a list/],
  ['no expectsReply', { id: 'b1', script: ['Watch.'] }, /expectsReply: expected true or false/],
  ['an unknown field', makeBeat({ volume: 11 }), /volume: unknown field/],
  ['the old counted cue list', makeBeat({ cues: [{ atWord: 0, command: { kind: 'clearBoard' } }] }), /cues: unknown field/],
  ['an inherited key from JSON', JSON.parse('{"id":"b1","script":["Watch."],"expectsReply":false,"__proto__":{"x":1}}'), /__proto__: unknown field/],
  ['a number in the script', makeBeat({ script: ['Watch ', 7] }), /script\[1\]\.kind: expected one of/],
  ['a null in the script', makeBeat({ script: ['Watch ', null] }), /script\[1\]\.kind: expected one of/],
  ['an unknown command', withCommand({ kind: 'playVideo', id: 'clip', url: 'https://example.com' }), /kind: expected one of/],
  ['a pixel position', withCommand({ kind: 'writeMath', id: 'equation', tex: 'x', x: 120, y: 40 }), /\.x: unknown field/],
  ['an element id with capitals', withCommand({ kind: 'writeMath', id: 'Equation', tex: 'x' }), /\.id: expected an element id/],
  ['a target that is a whole path', withCommand({ kind: 'focus', target: 'a.b.c' }), /target: expected an element reference/],
  ['empty math', withCommand({ kind: 'writeMath', id: 'equation', tex: '' }), /tex: expected text/],
  ['very long math', withCommand({ kind: 'writeMath', id: 'equation', tex: 'x'.repeat(501) }), /tex: expected at most 500 characters/],
  ['a backwards domain', withCommand({ kind: 'plot', id: 'curve', expression: 'x', domain: [2, -2] }), /domain: expected a low and a high number/],
  ['an infinite number', withCommand({ kind: 'markValue', id: 'mark', target: 'line', at: Number.POSITIVE_INFINITY }), /\.at: expected a finite number/],
  ['a number written as text', withCommand({ kind: 'markValue', id: 'mark', target: 'line', at: '4' }), /\.at: expected a finite number/],
  ['a drawing we do not have', withCommand({ kind: 'drawing', id: 'court', name: 'minecraft-sword' }), /\.name: expected one of hoop-side/],
  ['an image outside our set', withCommand({ kind: 'image', id: 'painting', asset: 'https://example.com/a.png', alt: 'x' }), /asset: expected one of great-wave/],
  ['a missing simulation value', withCommand({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4 } } }), /upwardSpeed: expected a finite number/],
  ['an unknown simulation value', withCommand({ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 2, gravity: 9.81, spin: 3 } } }), /spin: unknown field/],
  ['an unknown simulation model', withCommand({ kind: 'simulate', id: 'shot', simulation: { model: 'pendulum', parameters: {} } }), /model: expected one of projectile/],
  ['a table too long to fit', withCommand({ kind: 'table', id: 'values', columns: ['x'], rows: Array.from({ length: 13 }, () => ['1']) }), /rows: expected at most 12 items/],
  ['a slider that runs backwards', withCommand({ kind: 'slider', id: 'speed', target: 'shot', parameter: 'horizontalSpeed', min: 12, max: 0 }), /\.max: expected a number above min/],
  ['a geometry step of the wrong shape', withCommand({ kind: 'construct', id: 'step', target: 'figure', step: { shape: 'point', from: 'A', to: 'B' } }), /step\.from: unknown field/],
];

describe('parseBeat', () => {
  it.each(SCENE_COMMAND_KINDS)('accepts a %s cue and returns it unchanged', (kind) => {
    const input = withCommand(ONE_OF_EACH_COMMAND[kind]);
    expect(parseBeat(input)).toEqual({ ok: true, value: input });
  });

  it('keeps a beat identical through a JSON round trip', () => {
    const input = withCommand(ONE_OF_EACH_COMMAND.vector);
    const parsed = parseBeat(JSON.parse(JSON.stringify(input)));
    expect(parsed.ok && JSON.stringify(parsed.value)).toBe(JSON.stringify(input));
  });

  it.each(INVALID_BEATS)('rejects %s', (_name, input, reason) => {
    expectRefused(parseBeat(input), reason);
  });

  it('names where the problem is', () => {
    const parsed = parseBeat(withCommand({ kind: 'writeMath', id: 'Equation', tex: 'x' }));
    expect(parsed).toEqual({ ok: false, problem: 'beat.script[0].id: expected an element id' });
  });

  it('accepts a part name with capitals, such as a geometry point', () => {
    expect(parseBeat(withCommand({ kind: 'focus', target: 'figure.A' })).ok).toBe(true);
  });

  it.each([
    ['a number as its only word', '42'],
    ['a word in another script', 'नमस्ते'],
    ['a zero-width joiner inside a word', 'می\u200Cخواهم'],
  ])('accepts %s', (_name, words) => {
    expect(parseBeat(makeBeat({ script: [words] })).ok).toBe(true);
  });
});

describe('getCues', () => {
  const push = ONE_OF_EACH_COMMAND.vector;
  const fade = ONE_OF_EACH_COMMAND.hide;

  it('ties each command to the word written after it', () => {
    const beat = parseOrThrow(makeBeat({ script: ['Your ', push, 'hand, right up until it ', fade, 'lets go.'] }));
    expect(getCues(beat)).toEqual([
      { atWord: 1, command: push },
      { atWord: 6, command: fade },
    ]);
    expect(getBeatText(beat)).toBe('Your hand, right up until it lets go.');
  });

  it('ties a command before the first word to word 0, and one after the last word to the last word', () => {
    const beat = parseOrThrow(makeBeat({ script: [fade, 'Watch this.', push] }));
    expect(getCues(beat).map((cue) => cue.atWord)).toEqual([0, 1]);
  });

  it('ties a command after a trailing space to the last word, not to a word that does not exist', () => {
    const beat = parseOrThrow(makeBeat({ script: ['Watch this. ', fade] }));
    expect(getCues(beat).map((cue) => cue.atWord)).toEqual([1]);
  });

  it('ties a command written right after a word, then a space, to the next word', () => {
    const beat = parseOrThrow(makeBeat({ script: ['Your hand,', fade, ' right up.'] }));
    expect(getCues(beat).map((cue) => cue.atWord)).toEqual([2]);
  });

  it('ties a command in the middle of a word to that word', () => {
    const beat = parseOrThrow(makeBeat({ script: ['Watch this ar', fade, 'row now.'] }));
    expect(getSpokenWords(getBeatText(beat))).toEqual(['Watch', 'this', 'arrow', 'now.']);
    expect(getCues(beat).map((cue) => cue.atWord)).toEqual([2]);
  });

  it('gives the same result however the text was split while streaming', () => {
    const whole = parseOrThrow(makeBeat({ script: ['Your hand, right ', fade, 'up until it lets go.'] }));
    const pieces = parseOrThrow(makeBeat({ script: ['Your ', 'hand, ', 'right ', fade, 'up ', 'until it ', 'lets ', 'go.'] }));
    expect(getCues(pieces)).toEqual(getCues(whole));
    expect(getBeatText(pieces)).toBe(getBeatText(whole));
  });
});

describe('parseWrittenBeat keeps words that have already played', () => {
  const push = ONE_OF_EACH_COMMAND.vector;

  it('keeps the words and reports the command when one command is bad', () => {
    const written = parseWrittenBeat(makeBeat({ script: ['Watch ', { kind: 'playVideo' }, 'this ', push, 'arrow.'] }));
    expect(written.ok && written.value.beat.script).toEqual(['Watch ', 'this ', push, 'arrow.']);
    expect(written.ok && written.value.droppedCommandProblems).toEqual(['beat.script[1].kind: expected one of ' + SCENE_COMMAND_KINDS.join(', ')]);
  });

  it('refuses a beat with no words, because there is nothing to say', () => {
    expectRefused(parseWrittenBeat(makeBeat({ script: [push] })), /at least one spoken word/);
  });

  it('produces a beat the strict parser accepts', () => {
    const written = parseWrittenBeat(makeBeat({ script: ['Watch ', { kind: 'playVideo' }, 'this.'] }));
    expect(written.ok && parseBeat(written.value.beat).ok).toBe(true);
  });

  it('drops a command past the limit and reports it', () => {
    const script = ['Watch ', ...Array.from({ length: BEAT_LIMITS.commands + 1 }, () => ({ kind: 'clearBoard' }))];
    const written = parseWrittenBeat(makeBeat({ script }));
    expect(written.ok && getCues(written.value.beat).length).toBe(BEAT_LIMITS.commands);
    expect(written.ok && written.value.droppedCommandProblems).toEqual([`beat.script[${BEAT_LIMITS.commands + 1}]: expected no more than ${BEAT_LIMITS.commands} commands in a beat`]);
  });

  it('keeps the first of two commands with the same id', () => {
    const script = [{ kind: 'writeMath', id: 'a', tex: 'x' }, 'Watch ', { kind: 'writeMath', id: 'a', tex: 'y' }, 'this.'];
    const written = parseWrittenBeat(makeBeat({ script }));
    expect(written.ok && getCues(written.value.beat).map((cue) => cue.atWord)).toEqual([0]);
    expect(written.ok && written.value.droppedCommandProblems).toEqual(['beat.script[2].id: expected an id not yet created in this beat']);
  });

  it('never loses the words to a hostile command', () => {
    const script = ['Watch ', { kind: 'focus', target: 'constructor' }, { kind: 'writeMath', id: 'eq', tex: JSON.parse(String.raw`"\frac{1}{2}"`) }, 'this.'];
    const written = parseWrittenBeat(makeBeat({ script }));
    expect(written.ok && written.value.beat.script).toEqual(['Watch ', 'this.']);
    expect(written.ok && written.value.droppedCommandProblems).toHaveLength(2);
  });
});

describe('getPlayedCues', () => {
  const clear = { kind: 'clearBoard' };
  const beat = parseOrThrow(makeBeat({ script: [clear, 'Watch this ', clear, 'arrow ', clear, 'move.'] }));

  it('returns only as many cues as really fired, in script order', () => {
    expect(getPlayedCues(beat, 0)).toEqual([]);
    expect(getPlayedCues(beat, 2).map((cue) => cue.atWord)).toEqual([0, 2]);
  });

  it('keeps every cue when every cue fired', () => {
    expect(getPlayedCues(beat, 3).map((cue) => cue.atWord)).toEqual([0, 2, 3]);
  });
});

describe('getScriptFromWord', () => {
  const push = ONE_OF_EACH_COMMAND.vector;
  const fade = ONE_OF_EACH_COMMAND.hide;
  const beat = parseOrThrow(makeBeat({ script: ['Your ', push, 'hand, right up until it ', fade, 'lets go.'] }));

  it('keeps the words and drawings not yet played, and nothing else', () => {
    expect(getScriptFromWord(beat, { fromWord: 3, firedCues: 1 })).toEqual(['up until it ', fade, 'lets go.']);
  });

  it('keeps a drawing tied to the word it starts from', () => {
    expect(getScriptFromWord(beat, { fromWord: 1, firedCues: 0 })).toEqual([push, 'hand, right up until it ', fade, 'lets go.']);
  });

  it('keeps a late drawing that never fired, even though its word has played', () => {
    expect(getScriptFromWord(beat, { fromWord: 3, firedCues: 0 })).toEqual([push, 'up until it ', fade, 'lets go.']);
  });

  it('drops a drawing that already fired, even though its word has not played', () => {
    expect(getScriptFromWord(beat, { fromWord: 1, firedCues: 1 })).toEqual(['hand, right up until it ', fade, 'lets go.']);
  });

  it('joins the words around a dropped drawing into one part', () => {
    expect(getScriptFromWord(beat, { fromWord: 5, firedCues: 2 })).toEqual(['it lets go.']);
  });

  it('says exactly the words not yet played', () => {
    const rest = parseOrThrow(makeBeat({ script: getScriptFromWord(beat, { fromWord: 6, firedCues: 2 }) }));
    expect(getBeatText(rest)).toBe('lets go.');
  });

  it('returns nothing when every word has played and every drawing has fired', () => {
    expect(getScriptFromWord(beat, { fromWord: 8, firedCues: 2 })).toEqual([]);
  });

  it('does not repeat a drawing tied to the last word', () => {
    const trailing = parseOrThrow(makeBeat({ script: ['Watch this.', fade] }));
    expect(getScriptFromWord(trailing, { fromWord: 2, firedCues: 1 })).toEqual([]);
    expect(getScriptFromWord(trailing, { fromWord: 1, firedCues: 0 })).toEqual(['this.', fade]);
  });

  it('handles a command in the middle of a word', () => {
    const split = parseOrThrow(makeBeat({ script: ['Watch this ar', fade, 'row now.'] }));
    expect(getScriptFromWord(split, { fromWord: 2, firedCues: 0 })).toEqual(['ar', fade, 'row now.']);
    expect(getScriptFromWord(split, { fromWord: 3, firedCues: 1 })).toEqual(['now.']);
  });

  const CUT_BEATS: [string, unknown[], string[], unknown[]][] = [
    ['drawings between words', ['Your ', push, 'hand, right ', fade, 'up.'], ['Your', 'hand,', 'right', 'up.'], [push, fade]],
    ['a drawing inside a word', ['Watch ar', fade, 'row ', push, 'now.'], ['Watch', 'arrow', 'now.'], [fade, push]],
    ['drawings at both ends', [push, '  Watch this. ', fade], ['Watch', 'this.'], [push, fade]],
  ];

  it.each(CUT_BEATS)('never repeats or loses a word or a drawing at any cut point: %s', (_name, script, words, commands) => {
    const cutBeat = parseOrThrow(makeBeat({ script }));
    for (let fromWord = 0; fromWord <= words.length; fromWord += 1) {
      for (let firedCues = 0; firedCues <= commands.length; firedCues += 1) {
        const rest = getScriptFromWord(cutBeat, { fromWord, firedCues });
        expect(getSpokenWords(getScriptText(rest))).toEqual(words.slice(fromWord));
        expect(rest.filter((part) => typeof part !== 'string')).toEqual(commands.slice(firedCues));
      }
    }
  });
});

describe('getResumeScript', () => {
  const SHOT = 'shot' as FrozenFrame['target'];
  const VALUES = 'values' as FrozenFrame['target'];
  const play = { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 5 };
  const arrow = { kind: 'trackVector', id: 'arrow', target: 'shot', quantity: 'velocity-y' };
  const reveal = { kind: 'reveal', target: 'values', upTo: 3, overWords: 4 };
  const beat = parseOrThrow(makeBeat({ script: [play, reveal, 'Watch ', arrow, 'this arrow come back down now.'] }));

  function getCommands(script: unknown[]): unknown[] {
    return script.filter((part) => typeof part !== 'string');
  }

  it('plays the frozen ball again on the first resumed word, with its stop kept and the said words taken off', () => {
    const frozen = [{ target: SHOT, simulationSeconds: 0.71 }];
    const script = getResumeScript(beat, { fromWord: 2, firedCues: 3, frozen });
    const resumed = parseOrThrow(makeBeat({ script }));
    expect(getCues(resumed)).toEqual([{ atWord: 0, command: { ...play, overWords: 3 } }]);
    expect(getBeatText(resumed)).toBe('arrow come back down now.');
  });

  it('never fires twice a command that already fired', () => {
    const frozen = [{ target: SHOT, simulationSeconds: 0.71 }];
    const commands = getCommands(getResumeScript(beat, { fromWord: 2, firedCues: 3, frozen }));
    expect(commands).toEqual([{ ...play, overWords: 3 }]);
  });

  it('still fires a late command that never fired, after the one it prepends', () => {
    const frozen = [{ target: SHOT, simulationSeconds: 0.71 }];
    const commands = getCommands(getResumeScript(beat, { fromWord: 2, firedCues: 2, frozen }));
    expect(commands).toEqual([{ ...play, overWords: 3 }, arrow]);
  });

  it('adds nothing when nothing is frozen', () => {
    const cut = { fromWord: 2, firedCues: 3 };
    expect(getResumeScript(beat, { ...cut, frozen: [] })).toEqual(getScriptFromWord(beat, cut));
  });

  it('keeps at least one word for the motion to finish over', () => {
    const frozen = [{ target: SHOT, simulationSeconds: 0.71 }];
    const commands = getCommands(getResumeScript(beat, { fromWord: 6, firedCues: 3, frozen }));
    expect(commands).toEqual([{ ...play, overWords: 1 }]);
  });

  it('takes nothing off when the cue fired ahead of its word', () => {
    const early = parseOrThrow(makeBeat({ script: ['Watch this ', play, 'arrow now.'] }));
    const frozen = [{ target: SHOT, simulationSeconds: 0.71 }];
    expect(getResumeScript(early, { fromWord: 1, firedCues: 1, frozen })[0]).toEqual(play);
  });

  it('leaves overWords out when the cue had none, and keeps its stop', () => {
    const plain = { kind: 'runSimulation', target: 'shot', action: 'play', until: 0.9 };
    const noWords = parseOrThrow(makeBeat({ script: [plain, 'Watch this arrow.'] }));
    const frozen = [{ target: SHOT, simulationSeconds: 0.3 }];
    expect(getResumeScript(noWords, { fromWord: 1, firedCues: 1, frozen })).toEqual([plain, 'this arrow.']);
  });

  it('uses the last play that fired for that target, and ignores other actions and other targets', () => {
    const first = { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak' };
    const other = { kind: 'runSimulation', target: 'other', action: 'play', until: 0.2 };
    const pause = { kind: 'runSimulation', target: 'shot', action: 'pause' };
    const second = { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing' };
    const many = parseOrThrow(makeBeat({ script: [first, 'One ', second, 'two ', other, pause, 'three four.'] }));
    const frozen = [{ target: SHOT, simulationSeconds: 0.3 }];
    expect(getCommands(getResumeScript(many, { fromWord: 3, firedCues: 4, frozen }))).toEqual([second]);
  });

  it('plays plainly when the motion started in an earlier beat', () => {
    const later = parseOrThrow(makeBeat({ script: ['Watch this arrow.'] }));
    const frozen = [{ target: SHOT, simulationSeconds: 0.3 }];
    expect(getResumeScript(later, { fromWord: 1, firedCues: 0, frozen })).toEqual([{ kind: 'runSimulation', target: 'shot', action: 'play' }, 'this arrow.']);
  });

  it('does not count a play that has not fired as the cue to repeat', () => {
    const frozen = [{ target: SHOT, simulationSeconds: 0.3 }];
    const commands = getCommands(getResumeScript(beat, { fromWord: 0, firedCues: 0, frozen }));
    expect(commands[0]).toEqual({ kind: 'runSimulation', target: 'shot', action: 'play' });
  });

  it('carries on a cut reveal, with the said words taken off', () => {
    const frozen = [{ target: VALUES, revealedUpTo: 1.5 }];
    expect(getCommands(getResumeScript(beat, { fromWord: 3, firedCues: 3, frozen }))).toEqual([{ ...reveal, overWords: 1 }]);
    expect(getCommands(getResumeScript(beat, { fromWord: 1, firedCues: 3, frozen }))).toEqual([{ ...reveal, overWords: 3 }]);
  });

  it('drops a reveal frame with no reveal fired in this beat', () => {
    const frozen = [{ target: VALUES, revealedUpTo: 1.5 }];
    expect(getCommands(getResumeScript(beat, { fromWord: 0, firedCues: 0, frozen }))).toEqual([play, reveal, arrow]);
  });

  it('adds nothing for an entrance, which the board finishes when it unfreezes', () => {
    const frozen = [{ target: SHOT, drawnFraction: 0.4 }, { target: VALUES, drawnFraction: 0.4 }];
    expect(getCommands(getResumeScript(beat, { fromWord: 2, firedCues: 3, frozen }))).toEqual([]);
  });

  it('gives one command per frame, in the order of the frames', () => {
    const frozen = [{ target: VALUES, revealedUpTo: 1 }, { target: SHOT, simulationSeconds: 0.3 }];
    expect(getCommands(getResumeScript(beat, { fromWord: 1, firedCues: 3, frozen }))).toEqual([{ ...reveal, overWords: 3 }, { ...play, overWords: 4 }]);
  });

  it('leaves the beat it was given unchanged', () => {
    const before = JSON.stringify(beat);
    getResumeScript(beat, { fromWord: 3, firedCues: 3, frozen: [{ target: SHOT, simulationSeconds: 0.3 }] });
    expect(JSON.stringify(beat)).toBe(before);
  });
});

describe('the shared board language', () => {
  const OLDER_ROW = { seq: 4, atMs: 900, kind: 'studentActed', action: { action: 'fileShared', fileId: 'file-1', name: 'notes.pdf' } };
  const LINE_ROW = { seq: 5, atMs: 1000, kind: 'studentActed', action: { action: 'worked', work: { way: 'write', id: 's1', text: '2x = 14', task: 'try' }, reading: { kind: 'math', parts: [{ type: 'math', text: '2x = 14', tex: '2x=14' }], isAsking: false }, verdict: { status: 'wrong', why: '2x=14 does not follow' } } };

  it.each([
    ['a line of working', { kind: 'task', id: 'a', way: 'write', on: 'eq' }],
    ['a free answer', { kind: 'task', id: 'a', way: 'write', reads: 'words', accepts: ['1789'] }],
    ['lines of code', { kind: 'task', id: 'a', way: 'write', reads: 'code' }],
    ['a term to circle', { kind: 'task', id: 'a', way: 'pick', on: 'eq', answer: ['+3'] }],
    ['a part of a diagram', { kind: 'task', id: 'a', way: 'pick', on: 'cell', answer: ['nucleus'] }],
    ['events in order', { kind: 'task', id: 'a', way: 'place', items: ['Bastille', 'Terror'], slots: ['First', 'Second'], answer: ['Bastille', 'Terror'] }],
    ['matching with no key', { kind: 'task', id: 'a', way: 'place', items: ['H', 'O'], slots: ['Hydrogen', 'Oxygen'] }],
    ['a point on a curve', { kind: 'task', id: 'a', way: 'drag', on: 'curve', seek: 'flat' }],
  ])('takes a task for %s', (_, command) => {
    expect(parseSceneCommand(command)).toMatchObject({ ok: true, value: command });
  });

  it.each([
    ['a way nobody knows', { kind: 'task', id: 'a', way: 'guess' }],
    ['a field of another way', { kind: 'task', id: 'a', way: 'write', items: ['a'] }],
    ['a pick with no target', { kind: 'task', id: 'a', way: 'pick' }],
    ['a key that is not an item', { kind: 'task', id: 'a', way: 'place', items: ['a'], slots: ['1'], answer: ['b'] }],
    ['a key of the wrong length', { kind: 'task', id: 'a', way: 'place', items: ['a', 'b'], slots: ['1', '2'], answer: ['a'] }],
    ['the same item twice', { kind: 'task', id: 'a', way: 'place', items: ['a', 'a'], slots: ['1', '2'] }],
    ['a long note', { kind: 'note', id: 'n', target: 'eq', text: 'x'.repeat(49) }],
  ])('refuses %s', (_, command) => {
    expect(parseSceneCommand(command).ok).toBe(false);
  });

  it('keeps older log rows parsing, and takes the new one', () => {
    expect(parseSessionEvent(OLDER_ROW).ok).toBe(true);
    expect(parseSessionEvent(LINE_ROW)).toMatchObject({ ok: true });
  });

  it('refuses a stored reading whose math the board could not set', () => {
    const forged = { ...LINE_ROW, action: { ...LINE_ROW.action, reading: { kind: 'math', parts: [{ type: 'math', text: 'x', tex: '\\href{javascript:alert(1)}{x}' }], isAsking: false } } };
    expect(parseSessionEvent(forged).ok).toBe(false);
  });

  it('carries a student action and a pause from the page', () => {
    expect(parseBrowserMessage({ type: 'worked', clockId: 'c', browserMs: 1, startedMsAgo: 0, work: { way: 'pick', task: 'try', part: '+3' } }).ok).toBe(true);
    expect(parseBrowserMessage({ type: 'paused', clockId: 'c', browserMs: 1, startedMsAgo: 0, seconds: 3, draft: 'hmm' }).ok).toBe(true);
  });
});
