import { expect } from 'vitest';
import { type Beat, parseBeat, type ParseResult, parseSceneCommand, type SceneCommand } from '../src/index.ts';

export const ONE_OF_EACH_COMMAND: Record<SceneCommand['kind'], Record<string, unknown>> = {
  writeMath: { kind: 'writeMath', id: 'equation', tex: 'x^2 + 1' },
  transformMath: { kind: 'transformMath', target: 'equation', tex: 'x^2 = -1' },
  highlight: { kind: 'highlight', id: 'term', target: 'equation', tex: 'x', occurrence: 1 },
  plot: { kind: 'plot', id: 'curve', expression: 'x^2', domain: [-2, 2], yRange: [0, 4], label: 'y = x squared', xLabel: 'time', yLabel: 'height', over: 'axes', startsEmpty: true },
  shadeArea: { kind: 'shadeArea', id: 'area', target: 'curve', from: 0, to: 2, label: 'distance' },
  numberLine: { kind: 'numberLine', id: 'line', domain: [0, 10] },
  markValue: { kind: 'markValue', id: 'four', target: 'line', at: 4, label: 'four' },
  geometry: { kind: 'geometry', id: 'figure', xRange: [0, 5], yRange: [0, 5] },
  construct: { kind: 'construct', id: 'point-a', target: 'figure', step: { shape: 'point', name: 'A', x: 1, y: 2 } },
  vector: { kind: 'vector', id: 'push', on: 'shot.ball', angleDegrees: 0, length: 'medium', label: 'hand' },
  simulate: { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4, upwardSpeed: 5, releaseHeight: 2, gravity: 9.81 } }, over: 'court' },
  richScene: { kind: 'richScene', id: 'slope', engine: 'manimgx', sceneId: 'what-a-derivative-measures-1a2b3c4d', moments: { secant: 3.2, tangent: 9.5 }, parts: ['curve', 'point'], durationSeconds: 20 },
  runSimulation: { kind: 'runSimulation', target: 'shot', action: 'play', until: 'peak', overWords: 4 },
  setParameter: { kind: 'setParameter', target: 'shot', parameter: 'gravity', value: 1.62 },
  trackVector: { kind: 'trackVector', id: 'sideways', target: 'shot', quantity: 'velocity-x' },
  readout: { kind: 'readout', id: 'how-far', target: 'shot', quantity: 'distance', label: 'distance' },
  slider: { kind: 'slider', id: 'speed', target: 'shot', parameter: 'horizontalSpeed', min: 0, max: 12 },
  ghostPath: { kind: 'ghostPath', id: 'first-arc', target: 'shot' },
  drawing: { kind: 'drawing', id: 'court', name: 'hoop-side', labels: [{ part: 'rim', text: 'the rim' }] },
  diagram: { kind: 'diagram', id: 'cycle', nodes: [{ name: 'a', label: 'Rain' }, { name: 'b', label: 'River' }], edges: [{ from: 'a', to: 'b', label: 'runs into' }], handwritten: true, startsEmpty: true },
  table: { kind: 'table', id: 'values', columns: ['x', 'y'], rows: [['1', '2']], startsEmpty: true },
  timeline: { kind: 'timeline', id: 'dates', events: [{ when: '1687', label: 'Principia' }], startsEmpty: true },
  code: { kind: 'code', id: 'snippet', language: 'python', source: 'print(1)', startsEmpty: true },
  reveal: { kind: 'reveal', target: 'values', upTo: 2, overWords: 5 },
  image: { kind: 'image', id: 'painting', asset: 'great-wave', alt: 'The Great Wave off Kanagawa' },
  text: { kind: 'text', id: 'note', text: 'Force equals mass times acceleration', handwritten: true },
  annotate: { kind: 'annotate', id: 'underline-1', target: 'equation', mark: 'underline', label: 'this term' },
  focus: { kind: 'focus', target: 'shot.ball' },
  hide: { kind: 'hide', target: 'push' },
  clearBoard: { kind: 'clearBoard' },
};

export function makeBeat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'b1', script: ['Watch this arrow.'], expectsReply: false, ...overrides };
}

export function withCommand(command: unknown): Record<string, unknown> {
  return makeBeat({ script: [command, 'Watch this arrow.'] });
}

export function parseOrThrow(input: unknown): Beat {
  const parsed = parseBeat(input);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

export function commandOrThrow(input: unknown): SceneCommand {
  const parsed = parseSceneCommand(input);
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

export function expectRefused(result: ParseResult<unknown>, reason: RegExp): void {
  if (result.ok) throw new Error(`expected a refusal matching ${reason}, but it parsed`);
  expect(result.problem).toMatch(reason);
}

export function withoutField(source: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== field));
}

export function getJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}
