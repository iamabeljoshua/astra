import { AudioFrame, AudioSource, AudioStream, dispose, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 48000;
const FRAME_MS = 10;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const MIC_QUEUE_MS = 30;
const AUDIBLE_RMS = 0.01;
const BURST_RMS = 0.2;
const QUIET_FRAMES_BEFORE_BURST = 2;
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';

export const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function readSpeech(name) {
  const bytes = readFileSync(join(HERE, 'speech', `${name}.wav`));
  const dataStart = bytes.indexOf('data') + 8;
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset + dataStart, bytes.byteOffset + bytes.byteLength));
}

// The `say` files have silence at both ends, so the true end of speech is the last voiced sample.
function getVoicedRange(samples) {
  const threshold = 0.01 * 32768;
  let first = 0;
  let last = samples.length - 1;
  while (first < last && Math.abs(samples[first]) < threshold) first += 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  return { first, last };
}

function getRms(samples) {
  let sum = 0;
  for (const sample of samples) sum += (sample / 32768) ** 2;
  return Math.sqrt(sum / samples.length);
}

async function makeToken(room, identity) {
  const token = new AccessToken('devkey', 'secret', { identity, ttl: '10m' });
  token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return token.toJwt();
}

export async function clearScript() {
  await fetch(`http://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}/script`, { method: 'DELETE' });
}

export async function setFakeSettings(settings) {
  await fetch(`http://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}/settings`, { method: 'POST', body: JSON.stringify(settings) });
}

export async function getFakeSettings() {
  const response = await fetch(`http://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}/settings`);
  return response.json();
}

export async function setScript(text) {
  await fetch(`http://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}/script`, { method: 'POST', body: JSON.stringify({ text }) });
}

export class Student {
  log = [];
  replyWordsStartAt = 0;
  micSamples = null;
  micCursor = 0;
  running = true;
  audio = { burstCount: 0, quietFrames: QUIET_FRAMES_BEFORE_BURST, lastAudibleAt: 0, firstAudibleAt: 0, isAudible: false };

  startCountingReplyWords() {
    this.replyWordsStartAt = this.audio.burstCount;
  }

  note(event, fields = {}) {
    this.log.push({ source: 'student', event, at: Date.now(), ...fields });
  }

  async join(roomName) {
    this.roomName = roomName;
    this.running = true;
    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === TrackKind.KIND_AUDIO) this.listen(track, participant.identity);
    });
    this.room.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
      if (changed['lk.agent.state']) this.note('agent_state_attribute', { from: participant.identity, state: changed['lk.agent.state'] });
    });
    this.room.registerTextStreamHandler('lk.transcription', async (reader, participant) => {
      const attributes = reader.info?.attributes ?? {};
      try {
        for await (const chunk of reader) {
          this.note('transcription_stream_chunk', { from: participant.identity, text: chunk, segmentId: attributes['lk.segment_id'], final: attributes['lk.transcription_final'] });
        }
      } catch (error) {
        this.note('transcription_stream_closed', { reason: error.message });
      }
    });
    this.room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      const text = new TextDecoder().decode(payload);
      this.note('data_received', { topic, text });
      if (topic === 'astra.live' && JSON.parse(text).type === 'stop') {
        const report = { type: 'played', playedWords: this.audio.burstCount - this.replyWordsStartAt };
        this.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(report)), { reliable: true, topic });
      }
    });
    await this.room.connect(LIVEKIT_URL, await makeToken(roomName, 'student'), { autoSubscribe: true, dynacast: false });
    this.source = new AudioSource(SAMPLE_RATE, 1, MIC_QUEUE_MS);
    const track = LocalAudioTrack.createAudioTrack('mic', this.source);
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    await this.room.localParticipant.publishTrack(track, options);
    this.pumpMicrophone();
    this.note('joined', { room: roomName });
  }

  async pumpMicrophone() {
    while (this.running) {
      const samples = new Int16Array(FRAME_SAMPLES);
      if (this.micSamples) {
        const piece = this.micSamples.subarray(this.micCursor, this.micCursor + FRAME_SAMPLES);
        samples.set(piece);
        const nextCursor = this.micCursor + FRAME_SAMPLES;
        if (this.micCursor <= this.micVoiced.first && nextCursor > this.micVoiced.first) {
          this.voicedStartedAt = Date.now();
          this.note('speech_started', { speech: this.micName });
        }
        if (this.micCursor <= this.micVoiced.last && nextCursor > this.micVoiced.last) {
          this.voicedEndedAt = Date.now();
          this.note('speech_ended', { speech: this.micName });
        }
        this.micCursor = nextCursor;
        if (this.micCursor >= this.micSamples.length) {
          this.micSamples = null;
          this.micCursor = 0;
          this.resolveSpeech?.();
        }
      }
      await this.source.captureFrame(new AudioFrame(samples, SAMPLE_RATE, 1, FRAME_SAMPLES));
    }
  }

  say(name) {
    this.micName = name;
    this.micCursor = 0;
    const samples = readSpeech(name);
    this.micVoiced = getVoicedRange(samples);
    this.micSamples = samples;
    return new Promise((resolve) => {
      this.resolveSpeech = resolve;
    });
  }

  async listen(track, identity) {
    this.note('agent_audio_subscribed', { from: identity });
    const stream = new AudioStream(track, { sampleRate: SAMPLE_RATE, numChannels: 1, frameSizeMs: FRAME_MS });
    for await (const frame of stream) {
      if (!this.running) return;
      this.onAgentFrame(frame.data);
    }
  }

  onAgentFrame(samples) {
    const rms = getRms(samples);
    const now = Date.now();
    const state = this.audio;
    if (rms >= AUDIBLE_RMS) {
      if (!state.isAudible) {
        state.isAudible = true;
        state.firstAudibleAt = now;
        this.note('agent_audio_started');
      }
      state.lastAudibleAt = now;
    } else if (state.isAudible && now - state.lastAudibleAt >= 100) {
      state.isAudible = false;
      this.note('agent_audio_stopped', { lastAudibleAt: state.lastAudibleAt });
    }
    if (rms >= BURST_RMS) {
      if (state.quietFrames >= QUIET_FRAMES_BEFORE_BURST) {
        state.burstCount += 1;
        this.note('word_burst', { index: state.burstCount - 1 });
      }
      state.quietFrames = 0;
    } else {
      state.quietFrames += 1;
    }
  }

  async waitForEvent(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.log.find(predicate);
      if (found) return found;
      await delay(5);
    }
    return null;
  }

  async leave() {
    this.running = false;
    await this.room.disconnect();
  }
}

export async function disposeNative() {
  await dispose();
}
