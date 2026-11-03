import { type AgentMessage, type BrowserMessage, parseSessionEvent, type SceneCommand, type SessionEvent } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { createTimerClock } from '../src/player/audio-clock.ts';
import { describeBoard } from '../src/player/board-state.ts';
import { createProjectileScene } from '../src/player/projectile-scene.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';
import { createScenePlayer } from '../src/player/scene-player.ts';
import { LONGEST_HOLD_MS } from '../src/player/word-clock.ts';
import { beatId, createFakeAudio, elementId, type FakeAudio, textCommand, THREE_WORDS, turnId } from './fake-audio.ts';

const TURN = turnId('turn-1');
const BEAT = beatId('beat-1');

const cue = (atWord: number, command: SceneCommand = textCommand(`drawing-${atWord}`)): AgentMessage => ({ type: 'cue', turnId: TURN, beatId: BEAT, atWord, command });
const words = (firstWord = 0, timed = THREE_WORDS): AgentMessage => ({ type: 'words', turnId: TURN, beatId: BEAT, firstWord, words: timed });
const beatClosed = (wordCount = 3, expectsReply = false): AgentMessage => ({ type: 'beatClosed', turnId: TURN, beatId: BEAT, wordCount, expectsReply });
const started: AgentMessage = { type: 'turnStarted', turnId: TURN };
const stop: AgentMessage = { type: 'stop', turnId: TURN };

const played = (audio: FakeAudio) => audio.sent.filter((message): message is BrowserMessage & { type: 'played' } => message.type === 'played');

describe('cues on their words', () => {
  it('fires each cue when the count reaches its word, on a fake audio clock', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), cue(1), cue(2), words(), beatClosed());
    audio.advance(50);
    audio.startSound();
    const firstSoundAtMs = audio.getNowMs();
    audio.advance(600);
    expect(audio.fired.map((fired) => Math.round(fired.firedAtMs - firstSoundAtMs))).toEqual([4, 300, 500]);
  });

  it('counts from the first sound whatever leading silence the voice sent', () => {
    const offsets = [0, 40, 75].map((leadingSilenceMs) => {
      const audio = createFakeAudio();
      audio.receive(started, cue(1), words(), beatClosed());
      audio.advance(leadingSilenceMs);
      audio.startSound();
      const firstSoundAtMs = audio.getNowMs();
      audio.advance(400);
      return Math.round((audio.fired[0]?.firedAtMs as number) - firstSoundAtMs);
    });
    expect(offsets).toEqual([300, 300, 300]);
  });

  it('follows what the ear hears, so a slow output device delays the cue by its own latency', () => {
    const audio = createFakeAudio({ outputLatencyMs: 40 });
    audio.receive(started, cue(1), words(), beatClosed());
    audio.startSound();
    const firstSoundAtMs = audio.getNowMs();
    audio.advance(400);
    expect(Math.round((audio.fired[0]?.firedAtMs as number) - firstSoundAtMs)).toBe(340);
  });

  it('makes a cue wait for sound, so a word time inside a silence lands on the next sound', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(1), words(), beatClosed());
    audio.startSound();
    audio.advance(250);
    audio.quiet();
    audio.advance(120);
    expect(audio.fired).toEqual([]);
    audio.sound();
    audio.advance(4);
    expect(audio.fired).toHaveLength(1);
  });

  it('lets word times arrive with or after the audio, and a cue whose time came late fires when it lands', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), cue(2));
    audio.startSound();
    audio.advance(700);
    expect(audio.fired).toEqual([]);
    audio.receive(words(0, THREE_WORDS.slice(0, 2)));
    audio.advance(4);
    expect(audio.fired.map((fired) => fired.atWord)).toEqual([0]);
    audio.receive(words(2, THREE_WORDS.slice(2)));
    audio.advance(4);
    expect(audio.fired.map((fired) => fired.atWord)).toEqual([0, 2]);
  });

  it('fires a cue that arrives after its word was heard, even in a quiet block', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed());
    audio.startSound();
    audio.advance(350);
    audio.quiet();
    audio.receive(cue(1));
    audio.advance(4);
    expect(audio.fired.map((fired) => fired.atWord)).toEqual([1]);
  });

  it('holds cues behind a reported stall, and lands them after it', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(2), words(), beatClosed());
    audio.startSound();
    audio.advance(100);
    audio.receive({ type: 'audioGap', turnId: TURN, atMs: 400 });
    audio.advance(1500);
    expect(audio.fired).toEqual([]);
    audio.receive({ type: 'audioGap', turnId: TURN, atMs: 400, ms: 1200 });
    audio.advance(4);
    expect(audio.fired).toEqual([]);
    audio.advance(100);
    expect(audio.fired).toHaveLength(1);
  });

  it('takes the earliest sound of a late turn message, not the sound after its last pause', () => {
    const audio = createFakeAudio();
    audio.startSound();
    const firstSoundAtMs = audio.getNowMs();
    audio.advance(300);
    audio.endSound();
    audio.advance(150);
    audio.startSound();
    audio.advance(100);
    audio.receive(started, cue(2), words(), beatClosed());
    audio.advance(4);
    expect(audio.fired).toHaveLength(1);
    expect(Math.round(audio.fired[0]?.positionMs as number)).toBe(Math.round(audio.getNowMs() - firstSoundAtMs));
  });
});

