import { cli, defineAgent, inference, llm, ServerOptions, voice } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { isSmallReaction } from './turn-rule.mjs';
import { connectTurnRule, INTERRUPTION_SETTINGS } from './turn-wiring.mjs';

const REPLY = process.env.AGENT_REPLY ?? 'So its sideways speed never changes. Watch this arrow as the ball climbs and then falls back toward the hoop. The sideways arrow keeps its length the whole way, and the vertical arrow shrinks, reaches zero at the top, and then flips to point down. Nothing is pushing the ball forward any more, and that is the part most people find strange at first.';
const LLM_TTFT_MS = Number(process.env.FAKE_LLM_TTFT_MS ?? 0);
const WORDS_PER_LLM_CHUNK = 3;
const FILLER_WORDS = new Set(['hmm', 'um', 'uh', 'let', 'me', 'think', 'see', 'so', 'well']);
const LIVE_TOPIC = 'astra.live';
const LLM_CHUNK_MS = 15;

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ source: 'agent', sdk: 'node', event, at: Date.now(), ...fields })}\n`);
}

function isOnlyFiller(transcript) {
  const words = transcript.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => FILLER_WORDS.has(word.replace(/[^a-z]/g, '')));
}

function readTurnDetection() {
  const mode = process.env.TURN_MODE ?? 'vad';
  if (mode === 'detector') return new inference.TurnDetector({ version: 'v1-mini' });
  return mode;
}

class NeverCalledLLM extends llm.LLM {
  label() {
    return 'never-called';
  }
  chat() {
    throw new Error('llmNode replaces the model in this proof');
  }
}

class ProofAgent extends voice.Agent {
  async llmNode() {
    log('llm_node_started');
    return new ReadableStream({
      async start(controller) {
        if (LLM_TTFT_MS > 0) await new Promise((resolve) => setTimeout(resolve, LLM_TTFT_MS));
        const words = REPLY.split(' ');
        for (let index = 0; index < words.length; index += WORDS_PER_LLM_CHUNK) {
          controller.enqueue(`${words.slice(index, index + WORDS_PER_LLM_CHUNK).join(' ')} `);
          if (index === 0) log('llm_first_text');
          await new Promise((resolve) => setTimeout(resolve, LLM_CHUNK_MS));
        }
        controller.close();
      },
    });
  }

  async transcriptionNode(text) {
    const reader = text.getReader();
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        const isTimed = typeof value === 'object' && value !== null;
        log('transcription_chunk', isTimed ? { text: value.text, startTime: value.startTime, endTime: value.endTime } : { text: value });
        controller.enqueue(value);
      },
    });
  }
}

function connectRule({ session, room }) {
  const publish = (message) => room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: LIVE_TOPIC });
  connectTurnRule({
    session,
    room,
    topic: LIVE_TOPIC,
    publish,
    publishStop: () => publish({ type: 'stop', at: Date.now() }),
    log,
    onResume: ({ playedWords }) => {
      const words = REPLY.split(' ');
      const fromWord = Math.max(playedWords - 1, 0);
      log('policy_resume', { fromWord, of: words.length });
      session.say(words.slice(fromWord).join(' '));
    },
  });
}

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    log('connected', { room: ctx.room.name });
    const session = new voice.AgentSession({
      llm: new NeverCalledLLM(),
      stt: new deepgram.STT({ apiKey: 'fake', baseUrl: `ws://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}`, mipOptOut: true }),
      tts: new cartesia.TTS({ apiKey: 'fake', baseUrl: `http://127.0.0.1:${process.env.FAKE_TTS_PORT ?? 17801}` }),
      vad: new inference.VAD({ minSilenceDuration: Number(process.env.VAD_MIN_SILENCE_MS ?? 250) }),
      useTtsAlignedTranscript: process.env.ALIGNED !== '0',
      // The SDK's default ignores the student for 3 s of the first reply and again on every rejoin.
      ...(process.env.AEC_WARMUP === 'sdk-default' ? {} : { aecWarmupDuration: null }),
      turnHandling: {
        turnDetection: readTurnDetection(),
        endpointing: { minDelay: Number(process.env.EP_MIN_MS ?? 300), maxDelay: Number(process.env.EP_MAX_MS ?? 3000) },
        interruption: process.env.POLICY
          ? INTERRUPTION_SETTINGS
          : {
              mode: 'vad',
              minDuration: Number(process.env.INT_MIN_MS ?? 500),
              minWords: Number(process.env.INT_MIN_WORDS ?? 0),
              falseInterruptionTimeout: Number(process.env.INT_FALSE_MS ?? 2000),
              resumeFalseInterruption: process.env.INT_RESUME !== '0',
            },
        preemptiveGeneration: { enabled: process.env.PREEMPT === '1', preemptiveTts: process.env.PREEMPT_TTS === '1' },
      },
    });
    for (const eventName of Object.values(voice.AgentSessionEventTypes)) {
      session.on(eventName, (event) => {
        if (eventName === 'metrics_collected' || eventName === 'session_usage_updated') return;
        const fields = {};
        if (event.oldState !== undefined) Object.assign(fields, { oldState: event.oldState, newState: event.newState });
        if (event.transcript !== undefined) Object.assign(fields, { transcript: event.transcript, isFinal: event.isFinal });
        if (event.item?.content !== undefined) Object.assign(fields, { role: event.item.role, text: event.item.textContent, interrupted: event.item.interrupted });
        if (event.resumed !== undefined) Object.assign(fields, { resumed: event.resumed });
        if (eventName === 'eot_prediction') Object.assign(fields, { probability: event.probability, threshold: event.threshold });
        log(eventName, fields);
      });
    }
    if (process.env.FILLER_WAIT_MS) {
      const fillerWait = Number(process.env.FILLER_WAIT_MS);
      const normalWait = { minDelay: Number(process.env.EP_MIN_MS), maxDelay: Number(process.env.EP_MAX_MS) };
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
        if (!event.isFinal) return;
        const endpointing = isOnlyFiller(event.transcript) ? { minDelay: fillerWait, maxDelay: fillerWait } : normalWait;
        session.updateOptions({ turnHandling: { endpointing } });
      });
    }
    if (process.env.POLICY === 'words') {
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
        if (event.transcript.trim() === '' || isSmallReaction(event.transcript)) return;
        log('policy_interrupt', { transcript: event.transcript });
        session.interrupt();
      });
    }
    if (process.env.POLICY === 'tiered') connectRule({ session, room: ctx.room });
    await session.start({ agent: new ProofAgent({ instructions: 'proof' }), room: ctx.room, record: false, inputOptions: { closeOnDisconnect: process.env.CLOSE_ON_DISCONNECT !== '0' } });
    log('session_started');
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), numIdleProcesses: 1, port: Number(process.env.AGENT_WORKER_PORT ?? 8081) }));
