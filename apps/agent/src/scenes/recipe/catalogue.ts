import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PARTS_FOLDER = join(import.meta.dirname, 'parts');
const CORE_FILE = 'core.js';
const APPROVALS_FILE = 'approvals.json';
const PART_START = /^PART\('/gm;
const SHORT_HASH_CHARACTERS = 16;

export interface PartDefinition {
  name: string;
  doc: string;
  args: string;
  anchors: readonly string[];
  motions: Readonly<Record<string, string>>;
  views: Readonly<Record<string, readonly [number, number]>>;
  stage?: 'space' | 'studio' | 'outdoor';
  /** False for a part that shares a stage. Any other part is a whole scene and is used alone. */
  alone?: boolean;
  source: string;
  /** Names this exact code, so changing a part takes back its approval. */
  hash: string;
}

export type PartCatalogue = ReadonlyMap<string, PartDefinition>;

export type PartApprovals = Readonly<Record<string, { hash: string; approvedAt: string }>>;

const getHash = (source: string) => createHash('sha256').update(source).digest('hex').slice(0, SHORT_HASH_CHARACTERS);

function readPartDefinition(source: string): PartDefinition {
  let found: Omit<PartDefinition, 'source' | 'hash'> | null = null;
  // Our own reviewed file, read for what it declares. Its build code only ever runs in the scene's sandbox.
  new Function('PART', source)((name: string, declared: Omit<PartDefinition, 'name' | 'source' | 'hash'>) => {
    found = { ...declared, name };
  });
  if (!found) throw new Error(`no PART in: ${source.slice(0, 60)}`);
  const { anchors = [], motions = {}, views = {}, ...declared } = found as Partial<PartDefinition> & Pick<PartDefinition, 'name' | 'doc' | 'args'>;
  return { ...declared, anchors, motions, views, source, hash: getHash(source) };
}

function splitIntoPartSources(fileText: string): string[] {
  const starts = [...fileText.matchAll(PART_START)].map((found) => found.index);
  return starts.map((start, index) => fileText.slice(start, starts[index + 1]).trim());
}

let catalogue: PartCatalogue | null = null;

export function getPartCatalogue(): PartCatalogue {
  catalogue ??= new Map(
    readdirSync(PARTS_FOLDER)
      .filter((file) => file.endsWith('.js') && file !== CORE_FILE)
      .sort()
      .flatMap((file) => splitIntoPartSources(readFileSync(join(PARTS_FOLDER, file), 'utf8')))
      .map(readPartDefinition)
      .map((part) => [part.name, part]),
  );
  return catalogue;
}

export const getCoreSource = () => readFileSync(join(PARTS_FOLDER, CORE_FILE), 'utf8');

const getApprovalsPath = (folder: string) => join(folder, APPROVALS_FILE);

export function readPartApprovals(folder = PARTS_FOLDER): PartApprovals {
  const path = getApprovalsPath(folder);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as PartApprovals) : {};
}

export function writePartApproval({ name, isApproved, folder = PARTS_FOLDER, atIso = new Date().toISOString() }: { name: string; isApproved: boolean; folder?: string; atIso?: string }): void {
  const part = getPartCatalogue().get(name);
  if (!part) throw new Error(`no part named ${name}`);
  const { [name]: _old, ...others } = readPartApprovals(folder);
  const next = isApproved ? { ...others, [name]: { hash: part.hash, approvedAt: atIso } } : others;
  writeFileSync(getApprovalsPath(folder), `${JSON.stringify(next, null, 2)}\n`);
}

export const isPartApproved = (part: Pick<PartDefinition, 'name' | 'hash'>, approvals: PartApprovals) => approvals[part.name]?.hash === part.hash;

/** Parts a person has approved by eye. The demo switch opens the rest, and no student build sets it. */
export function getUsableParts({ canUseUnapproved = process.env.ASTRA_FAST_SCENES_ANY_PART === '1', approvals = readPartApprovals() }: { canUseUnapproved?: boolean; approvals?: PartApprovals } = {}): PartCatalogue {
  const parts = [...getPartCatalogue().values()];
  return new Map(parts.filter((part) => canUseUnapproved || isPartApproved(part, approvals)).map((part) => [part.name, part]));
}

function describePart({ name, alone, doc, args, anchors, motions, views, stage }: PartDefinition): string {
  const motionList = Object.entries(motions).map(([motion, what]) => `${motion} (${what})`).join('; ') || 'none';
  const viewList = [...new Set(['front', ...Object.keys(views).filter((view) => view !== 'flat')])].join(',');
  return `${name}${alone === false ? '' : ' (a whole scene, use it alone)'}: ${doc}\n  args: ${args || 'none'}\n  anchors: ${anchors.join(', ') || 'none'}\n  motions: ${motionList}\n  views: ${viewList}, left, right, above${stage ? `\n  stage: ${stage}` : ''}`;
}

export const getPartManifest = (parts: PartCatalogue) => [...parts.values()].map(describePart).join('\n');