describe('questionHeard', () => {
  it('goes out once, when the last word of a question starts', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed(3, true));
    audio.startSound();
    audio.advance(490);
    expect(audio.sent).toEqual([]);
    audio.advance(20);
    expect(audio.sent.filter((message) => message.type === 'questionHeard')).toHaveLength(1);
    audio.advance(100);
    expect(audio.sent.filter((message) => message.type === 'questionHeard')).toHaveLength(1);
  });

  it('still goes out when a closing report is lost within the hold of the last word and the audio has ended', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed(3, true));
    audio.startSound();
    audio.advance(200);
    audio.receive({ type: 'audioGap', turnId: TURN, atMs: 250 });
    audio.advance(400);
    audio.endSound();
    audio.advance(LONGEST_HOLD_MS + 1300);
    expect(audio.sent.filter((message) => message.type === 'questionHeard')).toHaveLength(1);
  });
});

describe('a stop', () => {
  it('silences first, discards unplayed cues, and reports only what played', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), cue(2), words(), beatClosed());
    audio.startSound();
    audio.advance(350);
    audio.receive(stop);
    expect(audio.levels.at(-1)).toBe('silent');
    audio.advance(500);
    expect(audio.fired.map((fired) => fired.atWord)).toEqual([0]);
    const [report] = played(audio);
    expect(report).toMatchObject({ playedWords: 2, ending: 'interrupted', firedCueMs: [4] });
  });

  it('ignores a second stop from the other channel, and anything sent for the turn after it', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(100);
    audio.receive(stop, stop, cue(1), { type: 'yield', turnId: TURN, isYielding: true });
    audio.advance(500);
    expect(played(audio)).toHaveLength(1);
    expect(audio.fired).toHaveLength(1);
    expect(audio.levels.at(-1)).toBe('silent');
  });

  it('stays silent until the next turn starts, and never earlier', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed());
    audio.startSound();
    audio.advance(100);
    audio.receive(stop);
    audio.endSound();
    audio.advance(1000);
    expect(audio.levels.at(-1)).toBe('silent');
    audio.receive({ type: 'turnStarted', turnId: turnId('turn-2') });
    expect(audio.levels.at(-1)).toBe('full');
  });

  it('counts only words heard, so a stop during a stall reports no word past the stall', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed());
    audio.startSound();
    audio.advance(100);
    audio.receive({ type: 'audioGap', turnId: TURN, atMs: 200 });
    audio.quiet();
    audio.advance(800);
    audio.receive(stop);
    expect(played(audio)[0]?.playedWords).toBe(1);
  });

  it('reports a stop after the last word with something still moving as a frozen board', () => {
    const shot: SceneCommand = { kind: 'simulate', id: elementId('shot'), simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } };
    const audio = createFakeAudio();
    audio.receive(started, cue(0, shot), cue(1, { kind: 'runSimulation', target: elementId('shot'), action: 'play' }), words(), beatClosed());
    audio.startSound();
    audio.advance(600);
    audio.endSound();
    audio.advance(10);
    audio.receive(stop);
    const frozen = audio.sent.find((message) => message.type === 'boardFrozen');
    expect(frozen?.type === 'boardFrozen' && frozen.frozen[0]).toMatchObject({ target: 'shot' });
  });

  it('ignores everything sent for an old turn', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed());
    audio.receive({ type: 'turnStarted', turnId: turnId('turn-2') }, cue(0));
    audio.startSound();
    audio.advance(100);
    expect(audio.fired).toEqual([]);
  });
});

