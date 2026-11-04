import { inference, llm, type stt, voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { TURN_TIMINGS } from './turn-rule.ts';
import type { EarsEvent } from './live-session.ts';

/** The SDK drops a turn while a reply is active unless it has this many words. The SDK never speaks here, so this is a guard and nothing depends on it. */
const MORE_WORDS_THAN_ANY_TURN = 9999;

export const EARS_SETTINGS = {
  ttsTextTransforms: null,
  aecWarmupDuration: null,
  userAwayTimeout: null,
  useTtsAlignedTranscript: false,
  record: false,
  closeOnDisconnect: false,
  endpointing: { minDelay: TURN_TIMINGS.reactionFloorMs, maxDelay: TURN_TIMINGS.turnCapMs },
  interruption: { mode: 'vad', minWords: MORE_WORDS_THAN_ANY_TURN, resumeFalseInterruption: false },
} as const;

export const VAD_SETTINGS = { minSilenceDuration: 250 };

export interface Ears {
  setTurnCap(ms: number): void;
  close(): Promise<void>;
}

export interface EarsOptions {
  room: Room;
  transcriber: stt.STT;
  vad: inference.VAD;
  onEvent(event: EarsEvent): void;
}

class EarsAgent extends voice.Agent {
  readonly #onEvent: (event: EarsEvent) => void;

  constructor(onEvent: (event: EarsEvent) => void) {
    super({ instructions: 'Only listens. The tutor speaks through its own voice line.' });
    this.#onEvent = onEvent;
  }

  // The SDK has decided the student finished. Throwing stops it replying, so its speech handles never race the rule.
  override async onUserTurnCompleted(_chatContext: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
    this.#onEvent({ type: 'turnDecided', text: newMessage.textContent ?? '' });
    throw new voice.StopResponse();
  }
}

// The SDK's part of the session: the room's audio in, the voice detector, the transcript, and the turn detector. It never speaks, so all voice goes through one line.
export async function startEars({ room, transcriber, vad, onEvent }: EarsOptions): Promise<Ears> {
  const session = new voice.AgentSession({
    stt: transcriber,
    vad,
    ttsTextTransforms: EARS_SETTINGS.ttsTextTransforms,
    aecWarmupDuration: EARS_SETTINGS.aecWarmupDuration,
    userAwayTimeout: EARS_SETTINGS.userAwayTimeout,
    useTtsAlignedTranscript: EARS_SETTINGS.useTtsAlignedTranscript,
    turnHandling: {
      turnDetection: new inference.TurnDetector({ version: 'v1-mini' }),
      endpointing: { ...EARS_SETTINGS.endpointing },
      interruption: { ...EARS_SETTINGS.interruption },
      preemptiveGeneration: { enabled: false },
    },
  });
  session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
    if (event.newState === 'speaking') onEvent({ type: 'voiceStarted' });
    if (event.oldState === 'speaking') onEvent({ type: 'voiceEnded' });
  });
  session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => onEvent({ type: 'words', text: event.transcript, isFinal: event.isFinal }));
  await session.start({
    agent: new EarsAgent(onEvent),
    room,
    inputOptions: { closeOnDisconnect: EARS_SETTINGS.closeOnDisconnect },
    outputOptions: { audioEnabled: false, transcriptionEnabled: false },
    record: EARS_SETTINGS.record,
  });
  return {
    setTurnCap: (ms) => session.updateOptions({ turnHandling: { endpointing: { maxDelay: ms } } }),
    close: () => session.close(),
  };
}
