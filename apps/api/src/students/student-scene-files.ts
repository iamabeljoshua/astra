import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const REPOSITORY_ROOT = join(__dirname, '../../../..');
const SCENES_FOLDER = 'scenes';
const FOLDERS_OF_KEYED_RECORDS = ['refusals', 'waiting-plans'];
const STUDENT_VOICE_FOLDER = 'student-voice';
const SPEND_LEDGER_FILE = 'lesson-spend.jsonl';

export interface SceneStorePaths {
  storeRoot: string;
  spendLedgerPath: string;
}

interface StudentSceneFiles extends SceneStorePaths {
  studentId: string;
}

// The same defaults the agent writes to, because the store is its files and the deleting is ours.
export function getSceneStorePaths(env: NodeJS.ProcessEnv): SceneStorePaths {
  const storeRoot = env.SCENE_STORE_DIR ?? join(REPOSITORY_ROOT, '.scene-store');
  return { storeRoot, spendLedgerPath: env.LESSON_SPEND_FILE ?? join(storeRoot, SPEND_LEDGER_FILE) };
}

function listFolder(folder: string): string[] {
  return existsSync(folder) ? readdirSync(folder) : [];
}

// A damaged record cannot say who owns it, so it reads as nobody's.
function readRecord(path: string): { ownerId?: string | null; key?: { ownerId?: string | null } } | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as { ownerId?: string | null };
  } catch {
    return null;
  }
}

function findOwnedSceneFolders(storeRoot: string, studentId: string): string[] {
  const scenesRoot = join(storeRoot, SCENES_FOLDER);
  return listFolder(scenesRoot)
    .map((sceneId) => join(scenesRoot, sceneId))
    .filter((folder) => readRecord(join(folder, 'scene.json'))?.ownerId === studentId);
}

function findOwnedKeyedRecords(storeRoot: string, studentId: string): string[] {
  return FOLDERS_OF_KEYED_RECORDS.flatMap((folderName) => {
    const folder = join(storeRoot, folderName);
    return listFolder(folder)
      .map((fileName) => join(folder, fileName))
      .filter((path) => readRecord(path)?.key?.ownerId === studentId);
  });
}

function isLineOfStudent(line: string, studentId: string): boolean {
  try {
    return (JSON.parse(line) as { studentId?: string }).studentId === studentId;
  } catch {
    return false;
  }
}

function removeLedgerLines(spendLedgerPath: string, studentId: string): void {
  if (!existsSync(spendLedgerPath)) return;
  const lines = readFileSync(spendLedgerPath, 'utf8').split('\n');
  const kept = lines.filter((line) => !isLineOfStudent(line, studentId));
  if (kept.length === lines.length) return;
  const partPath = `${spendLedgerPath}.${studentId}.part`;
  writeFileSync(partPath, kept.join('\n'));
  renameSync(partPath, spendLedgerPath);
}

// What docs/tests/scenes.md lists for one student. The agent can still be writing, so a live lesson should end before this runs.
export async function removeStudentSceneFiles({ storeRoot, spendLedgerPath, studentId }: StudentSceneFiles): Promise<void> {
  const owned = [
    ...findOwnedSceneFolders(storeRoot, studentId),
    ...findOwnedKeyedRecords(storeRoot, studentId),
    join(storeRoot, STUDENT_VOICE_FOLDER, studentId),
  ];
  await Promise.all(owned.map((path) => rm(path, { recursive: true, force: true })));
  removeLedgerLines(spendLedgerPath, studentId);
}
