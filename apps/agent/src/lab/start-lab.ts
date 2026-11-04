import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { initializeLogger } from '@livekit/agents';
import { AccessToken } from 'livekit-server-sdk';
import { makeTutorVoice } from '../providers/choose.ts';
import { makeRenderedVoice } from '../providers/fakes.ts';
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

function pickVoice() {
  if (args.stored) {
    const stored = JSON.parse(readFileSync(args.stored, 'utf8')) as { sampleRate: number; base64: string; words: { text: string; startMs: number }[] };
    const bytes = Buffer.from(stored.base64, 'base64');
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
    return makeRenderedVoice({ name: 'stored', render: () => ({ pcm, sampleRate: stored.sampleRate, words: stored.words }) });
  }
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
