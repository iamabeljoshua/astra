import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readKey } from '../../keys.ts';
import { makeAnthropicSceneModels } from '../../providers/anthropic.scenes.ts';
import { createContainerWorker } from '../render-worker.ts';
import { getSceneStoreRoot } from '../scene-settings.ts';
import { createSceneStore, getSceneKey, type SceneStore } from '../scene-store.ts';
import { createLibraryLedger, type LibraryLedger } from './library-ledger.ts';
import { getLibraryList, type LibraryEntry } from './library-list.ts';
import { type LibraryRun, writeEntry } from './write-entry.ts';

const CONTAINER_PREFIX = 'astra-m3-15';
const MODEL_RETRIES = 3;
/** About the most one try costs, so the tries already started still end under the ceiling. */
const RESERVE_USD_A_LANE = 0.3;

// A lane waiting on a model holds no container, so more lanes than containers keeps the containers busy without using any more of this Mac.
const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    lanes: { type: 'string', default: '4' },
    containers: { type: 'string', default: '2' },
    limit: { type: 'string', default: '28' },
    'most-tries': { type: 'string', default: '4' },
  },
});

const lanes = Number(args.lanes);
const containers = Number(args.containers);
const limitUsd = Number(args.limit);
const mostTries = Number(args['most-tries']);
const storeRoot = getSceneStoreRoot();
const runFolder = join(storeRoot, 'library-run');
const lockPath = join(runFolder, 'run.lock');

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Two runs at once would pay twice for one scene. A crash leaves the lock behind, so it only holds while its process lives.
function takeLock(): void {
  mkdirSync(runFolder, { recursive: true });
  if (existsSync(lockPath) && isAlive(Number(readFileSync(lockPath, 'utf8')))) throw new Error(`another library run holds ${lockPath}`);
  writeFileSync(lockPath, String(process.pid));
}

function getWanted(): LibraryEntry[] {
  const list = getLibraryList();
  if (!args.only) return list;
  const ids = args.only.split(',');
  return ids.map((id) => {
    const entry = list.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`no library entry is called ${id}`);
    return entry;
  });
}

// Fewest tries first, so every scene gets its first try before any scene gets a second.
function createQueue(wanted: readonly LibraryEntry[], store: SceneStore, ledger: LibraryLedger) {
  const inFlight = new Set<string>();
  const isWaiting = (entry: LibraryEntry) => !inFlight.has(entry.id) && !store.find(getSceneKey(entry.title)) && ledger.getEntryTries(entry.id) < mostTries;
  return {
    take(): LibraryEntry | null {
      const [next] = wanted.filter(isWaiting).sort((first, second) => ledger.getEntryTries(first.id) - ledger.getEntryTries(second.id));
      if (next) inFlight.add(next.id);
      return next ?? null;
    },
    give: (entry: LibraryEntry) => inFlight.delete(entry.id),
  };
}

function logEntry(run: LibraryRun, entry: LibraryEntry, isSaved: boolean, startedAtMs: number): void {
  const { ledger } = run;
  console.log(JSON.stringify({ at: new Date().toISOString(), entry: entry.id, isSaved, tries: ledger.getEntryTries(entry.id), stage: ledger.getLastTry(entry.id)?.stage, reasons: ledger.getLastTry(entry.id)?.reasons.slice(0, 3), seconds: Math.round((performance.now() - startedAtMs) / 1000), entryUsd: Number(ledger.getEntryUsd(entry.id).toFixed(4)), totalUsd: Number(ledger.getTotalUsd().toFixed(4)) }));
}

async function runLane(run: LibraryRun, queue: ReturnType<typeof createQueue>): Promise<void> {
  for (let entry = queue.take(); entry; entry = queue.take()) {
    if (run.ledger.getTotalUsd() >= limitUsd - RESERVE_USD_A_LANE * lanes) return;
    const startedAtMs = performance.now();
    const isSaved = await writeEntry(run, entry);
    logEntry(run, entry, isSaved, startedAtMs);
    queue.give(entry);
  }
}

function writeSummary({ ledger, store }: LibraryRun): void {
  const list = getLibraryList();
  const missing = list.filter((entry) => !store.find(getSceneKey(entry.title)));
  const summary = { totalUsd: ledger.getTotalUsd(), saved: list.length - missing.length, of: list.length, missing: missing.map((entry) => ({ id: entry.id, title: entry.title, tries: ledger.getEntryTries(entry.id), last: ledger.getLastTry(entry.id) })) };
  writeFileSync(join(runFolder, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify({ at: new Date().toISOString(), totalUsd: Number(summary.totalUsd.toFixed(4)), saved: summary.saved, of: summary.of }));
}

takeLock();
const ledger = createLibraryLedger(join(runFolder, 'ledger.jsonl'));
const assertRoom = () => {
  if (ledger.getTotalUsd() >= limitUsd) throw new Error(`Stopped at the $${limitUsd} ceiling`);
};
const apiKey = readKey('ANTHROPIC_API_KEY');
const run: LibraryRun = {
  makeModels: (entry) => makeAnthropicSceneModels({ apiKey, onUsage: ledger.getUsageListener(entry.id), assertRoom, modelSet: 'library', maxRetries: MODEL_RETRIES }),
  worker: createContainerWorker({ namePrefix: CONTAINER_PREFIX, mostAtOnce: containers }),
  store: createSceneStore(storeRoot),
  runStore: createSceneStore(runFolder),
  ledger,
  runFolder,
  warn: (line) => console.log(JSON.stringify({ at: new Date().toISOString(), warn: line })),
};
const queue = createQueue(getWanted(), run.store, ledger);
await Promise.all(Array.from({ length: lanes }, () => runLane(run, queue)));
writeSummary(run);
rmSync(lockPath, { force: true });
