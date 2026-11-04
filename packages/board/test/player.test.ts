import { type AgentMessage, type BrowserMessage, parseSessionEvent, type SceneCommand, type SessionEvent } from '@astra/contracts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTimerClock, TURN_SILENCE_MS } from '../src/player/audio-clock.ts';
import { type BoardElement, describeBoard, getSceneFrame } from '../src/player/board-state.ts';
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

describe('a new turn', () => {
  const NEXT = turnId('turn-2');
  const NEXT_BEAT = beatId('beat-2');
  const startNext = (audio: FakeAudio, atWord = 2) => audio.receive({ type: 'turnStarted', turnId: NEXT }, { type: 'cue', turnId: NEXT, beatId: NEXT_BEAT, atWord, command: textCommand('next-drawing') }, { type: 'words', turnId: NEXT, beatId: NEXT_BEAT, firstWord: 0, words: THREE_WORDS }, { type: 'beatClosed', turnId: NEXT, beatId: NEXT_BEAT, wordCount: 3, expectsReply: false });
  const firedForNext = (audio: FakeAudio) => audio.fired.filter((fired) => fired.turnId === NEXT);

  it('reports the turn it replaces, so no beat is lost from the log, and counts from its own first sound', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(450);
    startNext(audio);
    expect(played(audio).map(({ turnId: id, ending, playedWords }) => [id, ending, playedWords])).toEqual([[TURN, 'interrupted', 2]]);
    audio.advance(200);
    audio.endSound();
    audio.advance(200);
    expect(firedForNext(audio)).toEqual([]);
    audio.startSound();
    const firstSoundAtMs = audio.getNowMs();
    audio.advance(600);
    expect(firedForNext(audio).map((fired) => Math.round(fired.firedAtMs - firstSoundAtMs))).toEqual([500]);
  });

  it('calls a turn finished when every word was heard and only its tail is still sounding', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(520);
    startNext(audio);
    expect(played(audio).map(({ ending }) => ending)).toEqual(['finished']);
  });

  it('leaves a drawing still moving alone when every beat of the turn it replaces was heard', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(2), words(), beatClosed());
    audio.startSound();
    audio.advance(520);
    startNext(audio);
    expect(audio.sent.filter((message) => message.type === 'boardFrozen')).toEqual([]);
    expect(played(audio).map(({ ending }) => ending)).toEqual(['finished']);
  });

  it('closes a turn on its own end in audio order, so a late message still finds its first sound with no tick between them', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(520);
    audio.quiet();
    audio.skip(160);
    audio.clock.onProbeEvent({ kind: 'end', atMs: audio.getNowMs() });
    audio.skip(40);
    audio.startSound();
    startNext(audio, 0);
    audio.advance(8);
    expect(firedForNext(audio).map((fired) => Math.round(fired.positionMs))).toEqual([4]);
  });

  it('takes no word from the audio still arriving after a stop as its first sound', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(200);
    audio.endSound();
    audio.receive(stop);
    audio.advance(40);
    audio.startSound();
    audio.advance(30);
    audio.endSound();
    audio.advance(80);
    startNext(audio, 0);
    audio.advance(40);
    expect(firedForNext(audio)).toEqual([]);
    audio.startSound();
    audio.advance(8);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBeLessThan(10);
  });

  it('takes no word in the old audio as a first sound, even when turnStarted beat that word to the browser', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(300);
    audio.endSound();
    audio.advance(50);
    audio.receive(stop);
    audio.advance(20);
    startNext(audio, 0);
    audio.advance(40);
    audio.startSound();
    audio.advance(20);
    expect(firedForNext(audio)).toEqual([]);
    audio.quiet();
    audio.advance(107);
    audio.clock.onProbeEvent({ kind: 'end', atMs: audio.getNowMs() });
    audio.advance(150);
    audio.startSound();
    audio.advance(8);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBeLessThan(10);
  });

  it('counts a first sound right after a turn that never sounded, because no old audio can be on its way', () => {
    const audio = createFakeAudio();
    audio.receive(started, beatClosed());
    audio.advance(400);
    audio.receive(stop);
    startNext(audio, 0);
    audio.advance(30);
    audio.startSound();
    audio.advance(8);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBeLessThan(10);
  });

  it('keeps the guard for a turn stopped on its first frames, when word times say its sound is on the way', () => {
    const audio = createFakeAudio();
    audio.receive(started, words(), beatClosed());
    audio.advance(10);
    audio.receive(stop);
    audio.advance(30);
    audio.startSound();
    startNext(audio, 0);
    audio.advance(20);
    audio.endSound();
    audio.advance(150);
    expect(firedForNext(audio)).toEqual([]);
    audio.startSound();
    audio.advance(8);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBeLessThan(10);
  });

  describe('a short word of old audio past the 110 ms', () => {
    const LEEWAY_MS = 6;
    const stopThenStartNext = () => {
      const audio = createFakeAudio();
      audio.receive(started, cue(0), words(), beatClosed());
      audio.startSound();
      audio.advance(300);
      audio.endSound();
      audio.advance(50);
      audio.receive(stop);
      startNext(audio, 2);
      return audio;
    };
    const playSound = (audio: FakeAudio, ms: number) => {
      audio.startSound();
      audio.advance(ms);
      audio.quiet();
      const lastAudibleAtMs = audio.getNowMs();
      audio.advance(107);
      audio.clock.onProbeEvent({ kind: 'end', atMs: lastAudibleAtMs });
    };

    it('stops counting as the first sound once it ends, so the turn runs from its real one', () => {
      const audio = stopThenStartNext();
      audio.advance(160);
      playSound(audio, 90);
      audio.advance(40);
      audio.startSound();
      const firstSoundAtMs = audio.getNowMs();
      audio.advance(600);
      expect(Math.abs((firedForNext(audio)[0]?.firedAtMs as number) - firstSoundAtMs - 500)).toBeLessThan(LEEWAY_MS);
    });

    it('is not taken as the first sound either when both arrive before the turn\'s message', () => {
      const audio = createFakeAudio();
      audio.receive(started, cue(0), words(), beatClosed());
      audio.startSound();
      audio.advance(300);
      audio.endSound();
      audio.advance(50);
      audio.receive(stop);
      audio.advance(160);
      playSound(audio, 90);
      audio.advance(40);
      audio.startSound();
      const firstSoundAtMs = audio.getNowMs();
      audio.advance(30);
      startNext(audio, 2);
      audio.advance(570);
      expect(Math.abs((firedForNext(audio)[0]?.firedAtMs as number) - firstSoundAtMs - 500)).toBeLessThan(LEEWAY_MS);
    });

    it('still lets a turn with no other sound start by the limit, so it cannot leave the turn deaf', () => {
      const audio = stopThenStartNext();
      audio.advance(160);
      playSound(audio, 90);
      audio.advance(3000);
      expect(firedForNext(audio)).toHaveLength(1);
    });

    it('keeps a first sound long enough to be a word, with a pause after it', () => {
      const audio = stopThenStartNext();
      audio.advance(160);
      const firstSoundAtMs = audio.getNowMs();
      playSound(audio, 260);
      audio.advance(40);
      audio.startSound();
      audio.advance(400);
      expect(Math.abs((firedForNext(audio)[0]?.firedAtMs as number) - firstSoundAtMs - 500)).toBeLessThan(LEEWAY_MS);
    });

    it('keeps a short first sound when no stop came before it', () => {
      const audio = createFakeAudio();
      audio.receive(started, words(), beatClosed());
      audio.startSound();
      audio.advance(600);
      audio.endSound();
      audio.advance(150);
      startNext(audio, 2);
      const firstSoundAtMs = audio.getNowMs();
      playSound(audio, 90);
      audio.advance(40);
      audio.startSound();
      audio.advance(400);
      expect(Math.abs((firedForNext(audio)[0]?.firedAtMs as number) - firstSoundAtMs - 500)).toBeLessThan(LEEWAY_MS);
    });
  });

  it('does not count from the last turn\'s first sound when it starts right after that turn ended', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(520);
    audio.endSound();
    audio.advance(50);
    startNext(audio, 0);
    audio.advance(50);
    audio.startSound();
    audio.advance(8);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBeLessThan(10);
  });

  it('starts from the first audible block when no first sound comes within the limit, so a merged start cannot leave a turn deaf', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.startSound();
    audio.advance(100);
    audio.receive(stop);
    audio.quiet();
    audio.advance(20);
    startNext(audio, 2);
    audio.advance(20);
    audio.sound();
    const firstAudibleAtMs = audio.getNowMs();
    audio.advance(1100);
    expect(firedForNext(audio).map((fired) => Math.round(fired.firedAtMs - firstAudibleAtMs))).toEqual([980]);
    expect(Math.round(firedForNext(audio)[0]?.positionMs as number)).toBe(980);
  });

  it('starts a turn with no sound at all once the limit passes, so its words stop waiting and its beats report', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(0), words(), beatClosed());
    audio.advance(3000);
    expect(audio.fired).toHaveLength(1);
    expect(played(audio).map(({ ending, playedWords }) => [ending, playedWords])).toEqual([['finished', 3]]);
  });
});

