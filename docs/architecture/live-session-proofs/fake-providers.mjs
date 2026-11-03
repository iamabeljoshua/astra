import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const TTS_PORT = Number(process.env.FAKE_TTS_PORT ?? 17801);
const STT_PORT = Number(process.env.FAKE_STT_PORT ?? 17802);
const STT_ENDPOINT_MS = Number(process.env.FAKE_STT_ENDPOINT_MS ?? 200);
const scenarioSettings = { ttsFirstAudioMs: Number(process.env.FAKE_TTS_TTFB_MS ?? 0), transcriptDelayMs: 0, voiceStallMs: 0, voiceStallAtFlush: 0 };

const TTS_SAMPLE_RATE = 24000;
const BURST_MS = 70;
const BURST_HZ = 1000;
const BURST_AMPLITUDE = 0.5;
const HUM_AMPLITUDE = 0.05;
const WORD_MS_PER_CHARACTER = 65;
const SHORTEST_WORD_MS = 180;
const LONGEST_WORD_MS = 600;
const CHUNK_SAMPLES = 2400;

const SPEECH_RMS = 0.01;
const INTERIM_EVERY_MS = 300;
const WORDS_PER_SECOND = 3;

function getWordDurationMs(word) {
  return Math.min(LONGEST_WORD_MS, Math.max(SHORTEST_WORD_MS, word.length * WORD_MS_PER_CHARACTER));
}

function renderWord(word) {
  const sampleCount = Math.round((getWordDurationMs(word) / 1000) * TTS_SAMPLE_RATE);
  const burstSamples = Math.round((BURST_MS / 1000) * TTS_SAMPLE_RATE);
  const pcm = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) {
    const amplitude = index < burstSamples ? BURST_AMPLITUDE : HUM_AMPLITUDE;
    pcm[index] = Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * BURST_HZ * index) / TTS_SAMPLE_RATE));
  }
  return pcm;
}

function sendToContext(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function synthesize(socket, context, transcript) {
  const words = transcript.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  const startSeconds = [];
  const endSeconds = [];
  const pieces = [];
  for (const word of words) {
    const pcm = renderWord(word);
    startSeconds.push(context.cursorSeconds);
    context.cursorSeconds += pcm.length / TTS_SAMPLE_RATE;
    endSeconds.push(context.cursorSeconds);
    pieces.push(pcm);
  }
  sendToContext(socket, {
    type: 'timestamps',
    context_id: context.id,
    done: false,
    status_code: 200,
    word_timestamps: { words, start: startSeconds, end: endSeconds },
  });
  for (const pcm of pieces) {
    for (let offset = 0; offset < pcm.length; offset += CHUNK_SAMPLES) {
      const chunk = pcm.subarray(offset, offset + CHUNK_SAMPLES);
      sendToContext(socket, {
        type: 'chunk',
        context_id: context.id,
        done: false,
        status_code: 200,
        step_time: 1,
        data: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('base64'),
      });
    }
  }
}

function startFakeCartesia() {
  const server = new WebSocketServer({ port: TTS_PORT, path: '/tts/websocket' });
  server.on('connection', (socket) => {
    const contexts = new Map();
    let chain = Promise.resolve();
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const contextId = message.context_id;
      if (message.cancel) {
        contexts.delete(contextId);
        return;
      }
      if (!contexts.has(contextId)) contexts.set(contextId, { id: contextId, cursorSeconds: 0, flushes: 0 });
      const context = contexts.get(contextId);
      chain = chain.then(async () => {
        if (!contexts.has(contextId)) return;
        if (!context.spokeOnce) {
          context.spokeOnce = true;
          if (scenarioSettings.ttsFirstAudioMs > 0) await new Promise((resolve) => setTimeout(resolve, scenarioSettings.ttsFirstAudioMs));
          context.startedAt = Date.now();
        }
        context.flushes += 1;
        // Waits until what was sent has played, and then this long, so the listener's audio really runs dry.
        if (scenarioSettings.voiceStallMs > 0 && context.flushes === scenarioSettings.voiceStallAtFlush) {
          const playedUntil = context.startedAt + context.cursorSeconds * 1000;
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, playedUntil - Date.now()) + scenarioSettings.voiceStallMs));
        }
        synthesize(socket, context, message.transcript ?? '');
        if (message.continue === false) {
          sendToContext(socket, { type: 'done', context_id: contextId, done: true, status_code: 200 });
          contexts.delete(contextId);
        }
      });
    });
  });
}

function getRms(bytes) {
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += (sample / 32768) ** 2;
  return Math.sqrt(sum / samples.length);
}

