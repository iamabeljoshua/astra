import type { DeclaredValue, SceneTheme } from './scene-types.ts';

export const MOST_TAKE_BYTES = 6 * 1024 * 1024;
const MOST_SHEET_BYTES = 4 * 1024 * 1024;
const MOST_SHEETS_A_THEME = 6;
const MOST_ALL_SHEET_BYTES = 8 * 1024 * 1024;
const MOST_HEADER_BYTES = 256 * 1024;
const MOST_TEXT_ITEMS = 64;
const MOST_TEXT_CHARACTERS = 2000;
const MOST_DECLARED_VALUES = 32;
const HEADER_LENGTH_BYTES = 4;
const FAILURE_STAGES = ['gate', 'make', 'inspect', 'time', 'worker'] as const;
const FRAMING_RECORDS = 3;

export type FailureStage = (typeof FAILURE_STAGES)[number] | 'size';

export interface WorkerRecord {
  header: { kind: string; bytes: number; [field: string]: unknown };
  payload: Buffer;
}

export interface MadeTake {
  theme: SceneTheme;
  bytes: Buffer;
  makeMs: number;
  seconds: number;
  parts: readonly string[];
}

export interface TakeSheet {
  theme: SceneTheme;
  bytes: Buffer;
}

export interface RecordLimits {
  mostRecords: number;
  mostBytes: number;
}

export class RecordRefused extends Error {
  readonly stage: FailureStage;

  constructor(reason: string, stage: FailureStage = 'worker') {
    super(reason);
    this.stage = stage;
  }
}

export function getRecordLimits(themeCount: number): RecordLimits {
  return { mostRecords: FRAMING_RECORDS + themeCount * (2 + MOST_SHEETS_A_THEME), mostBytes: themeCount * MOST_TAKE_BYTES + MOST_ALL_SHEET_BYTES };
}

const getPayloadLimit = (kind: unknown) => (kind === 'take' ? MOST_TAKE_BYTES : kind === 'sheet' ? MOST_SHEET_BYTES : 0);

// The bytes come from a container that ran model-written code, so nothing past the length is believed until it is checked.
export function createRecordReader(onRecord: (record: WorkerRecord) => void, onRefused: (reason: string, stage: FailureStage) => void, { mostRecords, mostBytes }: RecordLimits = { mostRecords: Number.POSITIVE_INFINITY, mostBytes: Number.POSITIVE_INFINITY }) {
  let buffered = Buffer.alloc(0);
  let isRefused = false;
  let recordCount = 0;
  let byteCount = 0;
  const refuse = (reason: string, stage: FailureStage = 'worker') => {
    isRefused = true;
    buffered = Buffer.alloc(0);
    onRefused(reason, stage);
  };
  const readOne = (): boolean => {
    if (buffered.length < HEADER_LENGTH_BYTES) return false;
    const headerLength = buffered.readUInt32BE(0);
    if (headerLength > MOST_HEADER_BYTES) throw new RecordRefused('a record header is too long');
    if (buffered.length < HEADER_LENGTH_BYTES + headerLength) return false;
    const header = JSON.parse(buffered.subarray(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + headerLength).toString()) as WorkerRecord['header'];
    const payloadLength = header.bytes;
    if (!Number.isSafeInteger(payloadLength) || payloadLength < 0 || payloadLength > getPayloadLimit(header.kind)) throw new RecordRefused(header.kind === 'take' ? `the take passed ${MOST_TAKE_BYTES} bytes` : `a ${String(header.kind)} record is too large`, header.kind === 'take' ? 'size' : 'worker');
    if ((recordCount += 1) > mostRecords) throw new RecordRefused('more records than a job can make');
    if ((byteCount += payloadLength) > mostBytes) throw new RecordRefused('more bytes than a job can make');
    const end = HEADER_LENGTH_BYTES + headerLength + payloadLength;
    if (buffered.length < end) {
      recordCount -= 1;
      byteCount -= payloadLength;
      return false;
    }
    onRecord({ header, payload: Buffer.from(buffered.subarray(HEADER_LENGTH_BYTES + headerLength, end)) });
    buffered = buffered.subarray(end);
    return true;
  };
  return (chunk: Buffer) => {
    if (isRefused) return;
    buffered = Buffer.concat([buffered, chunk]);
    try {
      while (!isRefused && readOne());
    } catch (error) {
      if (error instanceof RecordRefused) refuse(error.message, error.stage);
      else refuse('a record could not be read');
    }
  };
}

