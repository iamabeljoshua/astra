import { type BeatId, type ElementId, getBeatText, type PlayReport } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import type { SceneRecipe } from '../src/scenes/recipe/recipe.ts';
import { toRecipeScene } from '../src/scenes/recipe/recipe-scene.ts';
import type { StoredScene } from '../src/scenes/scene-types.ts';
import { dropAllWordsLeft, EMPTY_SCREEN, getReplacedSceneCommands, noteLessonTitle, noteSceneLanded, noteSceneWordsCut, noteStudentTurnAway, type Screen, takeOwedCommands, takeWordsLeft } from '../src/tutor/scene-screen.ts';
import { getTutorSceneBeats } from '../src/tutor/tutor-scenes.ts';

const JET_TITLE = 'How a jet engine works';
const LEAF_TITLE = 'How a leaf makes sugar';
const WORDS_PLAYED_OF_SECOND_LINE = 5;

function makeScene(id: string, topic: string, says: SceneRecipe['says']): StoredScene {
  const recipe: SceneRecipe = { topic, stage: 'studio', says, items: [{ id: 'main', part: 'jetEngine' }], moves: [], labels: [], arrows: [], flows: [], gauges: [], cams: [] };
  return toRecipeScene({ recipe, code: '', key: { id, topic, ownerId: null }, costUsd: 0, writeMs: 0 });
}

const JET_ENGINE = makeScene('jet-1', 'jet engine', [
  { m: 'fan-in', text: 'So this is the jet engine, and all the air comes in through that big fan.' },
  { m: 'squeeze', text: 'Those stages squeeze the air hard, which means it gets hot before any fuel joins.' },
  { m: 'burn', text: 'Fuel burns in that squeezed air, so the hot gas rushes out of the back.' },
  { m: 'push', text: 'That fast gas going backwards is what pushes the whole engine forwards.' },
]);

const LEAF = makeScene('leaf-1', 'plant leaf', [
  { m: 'light', text: 'So this is a leaf, and it is catching the light that falls on it.' },
  { m: 'water', text: 'Water comes up the stem, because the roots have been pulling it from the soil.' },
  { m: 'sugar', text: 'Light splits that water, which means the leaf can build sugar out of the air.' },
]);

const toElementId = (number: number) => `scene-${number}` as ElementId;

function land(screen: Screen, { scene, number, lessonTitle }: { scene: StoredScene; number: number; lessonTitle: string }): Screen {
  const beats = getTutorSceneBeats({ plan: scene.plan, scene, number, firstCommands: getReplacedSceneCommands(screen) });
  return noteSceneLanded(screen, { scene, elementId: toElementId(number), lessonTitle, beats });
}

const landJetEngine = (screen = EMPTY_SCREEN) => land(screen, { scene: JET_ENGINE, number: 1, lessonTitle: JET_TITLE });

const makeReport = (playedWords: number, firedCues: number, ending: PlayReport['ending']): PlayReport => ({ wordStartsMs: [], durationMs: 0, playedWords, firedCueMs: Array.from({ length: firedCues }, () => 0), ending, frozen: [] });

/** The first line played out, and the student spoke five words into the second. */
function getHeardIntoSecondLine(number: number) {
  const reports = new Map([
    [`n${number}-scene-setup` as BeatId, makeReport(16, 3, 'finished')],
    [`n${number}-scene-take` as BeatId, makeReport(WORDS_PLAYED_OF_SECOND_LINE, 1, 'interrupted')],
  ]);
  return { reports, wordsSent: new Map<BeatId, number>() };
}

const cutJetEngine = (screen = landJetEngine()) => noteSceneWordsCut(screen, getHeardIntoSecondLine(1), 'r1');

/** Student cuts the jet engine, the lesson moves to the leaf, then comes back to the jet engine. */
function leaveAndComeBack(leave: (screen: Screen) => Screen = (screen) => screen) {
  const moved = noteLessonTitle(cutJetEngine(), LEAF_TITLE, toElementId(2));
  const onLeaf = land(takeOwedCommands(moved.screen).screen, { scene: LEAF, number: 2, lessonTitle: LEAF_TITLE });
  return noteLessonTitle(leave(onLeaf), JET_TITLE, toElementId(3));
}

const getTrimmedTexts = (screen: Screen) => takeWordsLeft(screen).left.map((beat) => getBeatText(beat).trim());

