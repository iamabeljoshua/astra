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

interface StoredRecord {
  ownerId?: string | null;
  key?: { ownerId?: string | null };
}

export function getSceneStorePaths(env: NodeJS.ProcessEnv): SceneStorePaths {
  const storeRoot = env.SCENE_STORE_DIR ?? join(REPOSITORY_ROOT, '.scene-store');
  return { storeRoot, spendLedgerPath: env.LESSON_SPEND_FILE ?? join(storeRoot, SPEND_LEDGER_FILE) };
}

function listFolder(folder: string): string[] {
  return existsSync(folder) ? readdirSync(folder) : [];
}

function readRecord(path: string): StoredRecord | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text) as StoredRecord;
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

export async function removeStudentSceneFiles({ storeRoot, spendLedgerPath, studentId }: StudentSceneFiles): Promise<void> {
  const owned = [
    ...findOwnedSceneFolders(storeRoot, studentId),
    ...findOwnedKeyedRecords(storeRoot, studentId),
    join(storeRoot, STUDENT_VOICE_FOLDER, studentId),
  ];
  await Promise.all(owned.map((path) => rm(path, { recursive: true, force: true })));
  removeLedgerLines(spendLedgerPath, studentId);
}
