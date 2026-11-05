import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import deeperScenes from '../picks/deeper-scenes.json';
import { LIBRARY } from '../picks/library';
import { getCardMaterial, getLibraryScenes, getWeightedSample, setSceneFlag } from './scene-library';
import { SceneLibraryController } from './scene-library.controller';
import type { LibrarySceneDto } from './scene.dto';
import { findCheckedTake } from './scene-takes';

const REVIEWER_ID = 'a-named-reviewer';
const STUDENT_ID = 'a-student';
const getSceneId = (index: number) => `scene-${String(index).padStart(40, '0')}`;

describe('the scene library', () => {
  const controller = new SceneLibraryController();
  let storeRoot: string;

  function saveScene(sceneId: string, topic: string, ownerId: string | null = null) {
    const folder = join(storeRoot, 'scenes', sceneId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'scene.json'), JSON.stringify({ status: 'checked', ownerId, topic, narration: '[[a]] Words.', plan: { close: 'Why?' } }));
    writeFileSync(join(folder, 'light.take.br'), 'a take');
  }

  beforeEach(() => {
    storeRoot = mkdtempSync(join(tmpdir(), 'scene-library-'));
    process.env.SCENE_STORE_DIR = storeRoot;
    process.env.SCENE_REVIEWER_IDS = REVIEWER_ID;
    LIBRARY.topics.slice(0, 30).forEach(({ title }, index) => saveScene(getSceneId(index), title));
    deeperScenes.deeper.flatMap(({ titles }) => titles).slice(0, 20).forEach((title, index) => saveScene(getSceneId(100 + index), title));
    saveScene(getSceneId(200), 'a question a student typed', 'some-student');
    saveScene(getSceneId(201), 'a shared scene nobody listed');
  });

  afterEach(() => {
    delete process.env.SCENE_STORE_DIR;
    delete process.env.SCENE_REVIEWER_IDS;
    rmSync(storeRoot, { recursive: true });
  });

  it('holds 5 deeper titles for each of 17 Home topics', () => {
    const homeTopics = new Set(LIBRARY.topics.map(({ id }) => id));
    expect(LIBRARY.topics).toHaveLength(48);
    expect(deeperScenes.deeper).toHaveLength(17);
    for (const { topicId, titles } of deeperScenes.deeper) {
      expect(homeTopics.has(topicId)).toBe(true);
      expect(titles).toHaveLength(5);
    }
  });

  it('refuses anyone but a named reviewer, and shows them nothing', () => {
    expect(() => controller.getSample(STUDENT_ID, {})).toThrow(ForbiddenException);
    expect(() => controller.getSheet(STUDENT_ID, { sceneId: getSceneId(0) }, { setHeader: () => {} })).toThrow(ForbiddenException);
    expect(() => controller.flagScene(STUDENT_ID, { sceneId: getSceneId(0) })).toThrow(ForbiddenException);
    expect(() => controller.clearFlag(STUDENT_ID, { sceneId: getSceneId(0) })).toThrow(ForbiddenException);
    expect(existsSync(join(storeRoot, 'flags'))).toBe(false);
  });

  it('refuses everyone when no reviewer is named', () => {
    delete process.env.SCENE_REVIEWER_IDS;
    expect(() => controller.getSample(REVIEWER_ID, {})).toThrow(ForbiddenException);
  });

  it('samples only scenes on the server list, leaning to openings', () => {
    const sample = controller.getSample(REVIEWER_ID, {});
    expect(sample.filter(({ kind }) => kind === 'opening')).toHaveLength(18);
    expect(sample.filter(({ kind }) => kind === 'deeper')).toHaveLength(6);
    expect(getLibraryScenes(storeRoot).map(({ title }) => title)).not.toContain('a question a student typed');
    expect(getLibraryScenes(storeRoot).map(({ title }) => title)).not.toContain('a shared scene nobody listed');
  });

  it('draws the same sample for the same seed, and another for another', () => {
    const scenes: LibrarySceneDto[] = Array.from({ length: 60 }, (_, index) => ({ sceneId: getSceneId(index), title: `t${index}`, kind: index < 40 ? 'opening' : 'deeper', subject: 'Math', narration: '', close: '', isFlagged: false, isCheckedByPerson: false }));
    expect(getWeightedSample(scenes, 1)).toEqual(getWeightedSample(scenes, 1));
    expect(getWeightedSample(scenes, 1)).not.toEqual(getWeightedSample(scenes, 2));
  });

  it('keeps a flag, stops the take reaching any student, and shows it again once cleared', () => {
    const sceneId = getSceneId(1);
    const findTake = () => findCheckedTake({ storeRoot, sceneId, theme: 'light', studentId: STUDENT_ID });
    expect(findTake()).not.toBeNull();
    controller.flagScene(REVIEWER_ID, { sceneId });
    expect(findTake()).toBeNull();
    expect(getLibraryScenes(storeRoot).find((scene) => scene.sceneId === sceneId)?.isFlagged).toBe(true);
    controller.clearFlag(REVIEWER_ID, { sceneId });
    expect(findTake()).not.toBeNull();
  });

  it('answers 404 for a scene off the list, even for a reviewer', () => {
    expect(() => controller.flagScene(REVIEWER_ID, { sceneId: getSceneId(200) })).toThrow(NotFoundException);
    expect(() => controller.getSheet(REVIEWER_ID, { sceneId: getSceneId(201) }, { setHeader: () => {} })).toThrow(NotFoundException);
  });
});

