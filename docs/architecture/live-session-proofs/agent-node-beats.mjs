import { cli, defineAgent, inference, llm, ServerOptions, tts, USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { BeatTextReader } from './beat-text-reader.mjs';
import { createPlayoutTracker } from './clock-rule.mjs';
import { ACTIVE } from './providers/choose.ts';
import { makeFakeModel } from './providers/fakes.ts';
import { connectTurnRule, INTERRUPTION_SETTINGS } from './turn-wiring.mjs';

const LLM_TTFT_MS = Number(process.env.FAKE_LLM_TTFT_MS ?? 0);
const FLUSH_REASONS = { chosen: ['command', 'firstWords', 'beatEnd'], beatEnd: ['beatEnd'], none: [] }[process.env.BEAT_FLUSH ?? 'chosen'];
const LIVE_TOPIC = 'astra.live';

const DRAWING = { kind: 'drawing', id: 'court', name: 'hoop-side' };
const SIMULATION = { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.81 } };
const SHOT = { kind: 'simulate', id: 'shot', simulation: SIMULATION, over: 'court' };
const FOCUS = { kind: 'focus', target: 'shot.ball' };
const COMMAND_BYTES = [
  { kind: 'plot', id: 'p', expression: '(x-1)*(x+1)*(x+2)', domain: [-3, 3] },
  { kind: 'writeMath', id: 'm', tex: 'a^{*} \\cdot b^{*} = c' },
  { kind: 'code', id: 'c', language: 'python', source: 'total = fs[i](x) + gs[j](y)' },
  { kind: 'text', id: 't', text: 'about ~~5~~ 6' },
];
const COMMAND_BYTES_TEXT = `Look ${JSON.stringify(COMMAND_BYTES[0])}at this *really* neat ${JSON.stringify(COMMAND_BYTES[1])}curve and ${JSON.stringify(COMMAND_BYTES[2])}this code and ${JSON.stringify(COMMAND_BYTES[3])}this note.
`;
const SAMPLE_TEXT = `You said you play ${JSON.stringify(DRAWING)}point guard, so let's use your ${JSON.stringify(SHOT)}jump shot.
Once the ${JSON.stringify(FOCUS)}ball leaves your hand, what's still pushing it toward the hoop?
`;
const MODEL = makeFakeModel({ name: 'fake', text: process.env.MODEL_TEXT_KIND === 'bytes' ? COMMAND_BYTES_TEXT : SAMPLE_TEXT, firstTextMs: LLM_TTFT_MS });

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ source: 'agent', sdk: 'node', event, at: Date.now(), ...fields })}\n`);
}

function getWordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

class NeverCalledLLM extends llm.LLM {
  label() {
    return 'never-called';
  }
  chat() {
    throw new Error('llmNode replaces the model in this proof');
  }
}

class BeatAgent extends voice.Agent {
  constructor(options, publish) {
    super(options);
    this.publish = publish;
  }

  async llmNode() {
    log('llm_node_started');
    const cancel = new AbortController();
    const events = MODEL.stream({ instructions: 'proof', turns: [] }, cancel.signal);
    return new ReadableStream({
      async start(controller) {
        let isFirst = true;
        for await (const event of events) {
          if (event.kind !== 'text') continue;
          if (isFirst) log('first_fragment');
          isFirst = false;
          controller.enqueue(event.text);
        }
        controller.close();
      },
      cancel: () => cancel.abort(),
    });
  }

  // The SDK starts this only once a turn is confirmed, so a speculative reply that is thrown away never reaches the room.
  async ttsNode(text) {
    const publish = this.publish;
    const modelText = text.getReader();
    const voiceStream = this.getActivityOrThrow().tts.stream();
    const tracker = createPlayoutTracker({ onRanDry: ({ atMs }) => publish({ type: 'audioGap', atMs }) });
    const readModelText = async () => {
      log('tts_node_started');
      let wordsInEarlierBeats = 0;
      let isFirstWord = true;
      const reader = new BeatTextReader({
        onText: (words) => {
          if (isFirstWord) log('first_word_to_tts');
          isFirstWord = false;
          voiceStream.pushText(words);
        },
        onFlush: (reason) => {
          if (FLUSH_REASONS.includes(reason)) voiceStream.flush();
        },
        onCommand: (command, atWord) => {
          log('cue_sent', { atWord: wordsInEarlierBeats + atWord, kind: command.kind });
          publish({ type: 'cue', atWord: wordsInEarlierBeats + atWord, command });
        },
        onBadCommand: (problem) => log('bad_command', { problem }),
        onBeatEnd: ({ wordCount, expectsReply }) => {
          log('beat_end', { wordCount, expectsReply });
          wordsInEarlierBeats += wordCount;
        },
      });
      for (;;) {
        const { done, value } = await modelText.read();
        if (done) break;
        if (typeof value === 'string') reader.push(value);
        if (reader.isTurnOver) {
          modelText.cancel();
          break;
        }
      }
      reader.finish();
      log('model_finished', { words: wordsInEarlierBeats });
      voiceStream.endInput();
    };
    return new ReadableStream({
      async start(controller) {
        readModelText();
        let isFirstFrame = true;
        for await (const chunk of voiceStream) {
          if (chunk === tts.SynthesizeStream.END_OF_STREAM) break;
          if (isFirstFrame) log('first_tts_frame');
          isFirstFrame = false;
          const gap = tracker.onFrame(Date.now(), (chunk.frame.samplesPerChannel / chunk.frame.sampleRate) * 1000);
          if (gap) publish({ type: 'audioGap', ...gap });
          if (chunk.timedTranscripts?.length) {
            chunk.frame.userdata[USERDATA_TIMED_TRANSCRIPT] = chunk.timedTranscripts;
            publish({ type: 'wordTimes', words: chunk.timedTranscripts.map((word) => ({ text: word.text.trim(), startMs: Math.round(word.startTime * 1000) })) });
          }
          controller.enqueue(chunk.frame);
        }
        tracker.close();
        controller.close();
      },
      // The SDK can cut a reply it already started, and the browser has to hear about it.
      cancel() {
        tracker.close();
        log('reply_cut', { via: 'ttsNode' });
        publish({ type: 'stop', at: Date.now() });
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
    const publish = (message, reliable = true) => ctx.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable, topic: LIVE_TOPIC });
    const session = new voice.AgentSession({
      llm: new NeverCalledLLM(),
      stt: ACTIVE.transcriber.makeStt(),
      tts: ACTIVE.voice.makeTts(),
      vad: new inference.VAD({}),
      useTtsAlignedTranscript: true,
      aecWarmupDuration: null,
      // The SDK's markdown filter runs before ttsNode, so it would edit commands. The reader cleans speech instead.
      ttsTextTransforms: process.env.TTS_TRANSFORMS === 'sdk-default' ? ['filter_markdown', 'filter_emoji'] : null,
      turnHandling: {
        turnDetection: new inference.TurnDetector({ version: 'v1-mini' }),
        endpointing: { minDelay: Number(process.env.EP_MIN_MS ?? 300), maxDelay: Number(process.env.EP_MAX_MS ?? 1000) },
        interruption: INTERRUPTION_SETTINGS,
        preemptiveGeneration: { enabled: process.env.PREEMPT === '1' },
      },
    });
    for (const eventName of [voice.AgentSessionEventTypes.AgentStateChanged, voice.AgentSessionEventTypes.UserStateChanged]) {
      session.on(eventName, (event) => log(eventName, { oldState: event.oldState, newState: event.newState }));
    }
    // Once ttsNode has drained, its cancel never runs, though audio may still be queued, so the interrupted item covers that tail.
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.role !== 'assistant' || !item.interrupted) return;
      log('reply_cut', { via: 'interrupted item' });
      publish({ type: 'stop', at: Date.now() });
    });
    connectTurnRule({ session, room: ctx.room, topic: LIVE_TOPIC, publish, publishStop: () => publish({ type: 'stop', at: Date.now() }), log, onResume: () => log('policy_resume') });
    await session.start({ agent: new BeatAgent({ instructions: 'proof' }, publish), room: ctx.room, record: false, outputOptions: { transcriptionEnabled: process.env.SDK_TRANSCRIPT === '1' } });
    log('session_started');
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), numIdleProcesses: 1, port: Number(process.env.AGENT_WORKER_PORT ?? 8081) }));
