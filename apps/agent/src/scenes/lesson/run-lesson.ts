import { AudioSource, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, type ElementId, getResumeScript, parseBeat, type PlayReport, SCENE_TOPIC, type SceneAgentMessage, type TurnId } from '@astra/contracts';
import { createSessionLog } from '../../live/session-log.ts';
import { speakTurn } from '../../live/speak-turn.ts';
import { createVoiceLine } from '../../live/voice-line.ts';
import { getSceneCommand } from '../scene-desk.ts';
import type { LessonPlan, OpeningLine, StoredScene } from '../scene-types.ts';
import { getLineBeat, getSceneBeats, getSpokenBeat } from './lesson-beats.ts';
import { LAB_TOPIC, type LabMessage, LIVE_TOPIC, readLessonPacket } from './lesson-packets.ts';
import type { LessonWork } from './lesson-work.ts';
import { createStudentPresence, type PresenceChange } from './student-presence.ts';
import type { LessonVoice } from './voice-takes.ts';

const AUDIO_QUEUE_MS = 200;
const SAMPLE_RATE = 24000;
const STUDENT_IDENTITY_START = 'student-';
const REACTION = "Let's take a look.";
const NO_LESSON_LINE = 'Tell me what you would like to learn, and we can start there.';
const TROUBLE_LINE = "Something went wrong on my side, so let's carry on with what is on the board.";
const SCENE_ELEMENT = 'scene' as ElementId;

const LESSON_TIMINGS = { joinLimitMs: 30_000, rejoinLimitMs: 15_000, deviceLimitMs: 8000, loadLimitMs: 4000, lingerMs: 60_000 };
export type LessonTimings = typeof LESSON_TIMINGS;

export interface RunLessonOptions {
  url: string;
  token: string;
  work: LessonWork;
  voice: LessonVoice;
  onEvent?(name: string, detail?: object): void;
  /** Called once when this lesson starts to end, so a new page can wait for a new lesson and not land in an empty room. */
  onClosing?(): void;
  timings?: Partial<LessonTimings>;
}

interface ActiveTurn {
  id: TurnId;
  beats: readonly Beat[];
  reports: Map<BeatId, PlayReport>;
  stop(): void;
  isStopped: boolean;
}

type Wake = 'resume' | 'newPage' | 'over';

// A wake that comes while the turn is still stopping is kept for the wait that follows.
function createWakes() {
  let waiter: ((reason: Wake) => void) | null = null;
  let pending: Wake | null = null;
  return {
    send(reason: Wake) {
      if (waiter) {
        const waiting = waiter;
        waiter = null;
        waiting(reason);
      } else if (pending !== 'over') pending = reason;
    },
    wait: () =>
      new Promise<Wake>((resolve) => {
        if (pending) {
          resolve(pending);
          if (pending !== 'over') pending = null;
        } else waiter = resolve;
      }),
    clear() {
      if (pending !== 'over') pending = null;
    },
  };
}

