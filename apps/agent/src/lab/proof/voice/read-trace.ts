import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface TraceRow {
  name: string;
  atMs: number;
  turnId?: string;
  kind?: string;
  via?: string;
  reason?: string;
  isFinal?: boolean;
  words?: number;
  text?: string;
  [field: string]: unknown;
}

export function readTrace(folder: string, roomName: string): TraceRow[] {
  try {
    return readFileSync(join(folder, `${roomName}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as TraceRow);
  } catch {
    return [];
  }
}

export function listTraces(folder: string): string[] {
  return readdirSync(folder).filter((name) => name.endsWith('.jsonl')).map((name) => name.replace(/\.jsonl$/, ''));
}

export function getPercentile(values: readonly number[], percent: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor((percent / 100) * sorted.length))] as number;
}

export function summarise(values: readonly number[]) {
  const round = (value: number | null) => (value === null ? null : Math.round(value));
  return { count: values.length, p50: round(getPercentile(values, 50)), p95: round(getPercentile(values, 95)), worst: values.length ? Math.round(Math.max(...values)) : null, best: values.length ? Math.round(Math.min(...values)) : null };
}
