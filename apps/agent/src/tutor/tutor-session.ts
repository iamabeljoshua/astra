import type { tts } from '@livekit/agents';
import type { AgentMessage, Beat, BrowserMessage, TurnId } from '@astra/contracts';
import { getTakeBeat, makeTakeVoice, type StoredTake, type TakePicker, type TakeUse } from '../live/reactions.ts';
import { createSessionLog } from '../live/session-log.ts';
import { type SpokenTurn, speakTurn, type TurnMessenger } from '../live/speak-turn.ts';
import { getSteadyNowMs, type VoiceLine } from '../live/voice-line.ts';
import { cleanStudentText, type TraceNote, type TutorBrain } from './brain.ts';

export interface TutorSessionOptions {
  messenger: TurnMessenger;
  line: VoiceLine;
  voice: tts.TTS;
  brain: TutorBrain;
  takes: TakePicker;
  allTakes: readonly StoredTake[];
  trace?: TraceNote;
  getNowMs?(): number;
}

export interface TutorSession {
  onBrowser(message: BrowserMessage): void;
  greet(): void;
  close(): Promise<void>;
}

interface Speaking {
  turnId: TurnId;
  spoken: SpokenTurn;
  beats: Beat[];
  isOver: boolean;
}

async function* withFirst(first: Beat, rest: AsyncIterator<Beat>): AsyncGenerator<Beat> {
  yield first;
  try {
    for (let next = await rest.next(); !next.done; next = await rest.next()) yield next.value;
  } finally {
    void rest.return?.();
  }
}

// A typed lesson: code reacts first from a stored take, the model's beats follow on the same line, and a new message stops whatever is playing. M3.6's live session replaces this when speech lands, calling the same brain.
export function createTutorSession({ messenger, line, voice, brain, takes, allTakes, trace = () => {}, getNowMs = getSteadyNowMs }: TutorSessionOptions): TutorSession {
  const startedAtMs = getNowMs();
  const takeVoices = new Map(allTakes.map((take) => [take.id, makeTakeVoice(take).makeTts()]));
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  let turnCount = 0;
  let reaction: Speaking | null = null;
  let reply: Speaking | null = null;
  let greeting: Speaking | null = null;
  let thought: AbortController | null = null;
  let hasGreeted = false;

  const log = createSessionLog({
    getNowMs: () => getNowMs() - startedAtMs,
    getBeat: (turnId, beatId) => beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId),
    onRefused: (problem) => trace('reportRefused', { problem }),
  });

  const speak = (voiceToUse: tts.TTS, beats: Iterable<Beat> | AsyncIterable<Beat>, kind: string): Speaking => {
    turnCount += 1;
    const turnId = `turn-${turnCount}` as TurnId;
    const speakingBeats: Beat[] = [];
    beatsByTurn.set(turnId, speakingBeats);
    trace('turnStarted', { turnId, kind });
    let hasSound = false;
    const speaking: Speaking = {
      turnId,
      beats: speakingBeats,
      isOver: false,
      spoken: speakTurn({
        voice: voiceToUse,
        line,
        messenger,
        turnId,
        beats,
        getNowMs,
        onBeatStarted: (beat) => speakingBeats.push(beat),
        onFirstAudioRead: (atMs) => trace('firstAudioRead', { turnId, kind, atMs }),
        onFrameCaptured({ capturedAtMs }) {
          if (!hasSound) trace('firstFrameCaptured', { turnId, kind, atMs: capturedAtMs });
          hasSound = true;
        },
        onGap: (gap) => trace('audioGap', { turnId, ...gap }),
      }),
    };
    void speaking.spoken.finished.then(() => {
      speaking.isOver = true;
      trace('turnFinished', { turnId, kind });
    });
    return speaking;
  };

  const speakTake = (use: TakeUse): Speaking | null => {
    const take = takes.next(use);
    const takeVoice = take && takeVoices.get(take.id);
    return take && takeVoice ? speak(takeVoice, [getTakeBeat(take, `${take.use}-${turnCount + 1}`)], take.use) : null;
  };

  const stopEverything = () => {
    thought?.abort();
    thought = null;
    reaction?.spoken.stop();
    if (reply && !reply.isOver) {
      brain.noteCut(reply.spoken.getWordsSent());
      reply.spoken.stop();
    }
    reaction = null;
    reply = null;
  };

  // The line opens for the reply only when its first beat exists, so nothing the tutor says is queued behind a silent model.
  const think = async (text: string) => {
    const controller = new AbortController();
    thought = controller;
    messenger.send({ type: 'thinking', isThinking: true });
    const beats = brain.reply({ text }, controller.signal)[Symbol.asyncIterator]();
    const first = await beats.next();
    if (controller.signal.aborted) return void beats.return?.();
    messenger.send({ type: 'thinking', isThinking: false });
    if (first.done) return;
    trace('firstBeatReady', { atMs: getNowMs() });
    reply = speak(voice, withFirst(first.value, beats), 'reply');
  };

  const onTyped = (typed: string) => {
    const text = cleanStudentText(typed);
    if (text === '') return;
    trace('typedReceived', { atMs: getNowMs(), characters: text.length });
    messenger.send({ type: 'heard' } satisfies AgentMessage);
    stopEverything();
    // The greeting is the first thing code says, so a question sent as the page opens waits behind it instead of cutting it off.
    greet();
    if (!greeting || greeting.isOver) reaction = speakTake('reaction');
    think(text).catch((error: unknown) => trace('thoughtFailed', { problem: String(error) }));
  };

  function greet() {
    if (hasGreeted) return;
    hasGreeted = true;
    greeting = speakTake('greeting');
  }

  return {
    greet,
    onBrowser(message) {
      if (message.type !== 'pulse' && message.type !== 'typed') log.write(message);
      if (message.type === 'typed') onTyped(message.text);
      if (message.type === 'played') {
        brain.notePlayed({ beatId: message.beatId, playedWords: message.playedWords, firedCues: message.firedCueMs.length, isFinished: message.ending === 'finished' });
        trace('played', { turnId: message.turnId, beatId: message.beatId, ending: message.ending, playedWords: message.playedWords, firedCues: message.firedCueMs.length });
      }
    },
    async close() {
      stopEverything();
      greeting?.spoken.stop();
      await Promise.all([...takeVoices.values()].map((takeVoice) => takeVoice.close()));
    },
  };
}