function runInterruptedLesson(audio: FakeAudio) {
  const shot: SceneCommand = { kind: 'simulate', id: elementId('shot'), simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } };
  audio.receive(started, cue(0, shot), cue(1, { kind: 'runSimulation', target: elementId('shot'), action: 'play', until: 'landing', overWords: 2 }), cue(2), words(), beatClosed());
  audio.startSound();
  audio.advance(420);
  audio.receive(stop);
  audio.endSound();
  audio.advance(900);
  const next = turnId('turn-2');
  const resumed = beatId('beat-2');
  audio.receive(
    { type: 'turnStarted', turnId: next },
    { type: 'cue', turnId: next, beatId: resumed, atWord: 0, command: { kind: 'runSimulation', target: elementId('shot'), action: 'play', until: 'landing', overWords: 1 } },
    { type: 'cue', turnId: next, beatId: resumed, atWord: 1, command: textCommand('late-drawing') },
    { type: 'words', turnId: next, beatId: resumed, firstWord: 0, words: THREE_WORDS },
    { type: 'beatClosed', turnId: next, beatId: resumed, wordCount: 3, expectsReply: false },
  );
  audio.startSound();
  audio.advance(800);
  audio.endSound();
  audio.advance(200);
}

// The agent's half of the wire, kept here only to prove a report round-trips into a log the parser accepts.
function writeLog(audio: FakeAudio, getBeat: (beat: string) => unknown): SessionEvent[] {
  return played(audio).map((report, seq) => {
    const { turnId: reportedTurn, beatId: reportedBeat, browserMs, startedMsAgo, wordStartsMs, durationMs, playedWords, firedCueMs, ending, frozen } = report;
    const parsed = parseSessionEvent({ seq, atMs: browserMs - startedMsAgo, kind: 'beatPlayed', reportedBy: 'browser', turnId: reportedTurn, beat: getBeat(reportedBeat), wordStartsMs, durationMs, playedWords, firedCueMs, ending, frozen });
    if (!parsed.ok) throw new Error(parsed.problem);
    return parsed.value;
  });
}