describe('the screen through a conversation', () => {
  it('owes a hide and needs a scene when the lesson moves to a new topic', () => {
    const { screen, move } = noteLessonTitle(landJetEngine(), LEAF_TITLE, toElementId(2));
    expect(move).toEqual({ kind: 'needsScene' });
    expect(screen.onScreen).toBeNull();
    expect(screen.owed).toEqual([{ kind: 'hide', target: 'scene-1' }]);
  });

  it('asks the next scene to hide nothing once the old picture is already owed a hide', () => {
    const { screen } = noteLessonTitle(landJetEngine(), LEAF_TITLE, toElementId(2));
    expect(getReplacedSceneCommands(screen)).toEqual([]);
  });

  it('has a landing scene hide the one it replaces and shelve it', () => {
    const onJet = landJetEngine();
    expect(getReplacedSceneCommands(onJet)).toEqual([{ kind: 'hide', target: 'scene-1' }]);
    const onLeaf = land(onJet, { scene: LEAF, number: 2, lessonTitle: LEAF_TITLE });
    expect(onLeaf.onScreen?.scene).toBe(LEAF);
    expect(onLeaf.shelved.map(({ scene }) => scene)).toEqual([JET_ENGINE]);
  });

  it('stays on a title about the same topic', () => {
    const { screen, move } = noteLessonTitle(landJetEngine(), 'Why jet engines are so loud', toElementId(2));
    expect(move).toEqual({ kind: 'stayed' });
    expect(screen.owed).toEqual([]);
    expect(screen.onScreen?.elementId).toBe('scene-1');
    expect(screen.onScreen?.lessonTitle).toBe('Why jet engines are so loud');
  });

  it('stays on the title it landed under, even when the title shares no word with the topic', () => {
    const onThrust = land(EMPTY_SCREEN, { scene: JET_ENGINE, number: 1, lessonTitle: 'What thrust is' });
    expect(noteLessonTitle(onThrust, ' what THRUST is ', toElementId(2)).move).toEqual({ kind: 'stayed' });
  });

  it('brings a scene back on a return, at the moment the student reached', () => {
    const { screen, move } = leaveAndComeBack();
    expect(move).toEqual({ kind: 'back', scene: JET_ENGINE });
    expect(screen.owed).toEqual([
      { kind: 'hide', target: 'scene-2' },
      { kind: 'richScene', id: 'scene-3', engine: 'kit', sceneId: 'jet-1', moments: JET_ENGINE.moments, parts: ['main'], durationSeconds: JET_ENGINE.durationSeconds },
      { kind: 'runSimulation', target: 'scene-3', action: 'seek', to: 'squeeze' },
    ]);
    expect(screen.onScreen?.elementId).toBe('scene-3');
    expect(screen.shelved.map(({ scene }) => scene)).toEqual([LEAF]);
  });

  it('keeps the words left on a return, from the start of the line they were cut in', () => {
    const { screen } = leaveAndComeBack();
    const texts = getTrimmedTexts(screen);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts[0]?.[0]).toBe((texts[0]?.[0] ?? '').toUpperCase());
  });

  it('aims the words left at the scene that came back, not the one it hid', () => {
    const { screen } = leaveAndComeBack();
    const targets = takeWordsLeft(screen).left.flatMap((beat) => beat.script.flatMap((part) => (typeof part !== 'string' && part.kind === 'runSimulation' ? [part.target] : [])));
    expect(targets.length).toBeGreaterThan(0);
    expect([...new Set(targets)]).toEqual(['scene-3']);
  });

  it('brings a scene back with no seek when the student reached no moment', () => {
    const heardNothingFinished = { reports: new Map([['n1-scene-setup' as BeatId, makeReport(3, 1, 'interrupted')]]), wordsSent: new Map<BeatId, number>() };
    const moved = noteLessonTitle(noteSceneWordsCut(landJetEngine(), heardNothingFinished, 'r1'), LEAF_TITLE, toElementId(2));
    const onLeaf = land(takeOwedCommands(moved.screen).screen, { scene: LEAF, number: 2, lessonTitle: LEAF_TITLE });
    const { screen } = noteLessonTitle(onLeaf, JET_TITLE, toElementId(3));
    expect(screen.owed.map(({ kind }) => kind)).toEqual(['hide', 'richScene']);
  });

  it('holds the words left through one student turn and lets them go after the second', () => {
    const afterFirst = noteStudentTurnAway(cutJetEngine());
    expect(getTrimmedTexts(afterFirst)).toHaveLength(3);
    const afterSecond = noteStudentTurnAway(afterFirst);
    expect(getTrimmedTexts(afterSecond)).toEqual([]);
    expect(afterSecond.onScreen?.scene).toBe(JET_ENGINE);
  });

  it('starts the two turns again from the latest cut', () => {
    const afterFirst = noteStudentTurnAway(cutJetEngine());
    const cutAgain = cutJetEngine(afterFirst);
    expect(getTrimmedTexts(noteStudentTurnAway(cutAgain))).toHaveLength(3);
  });

  it('says the words left once', () => {
    const taken = takeWordsLeft(cutJetEngine());
    expect(taken.left).toHaveLength(3);
    expect(takeWordsLeft(taken.screen).left).toEqual([]);
  });

  it('drops the words of every scene in a crisis and keeps the picture', () => {
    const onLeaf = land(cutJetEngine(), { scene: LEAF, number: 2, lessonTitle: LEAF_TITLE });
    const dropped = dropAllWordsLeft(noteSceneWordsCut(onLeaf, getHeardIntoSecondLine(2), 'r2'));
    expect(getTrimmedTexts(dropped)).toEqual([]);
    expect(dropped.onScreen?.scene).toBe(LEAF);
    expect(dropped.shelved.flatMap(({ left }) => left)).toEqual([]);
  });

  it('never gives the words of a scene back after a crisis, even on a return', () => {
    const { screen, move } = leaveAndComeBack(dropAllWordsLeft);
    expect(move.kind).toBe('back');
    expect(getTrimmedTexts(screen)).toEqual([]);
  });

  it('gives owed commands once', () => {
    const { screen } = noteLessonTitle(landJetEngine(), LEAF_TITLE, toElementId(2));
    const taken = takeOwedCommands(screen);
    expect(taken.owed).toEqual([{ kind: 'hide', target: 'scene-1' }]);
    expect(takeOwedCommands(taken.screen).owed).toEqual([]);
  });

  it('keeps owed commands in order until they are taken', () => {
    const toLeaf = noteLessonTitle(landJetEngine(), LEAF_TITLE, toElementId(2));
    const onLeaf = land(toLeaf.screen, { scene: LEAF, number: 2, lessonTitle: LEAF_TITLE });
    const toJet = noteLessonTitle(onLeaf, JET_TITLE, toElementId(3));
    expect(toJet.screen.owed.map(({ kind }) => kind)).toEqual(['hide', 'hide', 'richScene', 'runSimulation']);
  });
});
