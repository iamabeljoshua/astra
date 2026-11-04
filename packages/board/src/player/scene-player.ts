import type { AgentMessage, BeatEnding, BeatId, BrowserMessage, Cue, FrozenFrame, TimedWord, TurnId } from '@astra/contracts';
import type { AudioClock, ClockReading, TurnClock } from './audio-clock.ts';
import { type BoardOperation, getBeatOperations, type PlayedBeatView } from './board-operations.ts';
import { type BoardState, getBoardAt, getFrozenFrames } from './board-state.ts';
import type { SceneCatalog } from './scene.ts';

export type OutputLevel = 'full' | 'lowered' | 'silent';

export interface FiredCue {
  turnId: TurnId;
  beatId: BeatId;
  atWord: number;
  firedAtMs: number;
  positionMs: number;
  wordStartMs: number;
}

export interface ScenePlayerOptions {
  clock: AudioClock;
  /** Names this page's clock, so the agent keeps a reloaded page's reports apart from the last page's. */
  clockId?: string;
  send(message: BrowserMessage): void;
  setOutputLevel(level: OutputLevel): void;
  catalog?: SceneCatalog;
  onCueFired?(cue: FiredCue): void;
}

export interface ScenePlayer {
  receive(message: AgentMessage): void;
  tick(): void;
  /** Mutes and freezes as a stop would, for a browser that has lost the agent and cannot wait to be told. */
  freeze(): void;
  getBoard(atMs: number): BoardState;
  /** Puts what the student just did on the board, so the page shows it before any message leaves. */
  addStudentOperations(operations: readonly BoardOperation[]): void;
  getNowMs(): number;
  getOperations(): BoardOperation[];
  /** The words heard so far this turn, on the same clock as the board. */
  getCaption(): string;
  /** The same words, with those already known and not yet heard, so a caption can follow each word as it plays. */
  getCaptionWords(): { heard: string[]; coming: string[] };
}

interface PlayingBeat {
  id: BeatId;
  cues: Cue[];
  firedCueMs: number[];
  /** Word starts are on the turn's timeline. Holes wait for a late message. */
  words: TimedWord[];
  wordCount: number | null;
  expectsReply: boolean;
  playedWords: number;
  startedAtMs: number | null;
  isQuestionHeard: boolean;
  ending: BeatEnding | null;
  durationMs: number;
  frozen: FrozenFrame[];
}

type StartedBeat = PlayingBeat & { startedAtMs: number };

type TurnPhase = 'playing' | 'frozen';

interface PlayingTurn {
  id: TurnId;
  phase: TurnPhase;
  clock: TurnClock;
  beats: PlayingBeat[];
}

/** A word this far past its time with no sound was heard or lost, so it stops waiting. */
const SILENT_WORD_LIMIT_MS = 1000;

const isStarted = (beat: PlayingBeat): beat is StartedBeat => beat.startedAtMs !== null;

const sortByTime = (operations: BoardOperation[]) => operations.sort((first, second) => first.atMs - second.atMs);

function createBeat(id: BeatId): PlayingBeat {
  return { id, cues: [], firedCueMs: [], words: [], wordCount: null, expectsReply: false, playedWords: 0, startedAtMs: null, isQuestionHeard: false, ending: null, durationMs: 0, frozen: [] };
}

