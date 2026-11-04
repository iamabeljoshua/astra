import { initializeLogger, type stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTutorVoice, TUTOR_VOICE_ID } from '../src/providers/choose.ts';
import { makeElevenLabsVoice } from '../src/providers/elevenlabs.ts';
import { makeMuseTranscriber, MUSE_MODEL, type MuseTimings } from '../src/providers/meta.ts';
import { makeRenderedVoice } from '../src/providers/rendered-voice.ts';
import { renderTone } from '../src/providers/fakes.ts';
import { type FakeWire, startFakeElevenLabsWire } from './fake-elevenlabs-wire.ts';
import { type FakeMuseWire, startFakeMuseWire } from './fake-muse-wire.ts';
import { getTranscriberProblems, getVoiceProblems, hearVoice } from './provider-suite.ts';

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
    expect(await getVoiceProblems(makeRenderedVoice({ name: 'rendered', render: renderTone }))).toEqual([]);
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

describe('the Muse adapter', () => {
  const SILENCE_MS = 40;
  let muse: FakeMuseWire | null = null;

  afterEach(async () => {
    await muse?.close();
    muse = null;
  });

  const makeFrame = (level = 8000) => new AudioFrame(Int16Array.from({ length: 2400 }, (_, index) => (index % 2 === 0 ? level : -level)), 24000, 1, 2400);

  async function makeAdapter(timings: Partial<MuseTimings> = {}, handshakeMs = 0) {
    muse = await startFakeMuseWire({ handshakeMs });
    return makeMuseTranscriber({ apiKey: 'fake', webSocketFactory: (url, options) => (muse as FakeMuseWire).makeSocket(url, options), timings });
  }

  async function consume(stream: stt.SpeechStream) {
    const events: stt.SpeechEvent[] = [];
    void (async () => {
      for await (const event of stream) events.push(event);
    })();
    return events;
  }

  it('passes the transcriber suite on a fake of its wire', async () => {
    expect(await getTranscriberProblems(await makeAdapter())).toEqual([]);
  });

  it('pins the Standard Model by name, and leaves keywords off', async () => {
    const transcriber = (await makeAdapter()).makeStt();
    const stream = transcriber.stream();
    stream.pushFrame(makeFrame());
    await delay(150);
    stream.close();
    await transcriber.close();
    expect(MUSE_MODEL).toBe('muse-voice-transcribe-1.0');
    expect(muse?.getHandshakes()[0]?.model).toBe(MUSE_MODEL);
    expect(muse?.getHandshakes()[0]?.keywords).toBeUndefined();
  });

  it('opens no session for a student with no microphone, because a typed lesson sends Muse nothing', async () => {
    const transcriber = (await makeAdapter()).makeStt();
    const stream = transcriber.stream();
    await delay(150);
    stream.close();
    await transcriber.close();
    expect(muse?.getConnectionCount()).toBe(0);
  });

  it('drops frames until Muse answers, because the plugin paces from its first packet and queued frames would stay late for the whole session', async () => {
    const transcriber = (await makeAdapter({}, 300)).makeStt();
    const stream = transcriber.stream();
    await consume(stream);
    for (let frame = 0; frame < 6; frame += 1) {
      stream.pushFrame(makeFrame());
      await delay(40);
    }
    await delay(150);
    stream.close();
    await transcriber.close();
    expect(muse?.getBytesHeard()).toBe(0);
  });

  it('pads silence when frames stop, because no frames means no final and Muse closes at 16 s', async () => {
    const transcriber = (await makeAdapter({ padAfterMs: SILENCE_MS })).makeStt();
    const stream = transcriber.stream();
    await consume(stream);
    stream.pushFrame(makeFrame());
    await delay(150);
    const heardBefore = muse?.getBytesHeard() ?? 0;
    await delay(400);
    expect(muse?.getBytesHeard() ?? 0).toBeGreaterThan(heardBefore);
    stream.close();
    await transcriber.close();
  });

  it('opens a new session before the cap, and keeps the words flowing', async () => {
    const transcriber = (await makeAdapter({ rotateAfterMs: 100, rotateByMs: 150 })).makeStt();
    const stream = transcriber.stream();
    await consume(stream);
    for (let frame = 0; frame < 12; frame += 1) {
      stream.pushFrame(makeFrame());
      await delay(30);
    }
    stream.close();
    await transcriber.close();
    expect(muse?.getConnectionCount()).toBeGreaterThanOrEqual(2);
  });

  it('opens a new session after Muse closes one, and raises no error the session would end on', async () => {
    const transcriber = (await makeAdapter({ retryAfterMs: 20 })).makeStt();
    const errors: unknown[] = [];
    transcriber.on('error', (error) => errors.push(error));
    const stream = transcriber.stream();
    await consume(stream);
    stream.pushFrame(makeFrame());
    await delay(100);
    muse?.closeAll(1008);
    await delay(100);
    for (let frame = 0; frame < 3; frame += 1) {
      stream.pushFrame(makeFrame());
      await delay(30);
    }
    stream.close();
    await transcriber.close();
    expect(muse?.getConnectionCount()).toBe(2);
    expect(errors).toEqual([]);
  });
});
