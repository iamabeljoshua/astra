import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Beat, BrowserMessage, SessionEvent, TimedWord, TurnId } from '@astra/contracts';
import type { FrameNote } from '../live/speak-turn.ts';

export interface LabRecorder {
  startTurn(turnId: TurnId, beats: readonly Beat[]): void;
  noteFrame(turnId: TurnId, note: FrameNote): void;
  noteWords(turnId: TurnId, words: { atMs: number; words: TimedWord[] }): void;
  noteGap(turnId: TurnId, gap: { atMs: number; ms?: number; reportedAtMs: number }): void;
  noteStopDecided(turnId: TurnId | undefined): void;
  noteBrowserMessage(message: BrowserMessage): void;
  noteLogEvent(event: SessionEvent): void;
  noteRefused(problem: string): void;
  finishTurn(turnId: TurnId, mismatches: { ours: string; theirs: string }[]): void;
  save(extra: object): void;
}

interface TurnRecord {
  turnId: TurnId;
  startedAtMs: number;
  beats: readonly Beat[];
  firstFrameAtMs: number | null;
  firstWordsAtMs: number | null;
  audioMs: number;
  sampleRate: number;
  framesCaptured: { atMs: number; audioMs: number }[];
  words: { atMs: number; words: TimedWord[] }[];
  gaps: { atMs: number; ms?: number; reportedAtMs: number }[];
  stopDecidedAtMs: number | null;
  framesAfterStop: number;
  mismatches: { ours: string; theirs: string }[];
}

// Writes what the agent sent and when, so a proof run can compare it with what the browser heard. Holds test text only.
export function createLabRecorder(outFolder: string | null): LabRecorder {
  const turns = new Map<TurnId, TurnRecord>();
  const browserMessages: (BrowserMessage & { receivedAtMs: number })[] = [];
  const log: SessionEvent[] = [];
  const refused: string[] = [];
  if (outFolder) mkdirSync(outFolder, { recursive: true });

  const getTurn = (turnId: TurnId) => turns.get(turnId) as TurnRecord;

  return {
    startTurn(turnId, beats) {
      turns.set(turnId, { turnId, startedAtMs: Date.now(), beats, firstFrameAtMs: null, firstWordsAtMs: null, audioMs: 0, sampleRate: 0, framesCaptured: [], words: [], gaps: [], stopDecidedAtMs: null, framesAfterStop: 0, mismatches: [] });
    },
    noteFrame(turnId, { frame, capturedAtMs }) {
      const turn = getTurn(turnId);
      turn.firstFrameAtMs ??= capturedAtMs;
      turn.sampleRate = frame.sampleRate;
      turn.framesCaptured.push({ atMs: capturedAtMs, audioMs: turn.audioMs });
      turn.audioMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
      if (turn.stopDecidedAtMs !== null) turn.framesAfterStop += 1;
      if (outFolder) appendFileSync(join(outFolder, `${turnId}.pcm`), Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength));
    },
    noteWords(turnId, words) {
      const turn = getTurn(turnId);
      turn.firstWordsAtMs ??= words.atMs;
      turn.words.push(words);
    },
    noteGap: (turnId, gap) => void getTurn(turnId).gaps.push(gap),
    noteStopDecided(turnId) {
      if (turnId) getTurn(turnId).stopDecidedAtMs = Date.now();
    },
    noteBrowserMessage: (message) => void browserMessages.push({ ...message, receivedAtMs: Date.now() }),
    noteLogEvent: (event) => void log.push(event),
    noteRefused: (problem) => void refused.push(problem),
    finishTurn(turnId, mismatches) {
      getTurn(turnId).mismatches = mismatches;
    },
    save(extra) {
      if (!outFolder) return;
      writeFileSync(join(outFolder, 'agent.json'), JSON.stringify({ ...extra, turns: [...turns.values()], browserMessages, refused }));
      writeFileSync(join(outFolder, 'session-log.json'), JSON.stringify(log, null, 1));
    },
  };
}