function makeResults({ text, isFinal, speechFinal, startSeconds, durationSeconds, fromFinalize = false }) {
  const words = text.split(/\s+/).filter(Boolean);
  const wordSeconds = durationSeconds / Math.max(words.length, 1);
  return {
    type: 'Results',
    channel_index: [0, 1],
    duration: durationSeconds,
    start: startSeconds,
    is_final: isFinal,
    speech_final: speechFinal,
    from_finalize: fromFinalize,
    metadata: { request_id: 'fake-request' },
    channel: {
      alternatives: [
        {
          transcript: text,
          confidence: 0.99,
          words: words.map((word, index) => ({
            word: word.toLowerCase(),
            punctuated_word: word,
            start: startSeconds + index * wordSeconds,
            end: startSeconds + (index + 1) * wordSeconds,
            confidence: 0.99,
          })),
        },
      ],
    },
  };
}

// Answers with the queued script, timed only by the energy of the audio it receives.
function startFakeDeepgram() {
  const scriptQueue = [];
  const httpServer = createServer((request, response) => {
    if (request.method === 'DELETE' && request.url === '/script') {
      scriptQueue.length = 0;
      response.end('ok');
      return;
    }
    if (request.method === 'POST' && request.url === '/script') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        scriptQueue.push(JSON.parse(body).text);
        response.end('ok');
      });
      return;
    }
    if (request.method === 'GET' && request.url === '/settings') {
      response.end(JSON.stringify(scenarioSettings));
      return;
    }
    if (request.method === 'POST' && request.url === '/settings') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        Object.assign(scenarioSettings, JSON.parse(body));
        response.end('ok');
      });
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const server = new WebSocketServer({ server: httpServer });
  server.on('connection', (socket, request) => {
    const sendTranscript = (message) => {
      setTimeout(() => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      }, scenarioSettings.transcriptDelayMs);
    };
    const url = new URL(request.url, 'http://localhost');
    scenarioSettings.lastSpeechToTextQuery = url.search;
    const sampleRate = Number(url.searchParams.get('sample_rate') ?? 16000);
    let receivedSamples = 0;
    let speech = null;
    const flushFinal = (fromFinalize) => {
      if (!speech) return;
      if (speech.text === '') {
        speech = null;
        return;
      }
      const durationSeconds = speech.lastVoicedSeconds - speech.startSeconds;
      // A script starting with ~ gives interims and then no final words, as a retracted interim would.
      sendTranscript(makeResults({ text: speech.text.startsWith('~') ? '' : speech.text, isFinal: true, speechFinal: true, startSeconds: speech.startSeconds, durationSeconds, fromFinalize }));
      speech = null;
    };
    socket.on('message', (raw, isBinary) => {
      if (!isBinary) {
        const message = JSON.parse(raw.toString());
        if (message.type === 'Finalize') flushFinal(true);
        if (message.type === 'CloseStream') socket.close();
        return;
      }
      const rms = getRms(new Uint8Array(raw));
      const chunkSamples = Math.floor(raw.length / 2);
      receivedSamples += chunkSamples;
      const nowSeconds = receivedSamples / sampleRate;
      if (rms > SPEECH_RMS) {
        if (!speech) {
          speech = { startSeconds: nowSeconds, lastVoicedSeconds: nowSeconds, lastInterimSeconds: nowSeconds, text: scriptQueue.shift() ?? '' };
          socket.send(JSON.stringify({ type: 'SpeechStarted', channel: [0, 1], timestamp: nowSeconds }));
        }
        speech.lastVoicedSeconds = nowSeconds;
        if ((nowSeconds - speech.lastInterimSeconds) * 1000 >= INTERIM_EVERY_MS) {
          speech.lastInterimSeconds = nowSeconds;
          const spokenCount = Math.max(1, Math.round((nowSeconds - speech.startSeconds) * WORDS_PER_SECOND));
          const interim = speech.text.replace(/^~/, '').split(/\s+/).slice(0, spokenCount).join(' ');
          if (interim !== '') sendTranscript(makeResults({ text: interim, isFinal: false, speechFinal: false, startSeconds: speech.startSeconds, durationSeconds: nowSeconds - speech.startSeconds }));
        }
      } else if (speech && (nowSeconds - speech.lastVoicedSeconds) * 1000 >= STT_ENDPOINT_MS) {
        flushFinal(false);
      }
    });
  });
  httpServer.listen(STT_PORT);
}

startFakeCartesia();
startFakeDeepgram();
console.log(JSON.stringify({ event: 'fake_providers_ready', ttsPort: TTS_PORT, sttPort: STT_PORT }));
