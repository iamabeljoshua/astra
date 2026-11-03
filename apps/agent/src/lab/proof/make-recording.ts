import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GRAPH_RATE = 48000;
const LAST_FRAME_SECONDS = 1;

interface RecordingInputs {
  screencast: { epochMs: number; data: string }[];
  epochAtGraphZeroMs: number;
  rate: number;
  outputFirstFrame: number;
}

function readInputs(folder: string): RecordingInputs {
  const page = JSON.parse(readFileSync(join(folder, 'page.json'), 'utf8')) as { clockMap: { epochAtGraphZeroMs: number } };
  const taps = JSON.parse(readFileSync(join(folder, 'taps.json'), 'utf8')) as { rate: number; outputFirstFrame: number };
  return { screencast: JSON.parse(readFileSync(join(folder, 'screencast.json'), 'utf8')), epochAtGraphZeroMs: page.clockMap.epochAtGraphZeroMs, rate: taps.rate, outputFirstFrame: taps.outputFirstFrame };
}

// Builds a video with the sound the page really played, placing each screen frame at the moment the browser painted it, so a person can judge the sync by eye and ear.
export function makeRecording(folder: string, outputPath: string): void {
  const { screencast, epochAtGraphZeroMs, rate, outputFirstFrame } = readInputs(folder);
  const work = mkdtempSync(join(tmpdir(), 'm3-2-recording-'));
  const list = screencast.flatMap((frame, index) => {
    const path = join(work, `${index}.jpg`);
    writeFileSync(path, Buffer.from(frame.data, 'base64'));
    const nextMs = screencast[index + 1]?.epochMs;
    const seconds = nextMs === undefined ? LAST_FRAME_SECONDS : (nextMs - frame.epochMs) / 1000;
    return [`file '${path}'`, `duration ${seconds.toFixed(4)}`];
  });
  writeFileSync(join(work, 'frames.txt'), `${list.join('\n')}\nfile '${join(work, `${screencast.length - 1}.jpg`)}'\n`);
  const audioStartEpochMs = epochAtGraphZeroMs + (outputFirstFrame / GRAPH_RATE) * 1000;
  const audioOffsetSeconds = (audioStartEpochMs - (screencast[0]?.epochMs ?? audioStartEpochMs)) / 1000;
  const audioDelayMs = Math.max(0, Math.round(audioOffsetSeconds * 1000));
  const audioTrimSeconds = Math.max(0, -audioOffsetSeconds);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', join(work, 'frames.txt'),
    '-f', 's16le', '-ar', String(rate), '-ac', '1', '-ss', audioTrimSeconds.toFixed(3), '-i', join(folder, 'output.pcm'),
    '-filter_complex', `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v];[1:a]adelay=${audioDelayMs}:all=1[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', outputPath,
  ]);
  rmSync(work, { recursive: true });
}

if (process.argv[2] && process.argv[3]) makeRecording(process.argv[2], process.argv[3]);
