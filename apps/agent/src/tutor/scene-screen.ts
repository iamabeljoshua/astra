import type { Beat, ElementId, SceneCommand } from '@astra/contracts';
import { getResumeBeats, type ResumeRequest } from '../live/resume-plan.ts';
import { getSceneCommand } from '../scenes/scene-desk.ts';
import type { StoredScene } from '../scenes/scene-types.ts';
import type { TutorBeat } from './brain.ts';

const MOST_SHELVED = 8;
/** A scene's words wait through one reply, and past that the lesson has gone somewhere else. */
const MOST_STUDENT_TURNS_AWAY = 2;

const WORDS_NAMING_NO_TOPIC = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'from', 'does', 'work', 'tell', 'your', 'about', 'really']);
const getTopicWords = (topic: string) => (topic.toLowerCase().match(/\p{L}{4,}/gu) ?? []).map((word) => word.replace(/s$/, '')).filter((word) => !WORDS_NAMING_NO_TOPIC.has(word));
export const isSameTopic = (asked: string, title: string) => getTopicWords(asked).some((word) => getTopicWords(title).includes(word));

export interface ScreenScene {
  scene: StoredScene;
  elementId: ElementId;
  /** The lesson's title when it landed, because a return names that title and not the scene's. */
  lessonTitle: string | null;
  beats: readonly TutorBeat[];
  /** Words a student's line cut, kept to say once they are answered. Empty while the words are playing or done. */
  left: readonly TutorBeat[];
  /** The last moment the student reached, so a return opens on the same picture. */
  reachedMoment: string | null;
  studentTurnsAway: number;
}

/** The one record of what a session's scene is doing. The session owns what was heard, and hands it over once, at the cut. */
export interface Screen {
  onScreen: ScreenScene | null;
  shelved: readonly ScreenScene[];
  /** Commands reach the page only inside beats, so these wait for the next one. */
  owed: readonly SceneCommand[];
}

export const EMPTY_SCREEN: Screen = { onScreen: null, shelved: [], owed: [] };

const shelve = (one: ScreenScene, shelved: readonly ScreenScene[]) => [one, ...shelved.filter((other) => other.scene.id !== one.scene.id)].slice(0, MOST_SHELVED);

export function noteSceneLanded(screen: Screen, landed: { scene: StoredScene; elementId: ElementId; lessonTitle: string | null; beats: readonly TutorBeat[] }): Screen {
  const { onScreen } = screen;
  return { ...screen, onScreen: { ...landed, left: [], reachedMoment: null, studentTurnsAway: 0 }, shelved: onScreen ? shelve(onScreen, screen.shelved) : screen.shelved };
}

/** What a new scene's first beat must take away, so two pictures are never on the board. */
export const getReplacedSceneCommands = ({ onScreen }: Screen): SceneCommand[] => (onScreen ? [{ kind: 'hide', target: onScreen.elementId }] : []);

function getReachedMoment(beats: readonly Beat[], left: readonly Beat[]): string | null {
  const firstLeft = left[0]?.id.split('-r')[0];
  const played = firstLeft ? beats.slice(0, Math.max(0, beats.findIndex((beat) => beat.id === firstLeft))) : beats;
  const reached = played.flatMap((beat) => beat.script).flatMap((part) => (typeof part !== 'string' && part.kind === 'runSimulation' && part.action === 'play' && typeof part.until === 'string' ? [part.until] : []));
  return reached.at(-1) ?? null;
}

export function noteSceneWordsCut(screen: Screen, heard: Pick<ResumeRequest, 'reports' | 'wordsSent'>, resumeTag: string): Screen {
  const { onScreen } = screen;
  if (!onScreen) return screen;
  const left = getResumeBeats({ beats: onScreen.beats, ...heard, resumeTag });
  return { ...screen, onScreen: { ...onScreen, left, reachedMoment: getReachedMoment(onScreen.beats, left) ?? onScreen.reachedMoment, studentTurnsAway: 0 } };
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
  return { screen: { ...screen, onScreen: { ...onScreen, left: [] } }, left: onScreen.left };
}

/** A crisis never gets a scene's words back. The picture stays, and goes to the corner on the help line. */
export function dropAllWordsLeft(screen: Screen): Screen {
  const clear = (one: ScreenScene) => ({ ...one, left: [] });
  return { ...screen, onScreen: screen.onScreen && clear(screen.onScreen), shelved: screen.shelved.map(clear) };
}

export function takeOwedCommands(screen: Screen): { screen: Screen; owed: readonly SceneCommand[] } {
  return { screen: { ...screen, owed: [] }, owed: screen.owed };
}

const isAboutTitle = (one: ScreenScene, title: string) => (one.lessonTitle !== null && one.lessonTitle.trim().toLowerCase() === title.trim().toLowerCase()) || isSameTopic(one.scene.topic, title);

function getBackCommands(back: ScreenScene, elementId: ElementId): SceneCommand[] {
  const place = getSceneCommand(back.scene, elementId);
  return back.reachedMoment ? [place, { kind: 'runSimulation', target: elementId, action: 'seek', to: back.reachedMoment }] : [place];
}

export type TitleMove = { kind: 'stayed' } | { kind: 'needsScene' } | { kind: 'back'; scene: StoredScene };

/** The lesson has a new title. A scene of that title stays, one on the shelf comes back, and anything else goes off the board at once, so an old picture never sits over a new lesson. */
export function noteLessonTitle(screen: Screen, title: string, newElementId: ElementId): { screen: Screen; move: TitleMove } {
  const { onScreen, shelved } = screen;
  if (onScreen && isAboutTitle(onScreen, title)) return { screen: { ...screen, onScreen: { ...onScreen, lessonTitle: title } }, move: { kind: 'stayed' } };
  const remaining = onScreen ? shelve(onScreen, shelved) : shelved;
  const hide: SceneCommand[] = onScreen ? [{ kind: 'hide', target: onScreen.elementId }] : [];
  const back = shelved.find((one) => isAboutTitle(one, title));
  if (!back) return { screen: { onScreen: null, shelved: remaining, owed: [...screen.owed, ...hide] }, move: { kind: 'needsScene' } };
  return { screen: { onScreen: { ...back, elementId: newElementId, lessonTitle: title, studentTurnsAway: 0 }, shelved: remaining.filter((one) => one !== back), owed: [...screen.owed, ...hide, ...getBackCommands(back, newElementId)] }, move: { kind: 'back', scene: back.scene } };
}
