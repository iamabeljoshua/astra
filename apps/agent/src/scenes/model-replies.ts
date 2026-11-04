import type { FactError, RouteEngine, SceneRoute, SceneVerdict, SceneUsage } from './scene-types.ts';

const JSON_OBJECT = /\{[\s\S]*\}/;
const ENGINES: readonly RouteEngine[] = ['manimgx', 'kit', 'none'];
const MOST_TOPIC_CHARACTERS = 80;
/** A topic is shared truth, so anything that points at one person means the router leaked the request into it. */
const POINTS_AT_A_PERSON = /@|\d{5,}|https?:|\b(my|i|me|mine|our|we)\b/i;

export function readJsonObject(text: string): Record<string, unknown> {
  const found = text.match(JSON_OBJECT)?.[0];
  if (!found) throw new Error('the model sent no JSON object');
  return JSON.parse(found) as Record<string, unknown>;
}

// A router that says anything else gets no scene, because a wrong scene is the worst failure.
export function getRouteFromText(text: string): Omit<SceneRoute, keyof SceneUsage> {
  const reply = readJsonObject(text);
  const engine = ENGINES.find((name) => name === reply.engine) ?? 'none';
  const topic = typeof reply.topic === 'string' ? reply.topic.trim().slice(0, MOST_TOPIC_CHARACTERS) : '';
  const isSafeTopic = topic !== '' && !POINTS_AT_A_PERSON.test(topic);
  return { engine: engine !== 'none' && !isSafeTopic ? 'none' : engine, kind: typeof reply.kind === 'string' ? reply.kind : 'unknown', topic: isSafeTopic ? topic : '' };
}

const readErrors = (value: unknown): FactError[] => (Array.isArray(value) ? value.filter((entry): entry is FactError => typeof entry === 'object' && entry !== null && typeof (entry as FactError).what === 'string') : []);

// A reply we cannot read fails, because only a clear pass may reach a student.
export function getVerdictFromText(text: string): Omit<SceneVerdict, keyof SceneUsage> {
  const reply = readJsonObject(text);
  const errors = readErrors(reply.errors);
  return { isPass: reply.verdict === 'pass' && errors.length === 0, errors };
}
