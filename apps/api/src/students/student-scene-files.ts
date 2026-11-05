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

// A record too damaged to read may be this student's, and nothing can be served from it, so it goes with their data and "deleted" stays true.
function belongsToStudentOrIsDamaged(path: string, studentId: string, getOwnerId: (record: StoredRecord) => string | null | undefined): boolean {
  if (!existsSync(path)) return false;
  try {
    return getOwnerId(JSON.parse(readFileSync(path, 'utf8')) as StoredRecord) === studentId;
  } catch {
    return true;
  }
}

function findOwnedSceneFolders(storeRoot: string, studentId: string): string[] {
  const scenesRoot = join(storeRoot, SCENES_FOLDER);
  return listFolder(scenesRoot)
    .map((sceneId) => join(scenesRoot, sceneId))
    .filter((folder) => belongsToStudentOrIsDamaged(join(folder, 'scene.json'), studentId, (record) => record.ownerId));
}

function findOwnedKeyedRecords(storeRoot: string, studentId: string): string[] {
  return FOLDERS_OF_KEYED_RECORDS.flatMap((folderName) => {
    const folder = join(storeRoot, folderName);
    return listFolder(folder)
      .map((fileName) => join(folder, fileName))
      .filter((path) => belongsToStudentOrIsDamaged(path, studentId, (record) => record.key?.ownerId));
  });
}

function isLineOfStudent(line: string, studentId: string): boolean {
  try {
    return (JSON.parse(line) as { studentId?: string }).studentId === studentId;
  } catch {
    return line.includes(studentId);
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