// Stands in for M3.6's worker and M3.7's brain: it speaks a plan and takes a ready scene at each pause.
export async function runLesson({ url, token, work, voice, onEvent, onClosing, timings }: RunLessonOptions): Promise<void> {
  const { joinLimitMs, rejoinLimitMs, deviceLimitMs, loadLimitMs, lingerMs } = { ...LESSON_TIMINGS, ...timings };
  const room = new Room();
  const encoder = new TextEncoder();
  const startedAtMs = Date.now();
  const beatsByTurn = new Map<TurnId, readonly Beat[]>();
  const wakes = createWakes();
  const loads = new Map<string, (isLoaded: boolean) => void>();
  let turnCount = 0;
  let active: ActiveTurn | null = null;
  let isOver = false;
  let settleJoined: (hasJoined: boolean) => void = () => {};
  const joined = new Promise<boolean>((resolve) => {
    settleJoined = resolve;
  });
  let settleDevice: (canPlay: boolean) => void = () => {};
  const device = new Promise<boolean>((resolve) => {
    settleDevice = resolve;
  });
  let settleOver: () => void = () => {};
  const over = new Promise<null>((resolve) => {
    settleOver = () => resolve(null);
  });
  // A lesson that has ended must not hold its room open for a slow model, because a reopening page is waiting for that room to clear.
  const untilOver = <Value>(work: Promise<Value>) => Promise.race([work, over]);

  const publish = (topic: string, message: object, reliable = true) => room.localParticipant?.publishData(encoder.encode(JSON.stringify(message)), { reliable, topic })?.catch(() => {});
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

  const stopActive = () => {
    if (!active || active.isStopped) return;
    active.isStopped = true;
    active.stop();
  };

  const endLesson = () => {
    if (isOver) return;
    isOver = true;
    stopActive();
    wakes.send('over');
    settleJoined(false);
    settleDevice(false);
    settleOver();
    onClosing?.();
  };

  const onPresence = (change: PresenceChange) => {
    if (change === 'joined') settleJoined(true);
    if (change === 'away') {
      onEvent?.('studentAway');
      stopActive();
    }
    if (change === 'newPage') {
      onEvent?.('studentBack');
      stopActive();
      wakes.send('newPage');
    }
    if (change === 'gone') {
      onEvent?.('studentGone');
      endLesson();
    }
  };
  const presence = createStudentPresence({ joinLimitMs, rejoinLimitMs, onChange: onPresence });

  const onLabMessage = ({ type }: LabMessage) => {
    if (type === 'hello') void publish(LAB_TOPIC, { type: 'agentReady' });
    if (type === 'interrupt' && active && !active.isStopped) {
      stopActive();
      onEvent?.('stopped');
    }
    if (type === 'resume') wakes.send('resume');
  };

  room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    const packet = readLessonPacket(payload, topic);
    if (packet?.topic === 'lab') onLabMessage(packet.message);
    if (packet?.topic === 'scene') {
      if (packet.message.type === 'sceneDevice') settleDevice(packet.message.canPlay);
      else loads.get(packet.message.sceneId)?.(packet.message.type === 'sceneLoaded');
    }
    if (packet?.topic === 'live') {
      if (packet.message.type === 'played') active?.reports.set(packet.message.beatId, packet.message);
      log.write(packet.message);
    }
  });
  const isStudent = ({ identity }: { identity: string }) => identity.startsWith(STUDENT_IDENTITY_START);
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    if (isStudent(participant) && participant.sid) presence.onJoin(participant.sid);
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    if (isStudent(participant) && participant.sid) presence.onLeave(participant.sid);
  });
  room.on(RoomEvent.Disconnected, endLesson);

  await room.connect(url, token, { autoSubscribe: false, dynacast: false });
  for (const participant of room.remoteParticipants.values()) if (isStudent(participant) && participant.sid) presence.onJoin(participant.sid);
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
    active = null;
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

  // A new page has none of the old page's board or words, so it gets each unfinished beat whole.
  const getUnfinishedBeats = (turn: ActiveTurn): Beat[] => turn.beats.filter((beat) => turn.reports.get(beat.id)?.ending !== 'finished');

  const speak = async (beats: readonly Beat[], prepareNewPage?: () => Promise<boolean>): Promise<void> => {
    let remaining = beats;
    wakes.clear();
    while (!isOver && remaining.length > 0) {
      if (presence.getState() === 'away') {
        const reason = await wakes.wait();
        if (reason === 'newPage' && prepareNewPage && !(await prepareNewPage())) return;
        continue;
      }
      const turn = await speakOnce(remaining);
      if (!turn.isStopped) return;
      const reason = await wakes.wait();
      if (reason === 'over') return;
      if (reason === 'newPage' && prepareNewPage && !(await prepareNewPage())) return;
      remaining = reason === 'newPage' ? getUnfinishedBeats(turn) : getRestOfTurn(turn);
    }
  };

  const loadInBrowser = (scene: StoredScene): Promise<boolean> =>
    new Promise((resolve) => {
      loads.set(scene.id, resolve);
      setTimeout(() => resolve(false), loadLimitMs);
      void publish(SCENE_TOPIC, { type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds } satisfies SceneAgentMessage);
    });

  const showSceneIfReady = async (): Promise<boolean> => {
    try {
      const scene = work.desk.takeReady();
      if (!scene) return false;
      const beats = getSceneBeats({ setup: scene.plan.setup, narration: scene.narration, scene: getSceneCommand(scene, SCENE_ELEMENT) });
      if (!(await loadInBrowser(scene))) {
        onEvent?.('sceneRefused', { sceneId: scene.id });
        return false;
      }
      onEvent?.('sceneShown', { sceneId: scene.id });
      await speak(beats, () => loadInBrowser(scene));
      return true;
    } catch (error) {
      onEvent?.('sceneFailed', { error: String(error) });
      return false;
    }
  };

  const speakLine = async (id: string, spokenLine: OpeningLine) => {
    try {
      await speak([getLineBeat(id, spokenLine)]);
    } catch (error) {
      onEvent?.('lineFailed', { id, error: String(error) });
    }
  };

  let lastWords: readonly Beat[] = [];
  const speakLast = async (beat: Beat) => {
    lastWords = [beat];
    await speak(lastWords);
  };

  const teach = async (plan: LessonPlan) => {
    for (const [index, opening] of plan.opening.slice(1).entries()) {
      if (isOver) return;
      await speakLine(`line-${index + 1}`, opening);
    }
    let isShown = await showSceneIfReady();
    for (const [index, more] of (plan.more ?? []).entries()) {
      if (isShown || isOver) break;
      await speakLine(`more-${index}`, more);
      isShown = await showSceneIfReady();
    }
    onEvent?.('lessonClosing', { isShown, sceneState: work.desk.getState().kind });
    if (!isOver) await speakLast(getSpokenBeat('close', plan.close, true));
  };

  const holdOpen = async () => {
    const linger = setTimeout(endLesson, lingerMs);
    while (!isOver) {
      const reason = await wakes.wait();
      if (reason === 'newPage') await speak(lastWords);
    }
    clearTimeout(linger);
  };

  const runScript = async () => {
    const deviceLimit = setTimeout(() => settleDevice(false), deviceLimitMs);
    const canPlay = await device;
    clearTimeout(deviceLimit);
    if (isOver) return;
    onEvent?.('device', { canPlay });
    if (canPlay) work.desk.ask(work.request);
    else work.planWithoutScene();
    await speak([getSpokenBeat('reaction', REACTION)]);
    const firstLine = await untilOver(work.firstLine);
    onEvent?.('firstLine', { hasLine: firstLine !== null });
    if (firstLine) await speakLine('line-0', firstLine);
    const plan = await untilOver(work.plan);
    if (isOver) return;
    onEvent?.('planned', { hasPlan: plan !== null });
    await (plan ? teach(plan) : speakLast(getSpokenBeat('no-lesson', NO_LESSON_LINE)));
  };

  try {
    if (await joined) await runScript();
  } catch (error) {
    onEvent?.('teachFailed', { error: String(error) });
    if (!isOver) await speakLast(getSpokenBeat('trouble', TROUBLE_LINE)).catch(() => {});
  }
  try {
    if (!isOver) await holdOpen();
  } finally {
    endLesson();
    presence.close();
    await source.close();
    await room.disconnect();
  }
}
