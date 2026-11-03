import { cli, defineAgent, inference, llm, ServerOptions, tts, USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import { RoomEvent } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';
import { getResumeScript, parseBeat } from '../../../packages/contracts/src/index.ts';
import { BeatTextReader } from './beat-text-reader.mjs';
import { createPlayoutTracker } from './clock-rule.mjs';
import { connectTurnRule, INTERRUPTION_SETTINGS } from './turn-wiring.mjs';

const FRAGMENT_CHARACTERS = 12;
const FRAGMENT_MS = 30;
const LIVE_TOPIC = 'astra.live';
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
const QUESTION_TEXT = `So once the ${c({ kind: 'text', id: 'q1', text: 'ball' })}ball has left your hand and nothing is pushing it forward any more, what do you think is still pulling on it while it flies?\n`;
const SIMULATION = { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2 } };
const FLIGHT_TEXT = `Here is your ${c({ kind: 'simulate', id: 'shot', simulation: SIMULATION })}shot, and ${c({ kind: 'runSimulation', target: 'shot', action: 'play', until: 'landing', overWords: 22 })}watch the ball as it climbs up over the hoop and then falls back down, because its sideways speed never changes at any point along the way and that ${c({ kind: 'text', id: 'f1', text: 'same speed' })}surprises almost everybody the first time they see it happen.\n`;
const REPLIES = [
  [/once the ball/i, 'long', LONG_TEXT],
  [/gravity/i, 'medium', MEDIUM_TEXT],
  [/pulls on it/i, 'question', QUESTION_TEXT],
  [/watch my shot/i, 'flight', FLIGHT_TEXT],
];

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ source: 'agent', sdk: 'node', event, at: Date.now(), ...fields })}\n`);
}

class NeverCalledLLM extends llm.LLM {
  label() { return 'never-called'; }
  chat() { throw new Error('llmNode replaces the model in this proof'); }
}

let turnCounter = 0;
class BeatAgent extends voice.Agent {
  constructor(options, publish) { super(options); this.publish = publish; this.beats = []; this.board = new Map(); }

  takeReplyName() {
    const reply = this.nextReplyName ?? this.currentReply;
    this.nextReplyName = null;
    return reply;
  }

  // The cut beat from the cut word, with what was moving started again, and then the beats after it.
  getResumeText({ playedWords, frozen, firedCues }) {
    const cut = this.beats.find((beat) => playedWords <= beat.firstWord + beat.wordCount) ?? this.beats.at(-1);
    const parsed = parseBeat({ id: cut.beatId, script: cut.script, expectsReply: cut.expectsReply });
    if (!parsed.ok) throw new Error(parsed.problem);
    const fromWord = Math.max(playedWords - cut.firstWord - 1, 0);
    const script = getResumeScript(parsed.value, { fromWord, firedCues, frozen });
    const render = (parts) => parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('');
    const later = this.beats.slice(this.beats.indexOf(cut) + 1).map((beat) => render(beat.script));
    return { fromWord, text: [render(script), ...later].join('\n') + '\n' };
  }

  async llmNode(chatCtx) {
    const lastUser = chatCtx.items.filter((item) => item.role === 'user').at(-1)?.textContent ?? '';
    const [, reply, text] = REPLIES.find(([pattern]) => pattern.test(lastUser)) ?? [null, 'short', SHORT_TEXT];
    this.currentReply = reply;
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
    const reply = this.takeReplyName();
    const tracker = createPlayoutTracker({ onRanDry: ({ atMs }) => publish({ type: 'audioGap', turnId, atMs }) });
    publish({ type: 'turnStarted', turnId, reply });
    log('tts_node_started', { turnId, reply });
    this.beats = [];
    const readModelText = async () => {
      let firstWord = 0;
      let beatIndex = 0;
      const reader = new BeatTextReader({
        onText: (words) => voiceStream.pushText(words),
        onFlush: () => voiceStream.flush(),
        board: this.board,
        onCommand: (command, atWord) => {
          this.board = reader.board;
          log('cue_sent', { turnId, atWord: firstWord + atWord, kind: command.kind, id: command.id, action: command.action, until: command.until, overWords: command.overWords });
          publish({ type: 'cue', turnId, atWord: firstWord + atWord, command });
        },
        onBadCommand: (problem) => log('bad_command', { turnId, problem }),
        onBeatEnd: ({ script, wordCount, expectsReply }) => {
          const beat = { turnId, beatId: `b${beatIndex}`, firstWord, wordCount, expectsReply, script: JSON.parse(JSON.stringify(script)) };
          log('beat_end', beat);
          publish({ type: 'beatClosed', turnId, beatId: beat.beatId, firstWord, wordCount, expectsReply });
          this.beats.push(beat);
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
          const gap = tracker.onFrame(Date.now(), (chunk.frame.samplesPerChannel / chunk.frame.sampleRate) * 1000);
          if (gap) {
            log('audio_gap', { turnId, ...gap });
            publish({ type: 'audioGap', turnId, ...gap });
          }
          if (chunk.timedTranscripts?.length) {
            chunk.frame.userdata[USERDATA_TIMED_TRANSCRIPT] = chunk.timedTranscripts;
            publish({ type: 'wordTimes', turnId, words: chunk.timedTranscripts.map((word) => ({ text: word.text.trim(), startMs: Math.round(word.startTime * 1000) })) });
          }
          try { controller.enqueue(chunk.frame); } catch { log('audio_stream_closed_early', { turnId }); break; }
        }
        tracker.close();
        try { controller.close(); } catch { return; }
      },
      cancel() {
        log('tts_node_cancelled', { turnId });
        tracker.close();
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
        interruption: INTERRUPTION_SETTINGS,
        preemptiveGeneration: { enabled: false },
      },
    });
    for (const eventName of [voice.AgentSessionEventTypes.AgentStateChanged, voice.AgentSessionEventTypes.UserStateChanged]) {
      session.on(eventName, (event) => log(eventName, { oldState: event.oldState, newState: event.newState }));
    }
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => log('user_input_transcribed', { transcript: event.transcript, isFinal: event.isFinal }));
    connectTurnRule({
      session,
      room: ctx.room,
      topic: LIVE_TOPIC,
      publish,
      publishStop: () => {
        publish({ type: 'stop', via: 'reliable', at: Date.now() }, true);
        publish({ type: 'stop', via: 'lossy', at: Date.now() }, false);
      },
      log,
      onResume: ({ playedWords, report }) => {
        const { fromWord, text } = agent.getResumeText({ playedWords, frozen: report?.frozen ?? [], firedCues: report?.fired?.length ?? 0 });
        log('policy_resume', { playedWords, fromWord, frozen: report?.frozen, text });
        agent.nextReplyName = 'resumed';
        session.say(text);
      },
    });
    const agent = new BeatAgent({ instructions: 'proof' }, publish);
    await session.start({ agent, room: ctx.room, inputOptions: { participantIdentity: 'student' }, outputOptions: { transcriptionEnabled: false }, record: false });
    log('recording_options', { options: session.sessionOptions.recordingOptions, recorderIO: session._recorderIO !== undefined });
    log('session_started');
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), numIdleProcesses: 1, port: Number(process.env.AGENT_WORKER_PORT ?? 8081) }));
