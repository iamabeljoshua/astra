import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { initializeLogger } from '@livekit/agents';
import { AccessToken } from 'livekit-server-sdk';
import { makeTutorVoice } from '../providers/choose.ts';
import { FAKE_SAMPLE_RATE, makeRenderedVoice, type RenderSpeech } from '../providers/fakes.ts';
import { readKey } from './keys.ts';
import { runLabAgent } from './lab-agent.ts';
import { createLabRecorder } from './lab-recorder.ts';
import { tapVendorSocket, type VendorTap } from './proof/vendor-tap.ts';

/** The local server's own development pair, which `livekit-server --dev` prints. */
const DEV_KEY = 'devkey';
const DEV_SECRET = 'secret';

const { values: args } = parseArgs({
  options: {
    fake: { type: 'boolean', default: false },
    stored: { type: 'string' },
    model: { type: 'string' },
    room: { type: 'string', default: `lab-${Date.now()}` },
    url: { type: 'string', default: 'ws://127.0.0.1:7880' },
    webUrl: { type: 'string', default: `http://127.0.0.1:${process.env.WEB_PORT ?? 5173}` },
    out: { type: 'string' },
    tap: { type: 'boolean', default: false },
  },
});

async function makeToken(identity: string): Promise<string> {
  const token = new AccessToken(DEV_KEY, DEV_SECRET, { identity, ttl: '30m' });
  token.addGrant({ room: args.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

// Each flush asks for its next words, so a stored take of a lesson plays beat by beat, as the voice sent it.
function makeStoredRender(path: string): RenderSpeech {
  const { sampleRate, base64, words } = JSON.parse(readFileSync(path, 'utf8')) as { sampleRate: number; base64: string; words: { text: string; startMs: number }[] };
  if (sampleRate !== FAKE_SAMPLE_RATE) throw new Error(`A stored take must be at ${FAKE_SAMPLE_RATE} Hz, and ${path} is at ${sampleRate}`);
  const bytes = Buffer.from(base64, 'base64');
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const toSample = (ms: number) => Math.round((ms / 1000) * sampleRate);
  let nextWord = 0;
  return (text) => {
    const count = text.split(/\s+/).filter(Boolean).length;
    if (nextWord + count > words.length) nextWord = 0;
    const firstWord = nextWord;
    nextWord += count;
    const from = firstWord === 0 ? 0 : toSample(words[firstWord]?.startMs ?? 0);
    const to = nextWord >= words.length ? pcm.length : toSample(words[nextWord]?.startMs ?? 0);
    return { pcm: pcm.subarray(from, to), sampleRate, words: words.slice(firstWord, nextWord).map((word) => ({ text: word.text, startMs: word.startMs - (from / sampleRate) * 1000 })) };
  };
}

function pickVoice() {
  if (args.stored) return makeRenderedVoice({ name: 'stored', render: makeStoredRender(args.stored) });
  if (args.fake) return makeRenderedVoice({ name: 'fake' });
  return makeTutorVoice({ model: args.model, apiKey: readKey('ELEVENLABS_API_KEY') });
}

initializeLogger({ pretty: false, level: 'warn' });
const recorder = createLabRecorder(args.out ?? null);
const tap: VendorTap | null = args.tap ? tapVendorSocket() : null;
const studentToken = await makeToken('student-browser');
console.log(`OPEN ${args.webUrl}/lab/scene-player?url=${encodeURIComponent(args.url)}&token=${studentToken}`);
const voice = pickVoice().makeTts();
await runLabAgent({ url: args.url, token: await makeToken('agent-tutor'), voice, sampleRate: voice.sampleRate, recorder });
recorder.save({ voice: args.fake ? 'fake' : args.stored ? 'stored casey' : 'casey', model: args.model ?? 'eleven_flash_v2_5', tap });
process.exit(0);
