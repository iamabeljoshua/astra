import { AudioSource, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, type ElementId, getResumeScript, parseBeat, parseBrowserMessage, parseSceneBrowserMessage, type PlayReport, SCENE_TOPIC, type SceneAgentMessage, type TurnId } from '@astra/contracts';
import { createSessionLog } from '../../live/session-log.ts';
import { speakTurn } from '../../live/speak-turn.ts';
import { createVoiceLine } from '../../live/voice-line.ts';
import { getSceneCommand } from '../scene-desk.ts';
import type { LessonPlan, StoredScene } from '../scene-types.ts';
import { getLineBeat, getSceneBeats, getSpokenBeat } from './lesson-beats.ts';
import type { LessonWork } from './lesson-work.ts';
import type { LessonVoice } from './voice-takes.ts';

const LIVE_TOPIC = 'astra.live';
const LAB_TOPIC = 'astra.lab';
const AUDIO_QUEUE_MS = 200;
const SAMPLE_RATE = 24000;
const DEVICE_LIMIT_MS = 8000;
const LOAD_LIMIT_MS = 4000;
const REACTION = "Let's take a look.";
const NO_LESSON_LINE = 'Tell me what you would like to learn, and we can start there.';
const SCENE_ELEMENT = 'scene' as ElementId;

export interface RunLessonOptions {
  url: string;
  token: string;
  work: LessonWork;
  voice: LessonVoice;
  onEvent?(name: string, detail?: object): void;
}

interface ActiveTurn {
  id: TurnId;
  beats: readonly Beat[];
  reports: Map<BeatId, PlayReport>;
  stop(): void;
  isStopped: boolean;
}

