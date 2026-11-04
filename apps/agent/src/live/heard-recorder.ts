import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioFrame } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, getBeatText, getCues, getSpokenWords, type TurnId } from '@astra/contracts';

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

export interface HeardTurn {
  addBeat(beat: Beat): void;
  addMessage(message: AgentMessage): void;
  addFrame(frame: AudioFrame): void;
  finish(wordMismatches: readonly { ours: string; theirs: string }[]): void;
}

export type RecordTurn = (turn: { turnId: TurnId; kind: string }) => HeardTurn;

function toWav(frames: readonly AudioFrame[]): Buffer {
  const sampleRate = frames[0]?.sampleRate ?? 0;
  const dataBytes = frames.reduce((sum, frame) => sum + frame.data.length * BYTES_PER_SAMPLE, 0);
  const wav = Buffer.alloc(WAV_HEADER_BYTES + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(WAV_HEADER_BYTES - 8 + dataBytes, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28);
  wav.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  wav.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  let offset = WAV_HEADER_BYTES;
  for (const frame of frames) {
    for (const sample of frame.data) {
      wav.writeInt16LE(sample, offset);
      offset += BYTES_PER_SAMPLE;
    }
  }
  return wav;
}

export function createHeardRecorder(folder: string, sessionName: string): RecordTurn {
  mkdirSync(folder, { recursive: true });
  return ({ turnId, kind }) => {
    const beats: { beatId: string; sentToVoice: string; commands: string[] }[] = [];
    const messages: AgentMessage[] = [];
    const frames: AudioFrame[] = [];
    return {
      addBeat(beat) {
        beats.push({ beatId: beat.id, sentToVoice: getSpokenWords(getBeatText(beat)).join(' '), commands: getCues(beat).map(({ command }) => command.kind) });
      },
      addMessage: (message) => void messages.push(message),
      addFrame: (frame) => void frames.push(frame),
      finish(wordMismatches) {
        const stem = join(folder, `${sessionName}-${turnId}`);
        writeFileSync(`${stem}.json`, JSON.stringify({ turnId, kind, beats, wordMismatches, messages }, null, 1));
        if (frames.length > 0) writeFileSync(`${stem}.wav`, toWav(frames));
      },
    };
  };
}
