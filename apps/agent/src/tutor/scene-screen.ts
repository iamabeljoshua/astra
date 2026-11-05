import { type Beat, type ElementId, getBeatText, getSpokenWords, type SceneCommand } from '@astra/contracts';
import type { ResumeRequest } from '../live/resume-plan.ts';
import { getSceneCommand } from '../scenes/scene-desk.ts';
import type { StoredScene } from '../scenes/scene-types.ts';
import type { TutorBeat } from './brain.ts';

const MOST_SHELVED = 8;
const MOST_STUDENT_TURNS_AWAY = 2;

const WORDS_NAMING_NO_TOPIC = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'from', 'does', 'work', 'tell', 'your', 'about', 'really']);
const getTopicWords = (topic: string) => (topic.toLowerCase().match(/\p{L}{4,}/gu) ?? []).map((word) => word.replace(/s$/, '')).filter((word) => !WORDS_NAMING_NO_TOPIC.has(word));
export const isSameTopic = (asked: string, title: string) => getTopicWords(asked).some((word) => getTopicWords(title).includes(word));

export interface ScreenScene {
  scene: StoredScene;
  elementId: ElementId;
  lessonTitle: string | null;
  beats: readonly TutorBeat[];
  left: readonly TutorBeat[];
  reachedMoment: string | null;
  /** Its words were stopped and not said again, so `reachedMoment` is as far as the student got. */
  wasCut: boolean;
  studentTurnsAway: number;
}

export interface Screen {
  onScreen: ScreenScene | null;
  shelved: readonly ScreenScene[];
  owed: readonly SceneCommand[];
}

export const EMPTY_SCREEN: Screen = { onScreen: null, shelved: [], owed: [] };

const shelve = (one: ScreenScene, shelved: readonly ScreenScene[]) => [one, ...shelved.filter((other) => other.scene.id !== one.scene.id)].slice(0, MOST_SHELVED);

export function noteSceneLanded(screen: Screen, landed: { scene: StoredScene; elementId: ElementId; lessonTitle: string | null; beats: readonly TutorBeat[] }): Screen {
  const { onScreen } = screen;
  return { ...screen, onScreen: { ...landed, left: [], reachedMoment: null, wasCut: false, studentTurnsAway: 0 }, shelved: onScreen ? shelve(onScreen, screen.shelved) : screen.shelved };
}

export const getReplacedSceneCommands = ({ onScreen }: Screen): SceneCommand[] => (onScreen ? [{ kind: 'hide', target: onScreen.elementId }] : []);

function getReachedMoment(beats: readonly Beat[], left: readonly Beat[]): string | null {
  const firstLeft = left[0]?.id.replace(/-r\d+$/, '');
  const played = firstLeft ? beats.slice(0, Math.max(0, beats.findIndex((beat) => beat.id === firstLeft))) : beats;
  const reached = played.flatMap((beat) => beat.script).flatMap((part) => (typeof part !== 'string' && part.kind === 'runSimulation' && part.action === 'play' && typeof part.until === 'string' ? [part.until] : []));
  return reached.at(-1) ?? null;
}

const isHeardToItsEnd = (beat: TutorBeat, { reports, wordsSent }: Pick<ResumeRequest, 'reports' | 'wordsSent'>) => reports.get(beat.id)?.ending === 'finished' || (wordsSent.get(beat.id) ?? 0) >= getSpokenWords(getBeatText(beat)).length;

// An answer came between, so the words pick up at the line they were cut in, and not partway through it.
function getLinesLeft(beats: readonly TutorBeat[], heard: Pick<ResumeRequest, 'reports' | 'wordsSent'>, resumeTag: string): TutorBeat[] {
  const firstLeft = beats.findIndex((beat) => !isHeardToItsEnd(beat, heard));
  if (firstLeft < 0) return [];
  return beats.slice(firstLeft).map((beat) => ({ ...beat, id: `${beat.id}-${resumeTag}` as TutorBeat['id'], script: beat.script.filter((part) => typeof part === 'string' || part.kind === 'runSimulation') }));
}