// The stand-in for M3.6's worker and M3.7's brain: it speaks a plan on the real clock and takes a ready scene at each pause. Words and the board never wait on the desk.
export async function runLesson({ url, token, work, voice, onEvent }: RunLessonOptions): Promise<void> {
  const room = new Room();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const startedAtMs = Date.now();
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  let turnCount = 0;
  let active: ActiveTurn | null = null;
  let isOver = false;
  let onResume: () => void = () => {};
  let finishLesson: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finishLesson = resolve;
  });
  let settleDevice: (canPlay: boolean) => void = () => {};
  const device = new Promise<boolean>((resolve) => {
    settleDevice = resolve;
    setTimeout(() => resolve(false), DEVICE_LIMIT_MS);
  });
  const loads = new Map<string, (isLoaded: boolean) => void>();

  const publish = (topic: string, message: object, reliable = true) => room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable, topic });
  const messenger = {
    send: (message: AgentMessage) => void publish(LIVE_TOPIC, message),
    sendOnBothChannels(message: AgentMessage) {
      void publish(LIVE_TOPIC, message);
      void publish(LIVE_TOPIC, message, false);
    },
  };
  const log = createSessionLog({
    getNowMs: () => Date.now() - startedAtMs,
    getBeat: (turnId, beatId) => beatsByTurn.get(turnId)?.find((beat) => beat.id === beatId),
    onWritten: (event) => void publish(LAB_TOPIC, { type: 'logEvent', event }),
  });

  const onLabMessage = (message: { type?: string }) => {
    if (message.type === 'hello') void publish(LAB_TOPIC, { type: 'agentReady' });
    if (message.type === 'interrupt' && active && !active.isStopped) {
      active.isStopped = true;
      active.stop();
      onEvent?.('stopped');
    }
    if (message.type === 'resume') onResume();
  };

  const onSceneMessage = (value: unknown) => {
    const parsed = parseSceneBrowserMessage(value);
    if (!parsed.ok) return;
    if (parsed.value.type === 'sceneDevice') settleDevice(parsed.value.canPlay);
    else loads.get(parsed.value.sceneId)?.(parsed.value.type === 'sceneLoaded');
  };

  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    const value: unknown = JSON.parse(decoder.decode(payload));
    if (topic === LAB_TOPIC) onLabMessage(value as { type?: string });
    if (topic === SCENE_TOPIC) onSceneMessage(value);
    if (topic !== LIVE_TOPIC) return;
    const parsed = parseBrowserMessage(value);
    if (!parsed.ok) return;
    if (parsed.value.type === 'played') active?.reports.set(parsed.value.beatId, parsed.value);
    log.write(parsed.value);
  });
  room.on(RoomEvent.ParticipantDisconnected, () => {
    isOver = true;
    active?.stop();
    onResume();
    finishLesson();
  });

  await room.connect(url, token, { autoSubscribe: false, dynacast: false });
  const source = new AudioSource(SAMPLE_RATE, 1, AUDIO_QUEUE_MS);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant?.publishTrack(LocalAudioTrack.createAudioTrack('tutor-voice', source), options);
  const line = createVoiceLine(source);

  const speakOnce = async (beats: readonly Beat[]): Promise<ActiveTurn> => {
    const id = `turn-${(turnCount += 1)}` as TurnId;
    beatsByTurn.set(id, beats);
    const turnVoice = voice.forTurn(beats);
    const spoken = speakTurn({
      voice: turnVoice.tts,
      line,
      messenger,
      turnId: id,
      beats,
      onFrameCaptured: ({ frame }) => turnVoice.onFrame?.(frame),
      onWords: ({ words }) => turnVoice.onWords?.(words),
    });
    const turn: ActiveTurn = { id, beats, reports: new Map(), stop: () => spoken.stop(), isStopped: false };
    active = turn;
    await spoken.finished;
    if (!turn.isStopped) turnVoice.save?.();
    return turn;
  };

  const getRestOfTurn = (turn: ActiveTurn): Beat[] =>
    turn.beats.flatMap((beat) => {
      const report = turn.reports.get(beat.id);
      if (!report) return [beat];
      if (report.ending === 'finished') return [];
      const fromWord = Math.max(report.playedWords - 1, 0);
      const parsed = parseBeat({ id: `${beat.id}-r${turnCount}`, script: getResumeScript(beat, { fromWord, firedCues: report.firedCueMs.length, frozen: report.frozen }), expectsReply: beat.expectsReply });
      return parsed.ok ? [parsed.value] : [];
    });

  const speak = async (beats: readonly Beat[]): Promise<void> => {
    let remaining = beats;
    while (!isOver && remaining.length > 0) {
      const turn = await speakOnce(remaining);
      if (!turn.isStopped) return;
      await new Promise<void>((resolve) => {
        onResume = resolve;
      });
      remaining = getRestOfTurn(turn);
    }
  };

  const loadInBrowser = (scene: StoredScene): Promise<boolean> =>
    new Promise((resolve) => {
      loads.set(scene.id, resolve);
      setTimeout(() => resolve(false), LOAD_LIMIT_MS);
      void publish(SCENE_TOPIC, { type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds } satisfies SceneAgentMessage);
    });

  // A pause is a turn's end. A ready scene plays here, set up in words first, and anything else keeps the lesson moving on the plain board.
  const showSceneIfReady = async (plan: LessonPlan): Promise<boolean> => {
    const scene = work.desk.takeReady();
    if (!scene) return false;
    if (!(await loadInBrowser(scene))) {
      onEvent?.('sceneRefused', { sceneId: scene.id });
      return false;
    }
    onEvent?.('sceneShown', { sceneId: scene.id });
    await speak(getSceneBeats({ setup: plan.setup, narration: scene.narration, scene: getSceneCommand(scene, SCENE_ELEMENT) }));
    return true;
  };

  const teach = async (plan: LessonPlan) => {
    for (const [index, opening] of plan.opening.slice(1).entries()) {
      if (isOver) return;
      await speak([getLineBeat(`line-${index + 1}`, opening)]);
    }
    let isShown = await showSceneIfReady(plan);
    for (const [index, more] of (plan.more ?? []).entries()) {
      if (isShown || isOver) break;
      await speak([getLineBeat(`more-${index}`, more)]);
      isShown = await showSceneIfReady(plan);
    }
    onEvent?.('lessonClosing', { isShown, sceneState: work.desk.getState().kind });
    if (!isOver) await speak([getSpokenBeat('close', plan.close, true)]);
  };

  const canPlay = await device;
  onEvent?.('device', { canPlay });
  if (canPlay) work.desk.ask(work.request);
  else work.planWithoutScene();
  await speak([getSpokenBeat('reaction', REACTION)]);
  const firstLine = await work.firstLine;
  onEvent?.('firstLine', { hasLine: firstLine !== null });
  if (firstLine) await speak([getLineBeat('line-0', firstLine)]);
  const plan = await work.plan;
  onEvent?.('planned', { hasPlan: plan !== null });
  await (plan ? teach(plan) : speak([getSpokenBeat('no-lesson', NO_LESSON_LINE)]));
  await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 60_000))]);
  await source.close();
  await room.disconnect();
}
