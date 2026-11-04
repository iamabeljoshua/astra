import { initializeLogger } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTutorVoice, TUTOR_VOICE_ID } from '../src/providers/choose.ts';
import { makeElevenLabsVoice } from '../src/providers/elevenlabs.ts';
import { makeRenderedVoice } from '../src/providers/fakes.ts';
import { type FakeWire, startFakeElevenLabsWire } from './fake-elevenlabs-wire.ts';
import { getVoiceProblems, hearVoice } from './provider-suite.ts';

initializeLogger({ pretty: false, level: 'silent' });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let wire: FakeWire | null = null;

afterEach(async () => {
  await wire?.close();
  wire = null;
});

async function makeWireVoice(leadingSilenceMs = 0) {
  wire = await startFakeElevenLabsWire({ leadingSilenceMs });
  return makeElevenLabsVoice({ name: 'wire', apiKey: 'fake', voiceId: 'fake-voice', baseURL: wire.baseURL });
}

describe('the voice suite', () => {
  it('passes the rendered fake', async () => {
    expect(await getVoiceProblems(makeRenderedVoice({ name: 'rendered' }))).toEqual([]);
  });

  it('passes the ElevenLabs adapter on a fake of its wire', async () => {
    expect(await getVoiceProblems(await makeWireVoice())).toEqual([]);
  });
});

describe('the tutor voice', () => {
  it('is Chris, on Flash until Abel says otherwise', async () => {
    wire = await startFakeElevenLabsWire();
    const voice = makeTutorVoice({ apiKey: 'fake' }).makeTts();
    expect(TUTOR_VOICE_ID).toBe('iP95p4xoKVk53GoZ742B');
    expect(voice.model).toBe('eleven_flash_v2_5');
    await voice.close();
  });
});

describe('the ElevenLabs adapter', () => {
  it('asks for a rate LiveKit can frame in whole samples, because 22050 Hz plays slow by 2.27 ms a second', async () => {
    const voice = (await makeWireVoice()).makeTts();
    const stream = voice.stream();
    const heard = hearVoice(stream);
    stream.pushText('One two ');
    stream.endInput();
    await heard;
    await voice.close();
    expect(wire?.getOutputFormats()).toEqual(['pcm_24000']);
    expect(voice.sampleRate % 100).toBe(0);
  });

  it('keeps word times from the first character, not the second, so no word lands early', async () => {
    const voice = (await makeWireVoice()).makeTts();
    const stream = voice.stream();
    const heard = hearVoice(stream);
    stream.pushText('One two three four five ');
    stream.endInput();
    const { words } = await heard;
    await voice.close();
    expect(words[1]?.startSeconds).toBeCloseTo(0.24, 2);
  });

  it('opens its socket before the first turn, and the first turn reuses it', async () => {
    const voice = (await makeWireVoice()).makeTts();
    voice.prewarm();
    await delay(50);
    expect(wire?.getConnectionCount()).toBe(1);
    const stream = voice.stream();
    const heard = hearVoice(stream);
    stream.pushText('Hello there ');
    stream.endInput();
    await heard;
    await voice.close();
    expect(wire?.getConnectionCount()).toBe(1);
  });

  it('drops what the vendor keeps sending after a stop, which close_context does not cancel', async () => {
    const voice = (await makeWireVoice()).makeTts();
    const stream = voice.stream();
    let framesAfterClose = 0;
    let isClosed = false;
    const reading = (async () => {
      for await (const chunk of stream) {
        if (isClosed && typeof chunk !== 'symbol') framesAfterClose += 1;
      }
    })();
    stream.pushText(`${'word '.repeat(60)}`);
    stream.flush();
    await delay(60);
    isClosed = true;
    stream.close();
    await reading;
    await delay(200);
    await voice.close();
    expect(wire?.getMessagesAfterClose()).toBeGreaterThan(0);
    expect(framesAfterClose).toBe(0);
  });
});