export function noteSceneWordsCut(screen: Screen, heard: Pick<ResumeRequest, 'reports' | 'wordsSent'>, resumeTag: string): Screen {
  const { onScreen } = screen;
  if (!onScreen) return screen;
  const left = getLinesLeft(onScreen.beats, heard, resumeTag);
  return { ...screen, onScreen: { ...onScreen, left, reachedMoment: getReachedMoment(onScreen.beats, left) ?? onScreen.reachedMoment, wasCut: true, studentTurnsAway: 0 } };
}

export function noteStudentTurnAway(screen: Screen): Screen {
  const { onScreen } = screen;
  if (!onScreen || onScreen.left.length === 0) return screen;
  const studentTurnsAway = onScreen.studentTurnsAway + 1;
  return { ...screen, onScreen: { ...onScreen, studentTurnsAway, left: studentTurnsAway >= MOST_STUDENT_TURNS_AWAY ? [] : onScreen.left } };
}

export function takeWordsLeft(screen: Screen): { screen: Screen; left: readonly TutorBeat[] } {
  const { onScreen } = screen;
  if (!onScreen || onScreen.left.length === 0) return { screen, left: [] };
  return { screen: { ...screen, onScreen: { ...onScreen, left: [], wasCut: false } }, left: onScreen.left };
}

export function dropAllWordsLeft(screen: Screen): Screen {
  const clear = (one: ScreenScene) => ({ ...one, left: [] });
  return { ...screen, onScreen: screen.onScreen && clear(screen.onScreen), shelved: screen.shelved.map(clear) };
}

export function takeOwedCommands(screen: Screen): { screen: Screen; owed: readonly SceneCommand[] } {
  return { screen: { ...screen, owed: [] }, owed: screen.owed };
}

const getBeatsAimedAt = (beats: readonly TutorBeat[], from: ElementId, to: ElementId): TutorBeat[] => beats.map((beat) => ({ ...beat, script: beat.script.map((part) => (typeof part !== 'string' && part.kind === 'runSimulation' && part.target === from ? { ...part, target: to } : part)) }));

const isAboutTitle = (one: ScreenScene, title: string) => (one.lessonTitle !== null && one.lessonTitle.trim().toLowerCase() === title.trim().toLowerCase()) || isSameTopic(one.scene.topic, title);

function getBackCommands(back: ScreenScene, elementId: ElementId): SceneCommand[] {
  const place = getSceneCommand(back.scene, elementId);
  const moment = back.wasCut ? back.reachedMoment : (getReachedMoment(back.beats, []) ?? back.reachedMoment);
  return moment ? [place, { kind: 'runSimulation', target: elementId, action: 'seek', to: moment }] : [place];
}

export type TitleMove = { kind: 'stayed' } | { kind: 'needsScene' } | { kind: 'back'; scene: StoredScene };

/** A scene of the new title stays, one on the shelf comes back, and anything else leaves the board at once. */
export function noteLessonTitle(screen: Screen, title: string, newElementId: ElementId): { screen: Screen; move: TitleMove } {
  const { onScreen, shelved } = screen;
  if (onScreen && isAboutTitle(onScreen, title)) return { screen: { ...screen, onScreen: { ...onScreen, lessonTitle: title } }, move: { kind: 'stayed' } };
  const remaining = onScreen ? shelve(onScreen, shelved) : shelved;
  const hide: SceneCommand[] = onScreen ? [{ kind: 'hide', target: onScreen.elementId }] : [];
  const back = shelved.find((one) => isAboutTitle(one, title));
  if (!back) return { screen: { onScreen: null, shelved: remaining, owed: [...screen.owed, ...hide] }, move: { kind: 'needsScene' } };
  return { screen: { onScreen: { ...back, elementId: newElementId, lessonTitle: title, left: getBeatsAimedAt(back.left, back.elementId, newElementId), studentTurnsAway: 0 }, shelved: remaining.filter((one) => one !== back), owed: [...screen.owed, ...hide, ...getBackCommands(back, newElementId)] }, move: { kind: 'back', scene: back.scene } };
}