describe('a card\'s lesson', () => {
  const ROCKET = 'How a rocket escapes Earth';
  const STAGES = 'Why rockets drop their empty stages';

  function saveScene(storeRoot: string, topic: string, sceneId: string) {
    mkdirSync(join(storeRoot, 'scenes', sceneId), { recursive: true });
    writeFileSync(join(storeRoot, 'scenes', sceneId, 'scene.json'), JSON.stringify({ topic, status: 'checked', ownerId: null, plan: { opening: [{ say: `${topic} opens.` }], more: [{ say: `${topic} goes on.` }] } }));
  }

  it('teaches the card first, then its deeper ideas, with the lines written for each', () => {
    const storeRoot = mkdtempSync(join(tmpdir(), 'card-material-'));
    saveScene(storeRoot, ROCKET, `scene-${'a'.repeat(40)}`);
    saveScene(storeRoot, STAGES, `scene-${'b'.repeat(40)}`);
    const material = getCardMaterial(storeRoot, ROCKET);
    expect(material?.ideas.map(({ title }) => title)).toEqual([ROCKET, 'Why rockets throw mass backward to go forward', 'What escape velocity really means', STAGES, 'Why rockets launch toward the east', 'How an orbit is really falling sideways']);
    expect(material?.ideas[0]).toEqual({ title: ROCKET, lines: [`${ROCKET} opens.`, `${ROCKET} goes on.`], hasScene: true });
    expect(material?.ideas[1]).toEqual({ title: 'Why rockets throw mass backward to go forward', lines: [], hasScene: false });
  });

  it('leaves a flagged scene out at once, even though the files are kept a while', () => {
    const storeRoot = mkdtempSync(join(tmpdir(), 'card-material-'));
    const sceneId = `scene-${'a'.repeat(40)}`;
    saveScene(storeRoot, ROCKET, sceneId);
    expect(getCardMaterial(storeRoot, ROCKET)?.ideas[0]?.hasScene).toBe(true);
    setSceneFlag({ storeRoot, sceneId, flaggedBy: 'abel', isFlagged: true });
    expect(getCardMaterial(storeRoot, ROCKET)?.ideas[0]).toEqual({ title: ROCKET, lines: [], hasScene: false });
  });

  it('has no material for a title off the list, and still names the ideas with no store', () => {
    expect(getCardMaterial(undefined, 'teach me photosynthesis')).toBeNull();
    expect(getCardMaterial(undefined, ROCKET)?.ideas).toHaveLength(6);
  });
});
