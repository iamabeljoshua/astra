import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants } from 'node:zlib';
import { type LessonPlan, SCENE_THEMES, type SceneKey, type SceneRefusal, type SceneScope, type SceneTheme, type SceneTrouble, type StoredScene } from './scene-types.ts';

const HASH_CHARACTERS = 40;
const SERVER_MADE_ID = new RegExp(`^scene-[0-9a-f]{${HASH_CHARACTERS}}$`);
const BROTLI_QUALITY = 9;
const NO_TROUBLE: SceneTrouble = { tries: 0, lastAtMs: 0 };
const compress = promisify(brotliCompress);

const normalize = (topic: string) => topic.normalize('NFC').toLowerCase().trim();

export function getSceneId(topic: string, { ownerId = null, values = {} }: SceneScope = {}): string {
  const sortedValues = Object.entries(values).sort(([first], [second]) => first.localeCompare(second));
  return `scene-${createHash('sha256').update(JSON.stringify([normalize(topic), ownerId, sortedValues, SCENE_ENGINE_VERSIONS.manimgx])).digest('hex').slice(0, HASH_CHARACTERS)}`;
}

export const getSceneKey = (topic: string, scope: SceneScope = {}): SceneKey => ({ id: getSceneId(topic, scope), topic, ownerId: scope.ownerId ?? null });

export interface SceneStore {
  find(key: SceneKey): StoredScene | null;
  findRefusal(key: SceneKey): SceneRefusal | null;
  saveChecked(scene: StoredScene, takes: readonly { theme: SceneTheme; bytes: Buffer }[], sheets: readonly { bytes: Buffer }[]): Promise<StoredScene>;
  saveRefusal(refusal: SceneRefusal): void;
  getTrouble(key: SceneKey): SceneTrouble;
  saveTrouble(key: SceneKey, trouble: SceneTrouble): void;
  /** The words a topic with no scene says until its next try, so each open pays neither a planner call nor new voice. */
  findWaitingPlan(key: SceneKey): LessonPlan | null;
  saveWaitingPlan(key: SceneKey, plan: LessonPlan): void;
  list(): StoredScene[];
}

const isKeyMatch = (key: SceneKey, found: { topic?: string; ownerId?: string | null }) => normalize(found.topic ?? '') === normalize(key.topic) && (found.ownerId ?? null) === key.ownerId;

function requireServerId(id: string): string {
  if (!SERVER_MADE_ID.test(id)) throw new Error(`a scene id must be one the server made: ${JSON.stringify(id)}`);
  return id;
}

function requireKnownThemes(takes: readonly { theme: SceneTheme }[]): void {
  for (const { theme } of takes) if (!SCENE_THEMES.includes(theme)) throw new Error(`a take's theme must be one the server knows: ${JSON.stringify(theme)}`);
}

function writeJsonFile(folder: string, name: string, value: object): void {
  mkdirSync(folder, { recursive: true });
  const partPath = join(folder, `${name}.${randomUUID()}.part`);
  writeFileSync(partPath, JSON.stringify(value, null, 1));
  renameSync(partPath, join(folder, name));
}

// A damaged record reads as no record, so one bad file costs a rewrite and not a lesson.
function readJsonFile<Value>(path: string): Value | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Value;
  } catch {
    console.warn(`::warning title=Scene store::could not read ${path}`);
    return null;
  }
}

export function createSceneStore(root: string): SceneStore {
  const scenesRoot = join(root, 'scenes');
  const refusalsRoot = join(root, 'refusals');
  const troubleRoot = join(root, 'trouble');
  const waitingPlansRoot = join(root, 'waiting-plans');
  const readChecked = (id: string): StoredScene | null => {
    const scene = readJsonFile<StoredScene>(join(scenesRoot, requireServerId(id), 'scene.json'));
    return scene?.status === 'checked' ? scene : null;
  };
  return {
    find(key) {
      const scene = readChecked(key.id);
      return scene && isKeyMatch(key, scene) ? scene : null;
    },
    findRefusal(key) {
      const refusal = readJsonFile<SceneRefusal>(join(refusalsRoot, `${requireServerId(key.id)}.json`));
      return refusal && isKeyMatch(key, refusal.key) ? refusal : null;
    },
    list: () => (existsSync(scenesRoot) ? readdirSync(scenesRoot).filter((id) => SERVER_MADE_ID.test(id)).flatMap((id) => readChecked(id) ?? []) : []),
    // The whole folder appears at once, and a rename onto a folder that holds files fails, so the first passing save stays and a take's address never changes what it serves.
    async saveChecked(scene, takes, sheets) {
      const target = join(scenesRoot, requireServerId(scene.id));
      requireKnownThemes(takes);
      const incoming = join(root, 'incoming', randomUUID());
      await mkdir(incoming, { recursive: true });
      await Promise.all(takes.map(async ({ theme, bytes }) => writeFile(join(incoming, `${theme}.take.br`), await compress(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }))));
      await Promise.all(sheets.map(({ bytes }, index) => writeFile(join(incoming, `sheet-${index}.png`), bytes)));
      await writeFile(join(incoming, 'scene.json'), JSON.stringify(scene, null, 1));
      await mkdir(scenesRoot, { recursive: true });
      try {
        await rename(incoming, target);
        return scene;
      } catch (error) {
        const winner = readChecked(scene.id);
        if (!winner && existsSync(join(target, 'scene.json'))) {
          // A damaged record would otherwise make every lesson pay for a write it can never keep. Nobody can be served from that folder, so it goes.
          const damaged = join(root, 'incoming', randomUUID());
          await rename(target, damaged);
          await rm(damaged, { recursive: true, force: true });
          await rename(incoming, target);
          return scene;
        }
        await rm(incoming, { recursive: true, force: true });
        if (!winner) throw error;
        return winner;
      }
    },
    saveRefusal: (refusal) => writeJsonFile(refusalsRoot, `${requireServerId(refusal.key.id)}.json`, refusal),
    getTrouble: (key) => readJsonFile<SceneTrouble>(join(troubleRoot, `${requireServerId(key.id)}.json`)) ?? NO_TROUBLE,
    saveTrouble: (key, trouble) => writeJsonFile(troubleRoot, `${requireServerId(key.id)}.json`, trouble),
    findWaitingPlan(key) {
      const waiting = readJsonFile<{ key: SceneKey; plan: LessonPlan }>(join(waitingPlansRoot, `${requireServerId(key.id)}.json`));
      return waiting && isKeyMatch(key, waiting.key) ? waiting.plan : null;
    },
    saveWaitingPlan: (key, plan) => writeJsonFile(waitingPlansRoot, `${requireServerId(key.id)}.json`, { key, plan }),
  };
}
