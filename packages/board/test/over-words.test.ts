import { type AgentMessage, type BrowserMessage, parseSessionEvent, type SceneCommand, type SessionEvent, type TimedWord } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { describeBoard, getFrozenFrames } from '../src/player/board-state.ts';
import { rebuildBoard } from '../src/player/rebuild-board.ts';
import { beatId, createFakeAudio, elementId, type FakeAudio, turnId } from './fake-audio.ts';

const TURN = turnId('turn-1');
const BEAT = beatId('beat-1');
const SAMPLE_MS = 50;
const SIMULATION = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 6, releaseHeight: 2, gravity: 9.8 } } };
const PLAY = { kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 8 };
const SPOKEN = 'Watch it climb slower and slower until it hangs at the very top';
const BEAT_JSON = { id: 'beat-1', expectsReply: false, script: [SIMULATION, 'Watch ', PLAY, 'it climb slower and slower until it hangs at the very top'] };

const WORD_STARTS_MS = [0, 240, 460, 800, 1030, 1400, 1650, 2100, 2340, 2700, 2990, 3250, 3600];
const getTimedWord = (index: number): TimedWord => ({ text: SPOKEN.split(' ')[index] as string, startMs: WORD_STARTS_MS[index] as number });
const getWordsFrom = (firstWord: number, count: number): AgentMessage => ({ type: 'words', turnId: TURN, beatId: BEAT, firstWord, words: Array.from({ length: count }, (_, offset) => getTimedWord(firstWord + offset)) });

const cue = (atWord: number, command: unknown): AgentMessage => ({ type: 'cue', turnId: TURN, beatId: BEAT, atWord, command: command as SceneCommand });

function writeLog(audio: FakeAudio): SessionEvent[] {
  return audio.sent.flatMap((message: BrowserMessage, seq): SessionEvent[] => {
    if (message.type !== 'played') return [];
    const { turnId: reportedTurn, wordStartsMs, durationMs, playedWords, firedCueMs, cueAims, ending, frozen } = message;
    const parsed = parseSessionEvent(JSON.parse(JSON.stringify({ seq, atMs: message.browserMs - message.startedMsAgo, kind: 'beatPlayed', beat: BEAT_JSON, reportedBy: 'browser', turnId: reportedTurn, wordStartsMs, durationMs, playedWords, firedCueMs, cueAims, ending, frozen })));
    if (!parsed.ok) throw new Error(parsed.problem);
    return [parsed.value];
  });
}

/** Plays a beat whose word times land in chunks, each only just before it is heard, and notes the board on every frame as the student saw it. */
function playWithLateWordTimes({ chunk, cutAtMs }: { chunk: number; cutAtMs?: number }) {
  const audio = createFakeAudio();
  const seen: { atMs: number; board: ReturnType<typeof describeBoard> }[] = [];
  audio.receive({ type: 'turnStarted', turnId: TURN }, cue(0, SIMULATION), cue(1, PLAY), getWordsFrom(0, chunk));
  audio.startSound();
  const soundAtMs = audio.getNowMs();
  let landed = chunk;
  while (audio.getNowMs() - soundAtMs < 4200) {
    audio.advance(SAMPLE_MS);
    const heardMs = audio.getNowMs() - soundAtMs;
    if (cutAtMs !== undefined && heardMs >= cutAtMs) break;
    if (landed < WORD_STARTS_MS.length && (WORD_STARTS_MS[landed] as number) - heardMs < 150) {
      const count = Math.min(chunk, WORD_STARTS_MS.length - landed);
      audio.receive(getWordsFrom(landed, count));
      landed += count;
      if (landed === WORD_STARTS_MS.length) audio.receive({ type: 'beatClosed', turnId: TURN, beatId: BEAT, wordCount: WORD_STARTS_MS.length, expectsReply: false });
    }
    const atMs = audio.getNowMs();
    seen.push({ atMs, board: describeBoard(audio.player.getBoard(atMs), atMs) });
  }
  if (cutAtMs !== undefined) audio.receive({ type: 'stop', turnId: TURN });
  else audio.endSound();
  audio.advance(800);
  return { audio, seen, soundAtMs };
}

const getScene = (board: ReturnType<typeof describeBoard>) => board.elements.find((element) => element.id === elementId('shot'))?.sceneSeconds;

describe('a cue over words whose later word times have not landed', () => {
  it('shows the same board on every real frame as the replay does at that moment', () => {
    const { audio, seen } = playWithLateWordTimes({ chunk: 2 });
    const log = writeLog(audio);
    const differing = seen.filter(({ atMs, board }) => JSON.stringify(describeBoard(rebuildBoard(log, atMs), atMs)) !== JSON.stringify(board));
    expect(seen.length).toBeGreaterThan(50);
    expect(differing.map(({ atMs }) => atMs)).toEqual([]);
  });

  it('never jumps when new word times land, and speeds up or slows down instead', () => {
    const { seen } = playWithLateWordTimes({ chunk: 2 });
    const landing = 6 / 9.8 + Math.sqrt(36 + 2 * 9.8 * 2) / 9.8;
    const fastestStep = (landing / 800) * SAMPLE_MS * 3;
    const scenes = seen.flatMap(({ board }) => getScene(board) ?? []);
    const steps = scenes.slice(1).map((seconds, index) => seconds - (scenes[index] as number));
    expect(Math.max(...steps)).toBeLessThan(fastestStep);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
  });

  it('lands on the word once that word time is known', () => {
    const { audio, soundAtMs } = playWithLateWordTimes({ chunk: 2 });
    const log = writeLog(audio);
    const landing = 6 / 9.8 + Math.sqrt(36 + 2 * 9.8 * 2) / 9.8;
    const endWordMs = soundAtMs + (WORD_STARTS_MS[9] as number);
    const sceneAt = (atMs: number) => getScene(describeBoard(rebuildBoard(log, atMs), atMs)) as number;
    expect(sceneAt(endWordMs - 100)).toBeLessThan(landing);
    expect(sceneAt(endWordMs + 2)).toBeCloseTo(landing, 2);
  });

  it('reports nothing extra when every word time was known as the cue fired', () => {
    const audio = createFakeAudio();
    audio.receive({ type: 'turnStarted', turnId: TURN }, cue(0, SIMULATION), cue(1, PLAY), getWordsFrom(0, WORD_STARTS_MS.length), { type: 'beatClosed', turnId: TURN, beatId: BEAT, wordCount: WORD_STARTS_MS.length, expectsReply: false });
    audio.startSound();
    audio.advance(3800);
    audio.endSound();
    audio.advance(500);
    const report = audio.sent.find((message) => message.type === 'played');
    expect(report && 'cueAims' in report ? report.cueAims : undefined).toBeUndefined();
  });

  it('freezes where it was aimed, and a replay agrees to the frame', () => {
    const { audio, seen, soundAtMs } = playWithLateWordTimes({ chunk: 2, cutAtMs: 1200 });
    const log = writeLog(audio);
    const frozenAtMs = soundAtMs + 1500;
    const live = describeBoard(audio.player.getBoard(frozenAtMs), frozenAtMs);
    expect(describeBoard(rebuildBoard(log, frozenAtMs), frozenAtMs)).toEqual(live);
    expect(getFrozenFrames(audio.player.getBoard(frozenAtMs), frozenAtMs)).toEqual([]);
    expect(seen.length).toBeGreaterThan(10);
  });
});