// Plays what the agent sends against the audio the student hears, and reports what really happened, which becomes the log.
export function createScenePlayer({ clock, clockId = 'page', send, setOutputLevel, catalog, onCueFired }: ScenePlayerOptions): ScenePlayer {
  let turn: PlayingTurn | null = null;
  let levelOnceOldAudioHasGone: OutputLevel | null = null;
  const operationsOfOldTurns: BoardOperation[] = [];
  const seenTurnIds = new Set<TurnId>();

  const openOutput = () => {
    if (levelOnceOldAudioHasGone === null || turn?.clock.isOldAudioArriving()) return;
    setOutputLevel(levelOnceOldAudioHasGone);
    levelOnceOldAudioHasGone = null;
  };

  // A turn's message can land while the last turn's cut audio is still arriving, and the gain is all that keeps that audio from the student.
  const setTurnLevel = (level: OutputLevel) => {
    levelOnceOldAudioHasGone = level;
    openOutput();
  };

  // A word time that never arrived takes the time of the word before it, because the contract has no hole and a report must not be refused for one.
  const getBeatRelativeWordStarts = (beat: PlayingBeat): number[] => {
    const firstKnownMs = beat.words.find((word) => word !== undefined)?.startMs ?? 0;
    let lastKnownMs = firstKnownMs;
    return Array.from(beat.words, (word) => {
      lastKnownMs = word?.startMs ?? lastKnownMs;
      return Math.max(0, Math.round(lastKnownMs - firstKnownMs));
    });
  };

  const getBeatView = (beat: StartedBeat): PlayedBeatView => ({
    atMs: beat.startedAtMs,
    cues: beat.cues,
    wordStartsMs: getBeatRelativeWordStarts(beat),
    firedCueMs: beat.firedCueMs,
    ending: beat.ending,
    durationMs: beat.durationMs,
    frozen: beat.frozen,
  });

  const getTurnOperations = (playing: PlayingTurn): BoardOperation[] => playing.beats.filter(isStarted).flatMap((beat) => getBeatOperations(getBeatView(beat)));

  const getOperations = () => sortByTime([...operationsOfOldTurns, ...(turn ? getTurnOperations(turn) : [])]);

  const reportBeat = (playing: PlayingTurn, beat: PlayingBeat, ending: BeatEnding, durationMs: number) => {
    const browserMs = Math.round(clock.getNowMs());
    const wordStartsMs = getBeatRelativeWordStarts(beat);
    beat.ending = ending;
    beat.durationMs = Math.max(0, Math.round(durationMs), wordStartsMs[beat.playedWords - 1] ?? 0);
    send({
      type: 'played',
      turnId: playing.id,
      beatId: beat.id,
      clockId,
      browserMs,
      startedMsAgo: Math.max(0, browserMs - (beat.startedAtMs ?? browserMs)),
      wordStartsMs,
      durationMs: beat.durationMs,
      playedWords: beat.playedWords,
      firedCueMs: beat.firedCueMs,
      ending,
      frozen: beat.frozen,
    });
  };

  const hearWords = (playing: PlayingTurn, beat: PlayingBeat, reading: ClockReading) => {
    const nowMs = clock.getNowMs();
    const isWordDue = (startMs: number) => reading.positionMs >= startMs && (reading.isGateOpen || reading.positionMs - startMs > SILENT_WORD_LIMIT_MS);
    for (let word = beat.words[beat.playedWords]; word !== undefined && isWordDue(word.startMs); word = beat.words[beat.playedWords]) {
      beat.startedAtMs ??= Math.round(nowMs - (reading.positionMs - word.startMs));
      beat.playedWords += 1;
    }
    const isLastWordHeard = beat.wordCount !== null && beat.playedWords === beat.wordCount;
    if (beat.expectsReply && isLastWordHeard && !beat.isQuestionHeard) {
      beat.isQuestionHeard = true;
      send({ type: 'questionHeard', turnId: playing.id, beatId: beat.id, clockId, browserMs: Math.round(nowMs), startedMsAgo: Math.max(0, Math.round(reading.positionMs - (beat.words.at(-1)?.startMs ?? reading.positionMs))) });
    }
  };

  const fireCues = (playing: PlayingTurn, beat: PlayingBeat, reading: ClockReading) => {
    const nowMs = clock.getNowMs();
    for (let cue = beat.cues[beat.firedCueMs.length]; cue !== undefined; cue = beat.cues[beat.firedCueMs.length]) {
      const wordStartMs = beat.words[cue.atWord]?.startMs;
      if (wordStartMs === undefined || cue.atWord >= beat.playedWords || beat.startedAtMs === null) return;
      beat.firedCueMs.push(Math.max(0, Math.round(nowMs - beat.startedAtMs)));
      onCueFired?.({ turnId: playing.id, beatId: beat.id, atWord: cue.atWord, firedAtMs: nowMs, positionMs: reading.positionMs, wordStartMs });
    }
  };

  const finishBeats = (playing: PlayingTurn, isAudioOver = () => !playing.clock.isSounding()) => {
    playing.beats.forEach((beat, index) => {
      if (beat.ending !== null || beat.startedAtMs === null) return;
      const nextStartedAtMs = playing.beats[index + 1]?.startedAtMs ?? null;
      if (beat.wordCount === null || beat.playedWords !== beat.wordCount) return;
      if (nextStartedAtMs !== null) reportBeat(playing, beat, 'finished', nextStartedAtMs - beat.startedAtMs);
      else if (isAudioOver()) {
        reportBeat(playing, beat, 'finished', clock.getNowMs() - beat.startedAtMs);
        clock.markTurnAudioOver();
      }
    });
  };

  const tick = () => {
    openOutput();
    if (turn?.phase !== 'playing') return;
    const reading = turn.clock.read();
    if (reading === null) return;
    for (const beat of turn.beats) {
      hearWords(turn, beat, reading);
      fireCues(turn, beat, reading);
    }
    finishBeats(turn);
  };

  const cutTurn = (playing: PlayingTurn) => {
    tick();
    playing.phase = 'frozen';
    const nowMs = Math.round(clock.getNowMs());
    const frames = getFrozenFrames(getBoardAt(getOperations(), nowMs, catalog), nowMs);
    const openBeats = playing.beats.filter((beat) => beat.ending === null);
    const cutBeat = openBeats.filter(isStarted).at(-1);
    for (const beat of openBeats) {
      if (beat === cutBeat) beat.frozen = frames;
      reportBeat(playing, beat, 'interrupted', beat.startedAtMs === null ? 0 : nowMs - beat.startedAtMs);
    }
    if (!cutBeat && frames.length > 0) {
      operationsOfOldTurns.push({ kind: 'freeze', atMs: nowMs, frames });
      send({ type: 'boardFrozen', turnId: playing.id, clockId, browserMs: nowMs, startedMsAgo: 0, frozen: frames });
    }
    clock.markTurnAudioOver();
  };

  const stop = (playing: PlayingTurn) => {
    levelOnceOldAudioHasGone = null;
    setOutputLevel('silent');
    cutTurn(playing);
    clock.markTurnStopped();
  };

  // The agent starts a turn only once the last one's audio has gone, so an open beat here lost its end, and nothing else would ever report it.
  const closeTurn = (playing: PlayingTurn) => {
    const isOpen = () => playing.phase === 'playing' && playing.beats.some((beat) => beat.ending === null);
    if (!isOpen()) return;
    tick();
    finishBeats(playing, () => true);
    if (isOpen()) cutTurn(playing);
  };

  const startTurn = (turnId: TurnId) => {
    if (turn) {
      closeTurn(turn);
      operationsOfOldTurns.push(...getTurnOperations(turn));
    }
    turn = { id: turnId, phase: 'playing', clock: clock.startTurn(), beats: [] };
    setTurnLevel('full');
  };

  clock.onAudioEnded(tick);

  const getBeat = (playing: PlayingTurn, beatId: BeatId) => {
    const known = playing.beats.find((beat) => beat.id === beatId);
    if (known) return known;
    const created = createBeat(beatId);
    playing.beats.push(created);
    return created;
  };

  const receiveForTurn = (playing: PlayingTurn, message: AgentMessage) => {
    switch (message.type) {
      case 'cue':
        getBeat(playing, message.beatId).cues.push({ atWord: message.atWord, command: message.command });
        return;
      case 'words': {
        const beat = getBeat(playing, message.beatId);
        message.words.forEach((word, index) => {
          beat.words[message.firstWord + index] = word;
        });
        playing.clock.noteWordTimes(playing.beats[0]?.words[0]?.startMs ?? 0, beat.words.at(-1)?.startMs ?? 0);
        return;
      }
      case 'beatClosed': {
        const beat = getBeat(playing, message.beatId);
        beat.wordCount = message.wordCount;
        beat.expectsReply = message.expectsReply;
        return;
      }
      case 'yield':
        setTurnLevel(message.isYielding ? 'lowered' : 'full');
        return;
      case 'audioGap':
        playing.clock.addGap(message);
        return;
      case 'stop':
        stop(playing);
    }
  };

  const freeze = () => {
    if (turn?.phase === 'playing') stop(turn);
  };

  return {
    tick,
    freeze,
    getNowMs: () => clock.getNowMs(),
    getOperations,
    getCaption: () => (turn ? turn.beats.flatMap((beat) => beat.words.slice(0, beat.playedWords).map((word) => word.text)).join(' ') : ''),
    getCaptionWords() {
      const beats = turn?.beats ?? [];
      const isFrozen = turn?.phase === 'frozen';
      return {
        heard: beats.flatMap((beat) => beat.words.slice(0, beat.playedWords).map((word) => word.text)),
        coming: isFrozen ? [] : beats.flatMap((beat) => beat.words.slice(beat.playedWords).flatMap((word) => (word ? [word.text] : []))),
      };
    },
    getBoard: (atMs) => getBoardAt(getOperations(), atMs, catalog),
    addStudentOperations(operations) {
      operationsOfOldTurns.push(...operations);
    },
    receive(message) {
      // Reliable messages can reach the browser again across a rejoin, and a second start of a turn would report it as unheard and fire its cues again.
      if (message.type === 'turnStarted') {
        if (seenTurnIds.has(message.turnId)) return;
        seenTurnIds.add(message.turnId);
        return startTurn(message.turnId);
      }
      if ('turnId' in message && turn?.phase === 'playing' && message.turnId === turn.id) receiveForTurn(turn, message);
    },
  };
}