describe('the probe and the agent', () => {
  it('agree on a silence, with room for a jitter buffer to squeeze the one the agent leaves', () => {
    const probe = readFileSync(new URL('../src/player/audio-probe-worklet.js', import.meta.url), 'utf8');
    const blocks = Number(/SILENCE_BEFORE_ONSET_BLOCKS = (\d+)/.exec(probe)?.[1]);
    const probeSilenceMs = (blocks * 128 * 1000) / 48000;
    expect(probeSilenceMs).toBeLessThanOrEqual(TURN_SILENCE_MS - 40);
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
  it('catches up first, so a word that came due since the last tick counts and its cue fires', () => {
    const audio = createFakeAudio();
    audio.receive(started, cue(1), words(), beatClosed());
    audio.startSound();
    audio.advance(290);
    audio.skip(20);
    audio.receive(stop);
    expect(played(audio)[0]?.playedWords).toBe(2);
    expect(audio.fired).toHaveLength(1);
  });

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

  describe('the unmute after it', () => {
    const NEXT: AgentMessage = { type: 'turnStarted', turnId: turnId('turn-2') };
    const stopWhileSounding = () => {
      const audio = createFakeAudio();
      audio.receive(started, words(), beatClosed());
      audio.startSound();
      audio.advance(100);
      audio.receive(stop);
      return audio;
    };

    it('waits for the old audio to end when turnStarted lands while it still sounds', () => {
      const audio = stopWhileSounding();
      audio.advance(160);
      audio.receive(NEXT);
      audio.advance(40);
      expect(audio.levels.at(-1)).toBe('silent');
      audio.quiet();
      audio.advance(107);
      audio.clock.onProbeEvent({ kind: 'end', atMs: audio.getNowMs() });
      audio.advance(4);
      expect(audio.levels.at(-1)).toBe('full');
    });

    it('waits out the window when turnStarted beats the old audio, and holds on for a word that starts inside it', () => {
      const audio = stopWhileSounding();
      audio.endSound();
      audio.advance(40);
      audio.receive(NEXT);
      audio.advance(40);
      expect(audio.levels.at(-1)).toBe('silent');
      audio.startSound();
      audio.advance(60);
      expect(audio.levels.at(-1)).toBe('silent');
      audio.endSound();
      audio.advance(4);
      expect(audio.levels.at(-1)).toBe('full');
    });

    it('opens at once on a sound the clock took as the new turn, which is not old audio', () => {
      const audio = stopWhileSounding();
      audio.endSound();
      audio.advance(200);
      audio.startSound();
      audio.advance(50);
      audio.receive(NEXT);
      expect(audio.levels.at(-1)).toBe('full');
    });

    it('opens within the limit when old and new audio merge with no end, so a turn is never left mute', () => {
      const audio = stopWhileSounding();
      audio.advance(160);
      audio.receive(NEXT);
      audio.advance(600);
      expect(audio.levels.at(-1)).toBe('full');
    });

    it('stays shut if the new turn is stopped too, and a yield while it waits takes effect when it opens', () => {
      const audio = stopWhileSounding();
      audio.advance(160);
      audio.receive(NEXT, { type: 'yield', turnId: turnId('turn-2'), isYielding: true });
      audio.endSound();
      audio.advance(4);
      expect(audio.levels.at(-1)).toBe('lowered');

      const stoppedAgain = stopWhileSounding();
      stoppedAgain.advance(160);
      stoppedAgain.receive(NEXT, { type: 'stop', turnId: turnId('turn-2') });
      stoppedAgain.endSound();
      stoppedAgain.advance(600);
      expect(stoppedAgain.levels.at(-1)).toBe('silent');
    });
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

// The agent's half of the wire, to prove a report round-trips into a log the parser accepts.
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

  it('gives a test scene computed only from time the same frame at any seek point, and through a rewind and a replay', () => {
    const scene = { parts: ['moon'], moments: { eclipse: 2 }, durationSeconds: 8, getFrame: (seconds: number) => ({ moonAngle: seconds * 45 }) };
    const catalog = (command: SceneCommand) => (command.kind === 'simulate' ? scene : null);
    const orbit = { kind: 'simulate', id: 'orbit', simulation: { model: 'projectile', parameters: { horizontalSpeed: 1, upwardSpeed: 1, releaseHeight: 1, gravity: 9.8 } } };
    const parseFor = (body: Record<string, unknown>) => {
      const parsed = parseSessionEvent(body);
      if (!parsed.ok) throw new Error(parsed.problem);
      return parsed.value;
    };
    const beat = (id: string, script: unknown[]) => ({ kind: 'beatPlayed', reportedBy: 'browser', turnId: 't1', beat: { id, script, expectsReply: false }, wordStartsMs: [0, 200], durationMs: 400, playedWords: 2, ending: 'finished', frozen: [] });
    const log = [
      parseFor({ ...beat('place', [orbit, 'One two']), seq: 0, atMs: 0, firedCueMs: [0] }),
      parseFor({ ...beat('run', [{ kind: 'runSimulation', target: 'orbit', action: 'play' }, 'One ', { kind: 'runSimulation', target: 'orbit', action: 'seek', to: 3 }, 'two']), seq: 1, atMs: 1000, firedCueMs: [0, 200] }),
      parseFor({ seq: 2, atMs: 2000, kind: 'studentActed', action: { action: 'rewound', turnId: 't1', toBeat: 'run' } }),
      parseFor({ ...beat('again', [{ kind: 'runSimulation', target: 'orbit', action: 'play' }, 'One two']), seq: 3, atMs: 3000, firedCueMs: [0] }),
    ];
    const getFrameAt = (atMs: number) => getSceneFrame(rebuildBoard(log, atMs, catalog).elements.get(elementId('orbit')) as BoardElement, atMs);
    const moments = [1100, 1200, 2500, 3500, 3700];
    const forward = moments.map(getFrameAt);
    const backward = [...moments].reverse().map(getFrameAt).reverse();
    expect(backward).toEqual(forward);
    const getAngle = (frame: unknown) => Number((frame as { moonAngle: number }).moonAngle.toFixed(6));
    expect(forward.map(getAngle)).toEqual([0.1, 3, 0, 0.5, 0.7].map((seconds) => getAngle(scene.getFrame(seconds))));
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
