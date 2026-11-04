import { fail, type Place } from './read.ts';

declare const brand: unique symbol;
type Branded<Name extends string> = string & { readonly [brand]: Name };

/** Everything sent for an old turn is ignored. */
export type TurnId = Branded<'TurnId'>;

export type BeatId = Branded<'BeatId'>;

export type FileId = Branded<'FileId'>;

export type ElementId = Branded<'ElementId'>;

/** Names an element or a named part of it, such as "shot" or "shot.ball". */
export type ElementRef = Branded<'ElementRef'>;

const TOKEN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ELEMENT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const SCENE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MOMENT_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const UNSAFE_NAMES = new Set(['prototype', ...Object.getOwnPropertyNames(Object.prototype)]);

function isAllowed(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value) && !UNSAFE_NAMES.has(value);
}

function readToken(place: Place, description: string): string {
  if (!isAllowed(place.value, TOKEN)) fail(place, description);
  return place.value;
}

export function readSceneId(place: Place): string {
  if (!isAllowed(place.value, SCENE_ID)) fail(place, 'a scene id');
  return place.value;
}

export function readMomentName(place: Place): string {
  if (!isAllowed(place.value, MOMENT_NAME)) fail(place, 'a moment name');
  return place.value;
}

export function readBeatId(place: Place): BeatId {
  return readToken(place, 'a beat id') as BeatId;
}

export function readTurnId(place: Place): TurnId {
  return readToken(place, 'a turn id') as TurnId;
}

export function readFileId(place: Place): FileId {
  return readToken(place, 'a file id') as FileId;
}

export function readElementId(place: Place): ElementId {
  if (!isAllowed(place.value, ELEMENT_ID)) fail(place, 'an element id');
  return place.value as ElementId;
}

export function readElementRef(place: Place): ElementRef {
  const [element, part, ...extraParts] = typeof place.value === 'string' ? place.value.split('.') : [];
  const isPartAllowed = part === undefined || isAllowed(part, NAME);
  if (!isAllowed(element, ELEMENT_ID) || !isPartAllowed || extraParts.length > 0) fail(place, 'an element reference');
  return place.value as ElementRef;
}

export function readPartName(place: Place): string {
  if (!isAllowed(place.value, NAME)) fail(place, 'a name of letters, digits, and hyphens');
  return place.value;
}