function readTexts(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > MOST_TEXT_ITEMS || !value.every((item) => typeof item === 'string' && item.length <= MOST_TEXT_CHARACTERS)) throw new RecordRefused(`a record's ${name} is not a short list of text`);
  return value as string[];
}

function requireBytes(payload: Buffer, name: string): void {
  if (payload.length === 0) throw new RecordRefused(`a ${name} with no bytes`);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function readDeclared(value: unknown): Readonly<Record<string, DeclaredValue>> {
  const entries = Object.entries((value ?? {}) as Record<string, DeclaredValue>);
  const isGood = entries.length <= MOST_DECLARED_VALUES && entries.every(([name, declared]) => declared?.name === name && isFiniteNumber(declared.default) && isFiniteNumber(declared.lo) && isFiniteNumber(declared.hi));
  if (!isGood) throw new RecordRefused('a gate record declares values it cannot have');
  return Object.fromEntries(entries);
}

export interface CollectedRun {
  takes: MadeTake[];
  sheets: TakeSheet[];
  layoutProblems: string[];
  layoutNotes: string[];
  declared: Readonly<Record<string, DeclaredValue>>;
  failure: { stage: FailureStage; reasons: readonly string[] } | null;
  isDone: boolean;
}

export function createRecordCollector(themes: readonly SceneTheme[]) {
  const collected: CollectedRun = { takes: [], sheets: [], layoutProblems: [], layoutNotes: [], declared: {}, failure: null, isDone: false };
  const readTheme = (value: unknown): SceneTheme => {
    const theme = themes.find((known) => known === value);
    if (!theme) throw new RecordRefused('a record names a theme this job did not ask for');
    return theme;
  };
  const collectors: Record<string, (record: WorkerRecord) => void> = {
    gate({ header }) {
      collected.declared = readDeclared(header.declared);
      if (header.ok !== true) collected.failure = { stage: 'gate', reasons: readTexts(header.reasons, 'reasons') };
    },
    take({ header, payload }) {
      requireBytes(payload, 'take');
      const theme = readTheme(header.theme);
      if (collected.takes.some((take) => take.theme === theme)) throw new RecordRefused('a second take for one theme');
      const made = (header.made ?? {}) as Partial<MadeTake>;
      if (!isFiniteNumber(made.makeMs) || !isFiniteNumber(made.seconds)) throw new RecordRefused('a take record has times it cannot have');
      collected.takes.push({ theme, bytes: payload, makeMs: made.makeMs, seconds: made.seconds, parts: readTexts(made.parts, 'parts') });
    },
    layout({ header }) {
      collected.layoutProblems.push(...readTexts(header.problems, 'problems'));
      collected.layoutNotes.push(...readTexts(header.notes, 'notes'));
    },
    sheet({ header, payload }) {
      requireBytes(payload, 'picture');
      const theme = readTheme(header.theme);
      if (collected.sheets.filter((sheet) => sheet.theme === theme).length >= MOST_SHEETS_A_THEME) throw new RecordRefused('more pictures than a job can make');
      collected.sheets.push({ theme, bytes: payload });
    },
    failed({ header }) {
      const stage = FAILURE_STAGES.find((known) => known === header.stage);
      if (!stage) throw new RecordRefused('a failure from a stage that does not exist');
      collected.failure ??= { stage, reasons: readTexts(header.reasons, 'reasons') };
    },
    done() {
      collected.isDone = true;
    },
  };
  return {
    collected,
    accept(record: WorkerRecord) {
      if (collected.isDone) throw new RecordRefused('a record after the last one');
      const collect = Object.hasOwn(collectors, record.header.kind) ? collectors[record.header.kind] : undefined;
      if (!collect) throw new RecordRefused(`a ${String(record.header.kind)} record does not exist`);
      collect(record);
    },
    getMissingTheme: () => themes.find((theme) => !collected.takes.some((take) => take.theme === theme)) ?? null,
  };
}
