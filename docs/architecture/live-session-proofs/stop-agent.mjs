import { cli, defineAgent, inference, llm, ServerOptions, tts, USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { RoomEvent } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { BeatTextReader } from './beat-text-reader.mjs';

const FRAGMENT_CHARACTERS = 12;
const FRAGMENT_MS = 30;
const LIVE_TOPIC = 'astra.live';
const OVERLAP_STOP_MS = 1000;
const SMALL_REACTIONS = new Set(['uh', 'huh', 'uh-huh', 'mm', 'mhm', 'hmm', 'yeah', 'yes', 'ok', 'okay', 'right']);
const c = (value) => JSON.stringify(value);
const LONG_TEXT = [
  `So let us ${c({ kind: 'drawing', id: 'court', name: 'hoop-side' })}draw the court and then ${c({ kind: 'text', id: 't1', text: 'release' })}mark the point where the ball leaves your hand on the way up.`,
  `Now ${c({ kind: 'text', id: 't2', text: 'sideways' })}look at the sideways arrow as the ball climbs and then falls back toward the hoop in a long arc.`,
  `The ${c({ kind: 'text', id: 't3', text: 'vertical' })}vertical arrow shrinks as it climbs and it reaches zero right at the very top of that arc before it flips.`,
  `Then ${c({ kind: 'text', id: 't4', text: 'flip' })}it flips to point down and it grows again all the way until the ball drops through the net below.`,
  `Nothing ${c({ kind: 'text', id: 't5', text: 'nothing' })}is pushing the ball forward any more and that is the part most people find strange when they first see it.`,
  `Gravity ${c({ kind: 'text', id: 't6', text: 'gravity' })}only pulls down so it changes the vertical arrow and it leaves the sideways arrow exactly as it was at the start.`,
  `So the ${c({ kind: 'text', id: 't7', text: 'path' })}path you see is just those two motions added together at every single moment of the flight through the air.`,
].join('\n') + '\n';
const MEDIUM_TEXT = `Right so the ${c({ kind: 'text', id: 'm1', text: 'one' })}first arrow stays the same and the ${c({ kind: 'text', id: 'm2', text: 'two' })}second arrow changes all the way up to the ${c({ kind: 'text', id: 'm3', text: 'three' })}top of the arc and back down again to the ${c({ kind: 'text', id: 'm4', text: 'four' })}hoop at the end.\n`;
const SHORT_TEXT = 'Good question.\n';

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ source: 'agent', sdk: 'node', event, at: Date.now(), ...fields })}\n`);
}

class NeverCalledLLM extends llm.LLM {
  label() { return 'never-called'; }
  chat() { throw new Error('llmNode replaces the model in this proof'); }
}

let turnCounter = 0;
class BeatAgent extends voice.Agent {
  constructor(options, publish) { super(options); this.publish = publish; }

  async llmNode(chatCtx) {
    const lastUser = chatCtx.items.filter((item) => item.role === 'user').at(-1)?.textContent ?? '';
    const text = /once the ball/i.test(lastUser) ? LONG_TEXT : /gravity/i.test(lastUser) ? MEDIUM_TEXT : SHORT_TEXT;
    this.currentReply = text === LONG_TEXT ? 'long' : text === MEDIUM_TEXT ? 'medium' : 'short';
    log('llm_node_started', { reply: this.currentReply });
    return new ReadableStream({
      async start(controller) {
        for (let offset = 0; offset < text.length; offset += FRAGMENT_CHARACTERS) {
          try { controller.enqueue(text.slice(offset, offset + FRAGMENT_CHARACTERS)); } catch { log('model_stream_closed_early', { offset }); return; }
          await new Promise((resolve) => setTimeout(resolve, FRAGMENT_MS));
        }
        log('model_wrote_everything');
        controller.close();
      },
      cancel() { log('model_cancelled'); },
    });
  }

  async ttsNode(text) {
    const publish = this.publish;
    const turnId = `t${++turnCounter}`;
    const modelText = text.getReader();
    const voiceStream = this.getActivityOrThrow().tts.stream();
    const reply = this.currentReply;
    publish({ type: 'turnStarted', turnId, reply });
    log('tts_node_started', { turnId, reply });
    const readModelText = async () => {
      let firstWord = 0;
      let beatIndex = 0;
      const reader = new BeatTextReader({
        onText: (words) => voiceStream.pushText(words),
        onFlush: () => voiceStream.flush(),
        onCommand: (command, atWord) => {
          log('cue_sent', { turnId, atWord: firstWord + atWord, kind: command.kind, id: command.id });
          publish({ type: 'cue', turnId, atWord: firstWord + atWord, command });
        },
        onBadCommand: (problem) => log('bad_command', { turnId, problem }),
        onBeatEnd: ({ script, wordCount, expectsReply }) => {
          log('beat_end', { turnId, beatId: `b${beatIndex}`, firstWord, wordCount, expectsReply, script: JSON.parse(JSON.stringify(script)) });
          beatIndex += 1;
          firstWord += wordCount;
        },
      });
      for (;;) {
        const { done, value } = await modelText.read();
        if (done) break;
        if (typeof value === 'string') reader.push(value);
      }
      reader.finish();
      log('reader_finished', { turnId, words: firstWord });
      voiceStream.endInput();
    };
    return new ReadableStream({
      async start(controller) {
        readModelText();
        for await (const chunk of voiceStream) {
          if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
          if (chunk.timedTranscripts?.length) {
            chunk.frame.userdata[USERDATA_TIMED_TRANSCRIPT] = chunk.timedTranscripts;
            publish({ type: 'wordTimes', turnId, words: chunk.timedTranscripts.map((word) => ({ text: word.text.trim(), startMs: Math.round(word.startTime * 1000) })) });
          }
          try { controller.enqueue(chunk.frame); } catch { log('audio_stream_closed_early', { turnId }); break; }
        }
        try { controller.close(); } catch { return; }
      },
      cancel() {
        log('tts_node_cancelled', { turnId });
        voiceStream.close();
        return modelText.cancel();
      },
    });
  }
}

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    log('connected', { room: ctx.room.name });
    const encoder = new TextEncoder();
    const publish = (message, reliable = true) => ctx.room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable, topic: LIVE_TOPIC });
    ctx.room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== LIVE_TOPIC || participant?.identity !== 'board') return;
      log('board_report', { report: JSON.parse(new TextDecoder().decode(payload)) });
    });
    const session = new voice.AgentSession({
      llm: new NeverCalledLLM(),
      stt: new deepgram.STT({ apiKey: 'fake', baseUrl: `ws://127.0.0.1:${process.env.FAKE_STT_PORT ?? 17802}`, mipOptOut: true }),
      tts: new cartesia.TTS({ apiKey: 'fake', baseUrl: `http://127.0.0.1:${process.env.FAKE_TTS_PORT ?? 17801}` }),
      vad: new inference.VAD({ minSilenceDuration: 250 }),
      useTtsAlignedTranscript: true,
      aecWarmupDuration: null,
      ttsTextTransforms: null,
      turnHandling: {
        turnDetection: new inference.TurnDetector({ version: 'v1-mini' }),
        endpointing: { minDelay: 300, maxDelay: 1000 },
        interruption: { mode: 'vad', minDuration: 500, minWords: 9999, falseInterruptionTimeout: 2000, resumeFalseInterruption: true },
        preemptiveGeneration: { enabled: false },
      },
    });
    for (const eventName of [voice.AgentSessionEventTypes.AgentStateChanged, voice.AgentSessionEventTypes.UserStateChanged]) {
      session.on(eventName, (event) => log(eventName, { oldState: event.oldState, newState: event.newState }));
    }
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => log('user_input_transcribed', { transcript: event.transcript, isFinal: event.isFinal }));
    let overlapTimer = null;
    let isYielding = false;
    const stopSpeaking = (reason, transcript) => {
      if (!isYielding) return;
      isYielding = false;
      clearTimeout(overlapTimer);
      log('policy_stop', { reason, transcript });
      publish({ type: 'stop', via: 'reliable', at: Date.now() }, true);
      publish({ type: 'stop', via: 'lossy', at: Date.now() }, false);
      session.interrupt();
    };
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      if (event.newState === 'speaking' && session.agentState === 'speaking') {
        isYielding = true;
        log('policy_yield');
        publish({ type: 'yield', isYielding: true, at: Date.now() });
        overlapTimer = setTimeout(() => stopSpeaking('overlap too long'), OVERLAP_STOP_MS);
      }
      if (event.newState === 'listening' && isYielding) {
        isYielding = false;
        clearTimeout(overlapTimer);
        log('policy_unyield');
        publish({ type: 'yield', isYielding: false, at: Date.now() });
      }
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (event.transcript.trim() === '') return;
      const small = event.transcript.toLowerCase().split(/\s+/).filter(Boolean).every((word) => SMALL_REACTIONS.has(word.replace(/[^a-z-]/g, '')));
      if (small) clearTimeout(overlapTimer);
      else stopSpeaking('real word', event.transcript);
    });
    await session.start({ agent: new BeatAgent({ instructions: 'proof' }, publish), room: ctx.room, inputOptions: { participantIdentity: 'student' }, outputOptions: { transcriptionEnabled: false }, record: false });
    log('recording_options', { options: session.sessionOptions.recordingOptions, recorderIO: session._recorderIO !== undefined });
    log('session_started');
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), numIdleProcesses: 1, port: Number(process.env.AGENT_WORKER_PORT ?? 8081) }));