describe('replay', () => {
  const lessonBeats: Record<string, unknown> = {
    'beat-1': { id: 'beat-1', expectsReply: false, script: [{ kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } }, 'Watch ', { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 2 }, 'the ', { kind: 'text', id: 'drawing-2', text: 'drawing-2' }, 'ball'] },
    'beat-2': { id: 'beat-2', expectsReply: false, script: [{ kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 1 }, 'Watch ', { kind: 'text', id: 'late-drawing', text: 'late-drawing' }, 'the ball'] },
  };

  it('rebuilds a board identical to the live one from the log the reports become', () => {
    const audio = createFakeAudio();
    runInterruptedLesson(audio);
    const log = writeLog(audio, (id) => lessonBeats[id]);
    const end = audio.getNowMs();
    for (let atMs = 1000; atMs <= end; atMs += 7) {
      expect(describeBoard(rebuildBoard(log, atMs), atMs)).toEqual(describeBoard(audio.player.getBoard(atMs), atMs));
    }
  });

  it('gives the same board twice from the same log', () => {
    const audio = createFakeAudio();
    runInterruptedLesson(audio);
    const log = writeLog(audio, (id) => lessonBeats[id]);
    const atMs = audio.getNowMs();
    expect(describeBoard(rebuildBoard(log, atMs), atMs)).toEqual(describeBoard(rebuildBoard(log, atMs), atMs));
    expect(describeBoard(rebuildBoard(log, atMs), atMs).elements.map((element) => element.id)).toEqual(['shot', 'late-drawing']);
  });
});

describe('the timer fallback', () => {
  it('drives the board from when word times arrive if audio cannot run', () => {
    let nowMs = 0;
    const sent: BrowserMessage[] = [];
    const player = createScenePlayer({ clock: createTimerClock({ getNowMs: () => nowMs }), send: (message) => sent.push(message), setOutputLevel: () => {} });
    player.receive(started);
    player.receive(cue(1));
    nowMs = 200;
    player.tick();
    player.receive(words());
    player.receive(beatClosed());
    nowMs = 450;
    player.tick();
    expect(describeBoard(player.getBoard(nowMs), nowMs).elements).toEqual([]);
    nowMs = 510;
    player.tick();
    expect(describeBoard(player.getBoard(nowMs), nowMs).elements.map((element) => element.id)).toEqual(['drawing-1']);
    nowMs = 1400;
    player.tick();
    expect(sent.map((message) => message.type)).toEqual(['played']);
  });
});

describe('a scene', () => {
  it('is a pure function of its seconds, so any order of reads gives the same frames', () => {
    const scene = createProjectileScene({ horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 });
    const forward = [0, 0.3, 0.6, 1.2].map((seconds) => scene.getFrame(seconds));
    const backward = [1.2, 0.6, 0.3, 0].map((seconds) => scene.getFrame(seconds)).reverse();
    expect(backward).toEqual(forward);
    expect(scene.getFrame(scene.moments.peak as number).velocity.y).toBeCloseTo(0);
    expect(scene.getFrame(scene.durationSeconds).ball.y).toBeCloseTo(0);
  });

  it('can be anything with parts and moments, and the player needs no change for it', () => {
    const orbit = {
      parts: ['moon', 'planet'],
      moments: { eclipse: 2, peak: 2 },
      durationSeconds: 8,
      getFrame: (seconds: number) => ({ moonAngle: seconds * 45, cameraless: true }),
    };
    const catalog = (command: SceneCommand) => (command.kind === 'simulate' ? orbit : null);
    const audio = createFakeAudio({ catalog });
    const place: SceneCommand = { kind: 'simulate', id: elementId('moon-orbit'), simulation: { model: 'projectile', parameters: { horizontalSpeed: 1, upwardSpeed: 1, releaseHeight: 1, gravity: 9.8 } } };
    audio.receive(started, cue(0, place), cue(1, { kind: 'runSimulation', target: elementId('moon-orbit'), action: 'play', until: 'peak' }), words(), beatClosed());
    audio.startSound();
    audio.advance(400);
    audio.receive(stop);
    const report = played(audio)[0];
    const frame = report?.frozen.find((frozen) => 'simulationSeconds' in frozen);
    expect(frame && 'simulationSeconds' in frame && frame.simulationSeconds).toBeCloseTo(0.1, 1);
    const board = audio.player.getBoard(audio.getNowMs() + 5000);
    expect(describeBoard(board, audio.getNowMs() + 5000).elements[0]?.sceneSeconds).toBeCloseTo(0.1, 1);
  });
});
