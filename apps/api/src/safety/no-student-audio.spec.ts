import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPOSITORY_ROOT = join(__dirname, '../../../..');
const SERVER_SOURCES = ['apps/api/src', 'apps/agent/src'];
const NOT_RUN_FOR_STUDENTS = /\/(proof|lab|eval)\/|\.(spec|test)\.ts$/;
const WRITES_A_FILE = /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\b/;
const READS_THE_MICROPHONE = /RemoteAudioTrack|RemoteTrack|AudioStream|inputAudio|\bstt\./;
const STARTS_A_RECORDING = /EgressClient|startRoomCompositeEgress|startTrackEgress|startParticipantEgress/;

// Every server file that writes to disk, and what it writes. The store keeps the tutor's audio on purpose, so this check is about students' audio only.
const FILE_WRITERS: Record<string, string> = {
  'apps/agent/src/live/worker.ts': 'a timing trace, only when a test asks for one, no audio',
  'apps/agent/src/scenes/lesson/voice-takes.ts': "the tutor's voice from text to speech, never a student's",
  'apps/agent/src/scenes/scene-store.ts': 'scene records, takes, and sheets',
  'apps/agent/src/scenes/spend-ledger.ts': 'lesson costs',
  'apps/agent/src/tutor/spend-ledger.ts': 'tutor costs',
  'apps/api/src/infrastructure/orm/generate-migration.ts': 'a migration, on a developer machine',
  'apps/api/src/students/student-scene-files.ts': 'the lesson cost ledger, without one student',
};

function listServerSources(): string[] {
  return SERVER_SOURCES.flatMap((folder) =>
    readdirSync(join(REPOSITORY_ROOT, folder), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => relative(REPOSITORY_ROOT, join(entry.parentPath, entry.name)))
      .filter((path) => !NOT_RUN_FOR_STUDENTS.test(path)),
  );
}

const readSource = (path: string) => readFileSync(join(REPOSITORY_ROOT, path), 'utf8');

describe("students' audio", () => {
  it('reaches no new file writer: each one that runs for a student is named, with what it writes', () => {
    const writers = listServerSources().filter((path) => WRITES_A_FILE.test(readSource(path)));

    expect(writers.sort()).toEqual(Object.keys(FILE_WRITERS).sort());
  });

  it('reaches no file writer that also reads the microphone', () => {
    const readingAndWriting = Object.keys(FILE_WRITERS).filter((path) => READS_THE_MICROPHONE.test(readSource(path)));

    expect(readingAndWriting).toEqual([]);
  });

  it('is never recorded by the room: no server code starts a LiveKit recording', () => {
    expect(listServerSources().filter((path) => STARTS_A_RECORDING.test(readSource(path)))).toEqual([]);
  });

  it('notices a planted writer that reads the microphone', () => {
    const planted = "import { writeFile } from 'node:fs/promises'; for await (const frame of new AudioStream(track)) await writeFile('student.pcm', frame.data);";

    expect(WRITES_A_FILE.test(planted) && READS_THE_MICROPHONE.test(planted)).toBe(true);
  });
});
