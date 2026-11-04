import { tts } from '@livekit/agents';
import type { VoiceAdapter } from '../src/providers/types.ts';

const FIRST_LINE = 'Your hand, right up until it lets go.';
const SECOND_LINE = 'After that, nothing pushes it.';
const CLOSE_WITHIN_MS = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface VoiceOutput {
  words: { text: string; startSeconds: number }[];
  audioSeconds: number;
}

async function hearVoice(stream: tts.SynthesizeStream): Promise<VoiceOutput> {
  const output: VoiceOutput = { words: [], audioSeconds: 0 };
  for await (const chunk of stream) {
    if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
    output.audioSeconds += chunk.frame.samplesPerChannel / chunk.frame.sampleRate;
    for (const word of chunk.timedTranscripts ?? []) output.words.push({ text: word.text.trim(), startSeconds: word.startTime ?? 0 });
  }
  return output;
}

/** What every voice must give, or the clock does not fit. */
export async function getVoiceProblems(adapter: VoiceAdapter): Promise<string[]> {
  const problems: string[] = [];
  const voice = adapter.makeTts();
  if (!voice.capabilities.alignedTranscript) problems.push('a voice must give word times, because the board clock needs them');
  const stream = voice.stream();
  const heard = hearVoice(stream);
  stream.pushText(`${FIRST_LINE} `);
  stream.flush();
  stream.pushText(`${SECOND_LINE} `);
  stream.flush();
  stream.endInput();
  const { words, audioSeconds } = await heard;
  const expected = `${FIRST_LINE} ${SECOND_LINE}`.split(' ');
  if (words.map((word) => word.text).join(' ') !== expected.join(' ')) problems.push(`word times must name every word in order, and they named ${words.length} of ${expected.length}`);
  if (words.some((word, index) => index > 0 && word.startSeconds < (words[index - 1]?.startSeconds ?? 0))) problems.push('word times must rise across a flush, on one timeline');
  if (words.some((word) => word.startSeconds > audioSeconds)) problems.push('a word time must lie inside the audio');
  if (audioSeconds === 0) problems.push('a voice must give audio');
  const cancelled = voice.stream();
  const stopped = hearVoice(cancelled);
  cancelled.pushText(`${FIRST_LINE} `);
  cancelled.flush();
  await delay(50);
  cancelled.close();
  const isTimedOut = await Promise.race([stopped.then(() => false), delay(CLOSE_WITHIN_MS).then(() => true)]);
  if (isTimedOut) problems.push(`a closed stream must end within ${CLOSE_WITHIN_MS} ms`);
  await voice.close();
  return problems;
}

export { hearVoice };
