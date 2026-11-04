import { AudioSource, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { type AgentMessage, type Beat, type BeatId, type ElementId, getResumeScript, parseBeat, type PlayReport, SCENE_TOPIC, type SceneAgentMessage, type TurnId } from '@astra/contracts';
import { createSessionLog } from '../../live/session-log.ts';
import { speakTurn } from '../../live/speak-turn.ts';
import { createVoiceLine } from '../../live/voice-line.ts';
import { getSceneCommand } from '../scene-desk.ts';
import { getTakeBeats } from '../narration.ts';
import type { LessonPlan, NoLesson, OpeningLine, StoredScene } from '../scene-types.ts';
import { getLineBeats, getSceneBeats, getSpokenBeats } from './lesson-beats.ts';
import { LAB_TOPIC, type LabMessage, LIVE_TOPIC, readLessonPacket } from './lesson-packets.ts';
import type { LessonWork } from './lesson-work.ts';
import { createStudentPresence, type PresenceChange } from './student-presence.ts';
import type { LessonVoice } from './voice-takes.ts';

const AUDIO_QUEUE_MS = 200;
const SAMPLE_RATE = 24000;
const STUDENT_IDENTITY_START = 'student-';
const REACTION = "Let's take a look.";
// The first two sentences are the tutor brain's own wording in `spoken-lines.ts` on M3.7's branch. They name no hotline, because the tutor does not know the student's country.
const NO_LESSON_WORDS: Record<NoLesson, { id: string; words: string }> = {
  nothing: { id: 'no-lesson', words: "I don't have a lesson for that one. Go back to Home and ask me something else, or pick a suggested lesson." },
  unsafe: { id: 'unsafe', words: "I can't go into that here, and you haven't done anything wrong by asking. If anything is worrying you, or you don't feel safe, please tell an adult you trust, or call your local emergency number. You can go back to Home and pick something else to learn." },
};
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
  /** Whether a page is on this lesson, so a student who has gone back does not count as still in it. */
  onPresence?(isHere: boolean): void;
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
export async function runLesson({ url, token, work, voice, onEvent, onClosing, onPresence: notePresence, timings }: RunLessonOptions): Promise<void> {
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
    if (change === 'joined') {
      onEvent?.('joined');
      settleJoined(true);
    }
    if (change === 'away') {
      onEvent?.('studentAway');
      notePresence?.(false);
      stopActive();
    }
    if (change === 'newPage') {
      onEvent?.('studentBack');
      notePresence?.(true);
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

  let hasToldVoiceLimit = false;
  const speakOnce = async (beats: readonly Beat[]): Promise<ActiveTurn> => {
    const id = `turn-${(turnCount += 1)}` as TurnId;
    beatsByTurn.set(id, beats);
    const turnVoice = voice.forTurn(beats);
    if (turnVoice.isAtLimit && !hasToldVoiceLimit) {
      hasToldVoiceLimit = true;
      void publish(SCENE_TOPIC, { type: 'voiceAtLimit' } satisfies SceneAgentMessage);
    }
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

  // A new page has none of the old page's board or words, so it hears the cut line whole, and a take running over several lines starts again from the line that puts it on the board.
  const getBeatsForNewPage = (beats: readonly Beat[], remaining: readonly Beat[]): readonly Beat[] => {
    const cutLine = Math.max(beats.length - remaining.length, 0);
    const sceneLine = beats.findIndex((beat) => beat.script.some((item) => typeof item === 'object' && item.kind === 'richScene'));
    return beats.slice(sceneLine >= 0 && sceneLine < cutLine ? sceneLine : cutLine);
  };

  // Each line is its own turn, because a person breathes between lines, and a scene holds at its moment over the gap.
  const speak = async (beats: readonly Beat[], prepareNewPage?: () => Promise<boolean>): Promise<void> => {
    let remaining = beats;
    wakes.clear();
    while (!isOver && remaining.length > 0) {
      if (presence.getState() === 'away') {
        const reason = await wakes.wait();
        if (reason === 'newPage' && prepareNewPage && !(await prepareNewPage())) return;
        if (reason === 'newPage') remaining = getBeatsForNewPage(beats, remaining);
        continue;
      }
      const [line, ...later] = remaining as [Beat, ...Beat[]];
      const turn = await speakOnce([line]);
      if (!turn.isStopped) {
        remaining = later;
        continue;
      }
      const reason = await wakes.wait();
      if (reason === 'over') return;
      if (reason === 'newPage' && prepareNewPage && !(await prepareNewPage())) return;
      remaining = reason === 'newPage' ? getBeatsForNewPage(beats, remaining) : [...getRestOfTurn(turn), ...later];
    }
  };

  const loadInBrowser = (scene: StoredScene): Promise<boolean> =>
    new Promise((resolve) => {
      loads.set(scene.id, resolve);
      setTimeout(() => resolve(false), loadLimitMs);
      void publish(SCENE_TOPIC, { type: 'loadScene', sceneId: scene.id, durationSeconds: scene.durationSeconds } satisfies SceneAgentMessage);
    });

  const showScene = async (scene: StoredScene, getBeats: () => readonly Beat[]): Promise<boolean> => {
    try {
      const beats = getBeats();
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

  const showSceneIfReady = async (): Promise<boolean> => {
    const scene = work.desk.takeReady();
    return scene ? showScene(scene, () => getSceneBeats({ setup: scene.plan.setup, narration: scene.narration, scene: getSceneCommand(scene, SCENE_ELEMENT) })) : false;
  };

  // A saved scene settles in the same turn that routed it, and a fresh one is seconds away. The student has just heard "Let's take a look", so the take itself comes next.
  const openOnSavedScene = async (): Promise<LessonPlan | null> => {
    await new Promise((resolve) => setImmediate(resolve));
    const scene = work.desk.takeAtOpening();
    if (!scene) return null;
    return (await showScene(scene, () => getTakeBeats({ id: 'scene-take', marked: scene.narration, scene: getSceneCommand(scene, SCENE_ELEMENT) }))) ? scene.plan : null;
  };

  const speakLine = async (id: string, spokenLine: OpeningLine) => {
    try {
      await speak(getLineBeats(id, spokenLine));
    } catch (error) {
      onEvent?.('lineFailed', { id, error: String(error) });
    }
  };

  let lastWords: readonly Beat[] = [];
  const speakLast = async (beats: readonly Beat[]) => {
    lastWords = beats;
    await speak(lastWords);
  };

  const speakMore = async (plan: LessonPlan, isShownAlready: boolean): Promise<boolean> => {
    let isShown = isShownAlready;
    for (const [index, more] of (plan.more ?? []).entries()) {
      if (isOver) break;
      await speakLine(`more-${index}`, more);
      if (!isShown) isShown = await showSceneIfReady();
      if (isShown && !isShownAlready) break;
    }
    return isShown;
  };

  // The close line is not the end of the 20 s, so a scene that lands after it still reaches a student on the page, and the question comes again after it.
  const showSceneAtLastChance = async (plan: LessonPlan) => {
    await untilOver(work.desk.untilLastChance());
    while (presence.getState() === 'away' && !isOver) await wakes.wait();
    if (!isOver && (await showSceneIfReady())) await speakLast(getSpokenBeats('close-again', plan.close, true));
  };

  const teach = async (plan: LessonPlan) => {
    for (const [index, opening] of plan.opening.slice(1).entries()) {
      if (isOver) return;
      await speakLine(`line-${index + 1}`, opening);
    }
    let isShown = await showSceneIfReady();
    if (!isShown) isShown = await speakMore(plan, false);
    onEvent?.('lessonClosing', { isShown, sceneState: work.desk.getState().kind });
    if (!isOver) await speakLast(getSpokenBeats('close', plan.close, true));
    if (!isShown && !isOver) await showSceneAtLastChance(plan);
  };

  const teachAfterOpeningScene = async (plan: LessonPlan) => {
    await speakMore(plan, true);
    onEvent?.('lessonClosing', { isShown: true, sceneState: work.desk.getState().kind });
    if (!isOver) await speakLast(getSpokenBeats('close', plan.close, true));
  };

  const speakNoLesson = async (why: NoLesson) => {
    onEvent?.('noLesson', { why });
    void publish(SCENE_TOPIC, { type: 'noLesson' } satisfies SceneAgentMessage);
    await speakLast(getSpokenBeats(NO_LESSON_WORDS[why].id, NO_LESSON_WORDS[why].words));
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
    await speak(getSpokenBeats('reaction', REACTION));
    const firstLine = await untilOver(work.firstLine);
    onEvent?.('firstLine', { hasLine: firstLine !== null });
    const openedOn = firstLine && canPlay ? await openOnSavedScene() : null;
    if (openedOn) {
      await teachAfterOpeningScene(openedOn);
      return;
    }
    if (firstLine) await speakLine('line-0', firstLine);
    const plan = await untilOver(work.plan);
    if (isOver || plan === null) return;
    onEvent?.('planned', { hasPlan: typeof plan !== 'string' });
    await (typeof plan === 'string' ? speakNoLesson(plan) : teach(plan));
  };

  try {
    if (await joined) await runScript();
  } catch (error) {
    onEvent?.('teachFailed', { error: String(error) });
    if (!isOver) await speakLast(getSpokenBeats('trouble', TROUBLE_LINE)).catch(() => {});
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
