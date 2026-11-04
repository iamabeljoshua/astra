import { describe, expect, it } from 'vitest';
import { type DiagramTextLabel, drawDiagram } from '../src/drawing.ts';
import type { InkPosition, InkStroke } from '../src/ink/ink-stroke.ts';
import { makeSeededRandom } from '../src/ink/ink-stroke.ts';

const GRAPHS = 1000;
const GRAPHS_TIME_LIMIT_MS = 60_000;
const STEP_PX = 2;
const LARGEST_LABEL = 28;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function getBoxOf({ points }: InkStroke): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function walkLine({ points }: InkStroke): InkPosition[] {
  return points.slice(1).flatMap((point, index) => {
    const before = points[index] as InkPosition;
    const steps = Math.ceil(Math.hypot(point.x - before.x, point.y - before.y) / STEP_PX) + 1;
    return Array.from({ length: steps + 1 }, (_, step) => ({ x: before.x + ((point.x - before.x) * step) / steps, y: before.y + ((point.y - before.y) * step) / steps }));
  });
}

function makeGraph(seed: string) {
  const random = makeSeededRandom(seed);
  const nodeCount = 1 + Math.floor(random() * 12);
  const edgeCount = Math.floor(random() * 21);
  const pick = () => `n${Math.floor(random() * nodeCount)}`;
  return {
    nodes: Array.from({ length: nodeCount }, (_, index) => ({ name: `n${index}`, label: 'word '.repeat(1 + Math.floor(random() * LARGEST_LABEL)).trim() })),
    edges: Array.from({ length: edgeCount }, () => ({ from: pick(), to: pick(), ...(random() < 0.3 ? { label: 'goes on to' } : {}) })),
    handwritten: false,
    maxWidth: 200 + Math.floor(random() * 900),
  };
}

const isIn = ({ x, y }: InkPosition, box: Box) => x > box.left && x < box.right && y > box.top && y < box.bottom;

const getLabelBox = ({ x, y, width, height }: DiagramTextLabel): Box => ({ left: x, top: y, right: x + width, bottom: y + height });

const doOverlap = (first: Box, second: Box) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;

function findCrossings(seed: string): string[] {
  const { maxWidth, ...diagram } = makeGraph(seed);
  const { steps } = drawDiagram(diagram, { fontSize: 18, maxWidth, seed, measureText: (text, fontSize) => text.length * fontSize * 0.6 });
  const strokes = steps.flatMap((step) => step.strokes);
  const boxes = strokes.filter(({ role }) => role === 'box').map(getBoxOf);
  const labels = steps.flatMap((step) => step.textLabels).map(getLabelBox);
  const walked = strokes.filter(({ role }) => role === 'line').flatMap(walkLine);
  const lineOnBox = boxes.filter((box) => walked.some((point) => isIn(point, box))).map(() => `${seed}: an arrow crosses a box`);
  const lineOnLabel = labels.filter((label) => walked.some((point) => isIn(point, label))).map(() => `${seed}: an arrow crosses a label`);
  const labelOnLabel = labels.flatMap((label, index) => labels.slice(index + 1).filter((other) => doOverlap(label, other)).map(() => `${seed}: two labels overlap`));
  return [...lineOnBox, ...lineOnLabel, ...labelOnLabel];
}

describe('a layered diagram', () => {
  it(`keeps every arrow off every box and every label, and every label off every other, across ${GRAPHS} graphs with skips, loops, returns, and repeats`, () => {
    const crossings = Array.from({ length: GRAPHS }, (_, index) => findCrossings(`graph-${index}`)).flat();
    expect(crossings).toEqual([]);
  }, GRAPHS_TIME_LIMIT_MS);

  it('runs an arrow around a node between its ends and not through it', () => {
    const diagram = { nodes: [{ name: 'top', label: 'Top' }, { name: 'middle', label: 'A wide node right in the way of the long arrow' }, { name: 'bottom', label: 'Bottom' }], edges: [{ from: 'top', to: 'middle' }, { from: 'middle', to: 'bottom' }, { from: 'top', to: 'bottom' }], handwritten: false };
    const strokes = drawDiagram(diagram, { fontSize: 18, maxWidth: 400, seed: 's' }).steps.flatMap((step) => step.strokes);
    const [, middleBox] = strokes.filter(({ role }) => role === 'box').map(getBoxOf) as [Box, Box, Box];
    for (const line of strokes.filter(({ role }) => role === 'line')) for (const { x, y } of walkLine(line)) expect(x > middleBox.left && x < middleBox.right && y > middleBox.top && y < middleBox.bottom).toBe(false);
  });

  it('draws a node pointing at itself with a loop outside its box', () => {
    const { steps, width, height } = drawDiagram({ nodes: [{ name: 'a', label: 'Waiting' }], edges: [{ from: 'a', to: 'a', label: 'again' }], handwritten: false }, { fontSize: 18, maxWidth: 400, seed: 's' });
    const strokes = steps.flatMap((step) => step.strokes);
    const box = getBoxOf(strokes.find(({ role }) => role === 'box') as InkStroke);
    const line = strokes.filter(({ role }) => role === 'line').flatMap(walkLine);
    expect(line.length).toBeGreaterThan(0);
    expect(line.every(({ x, y }) => (x > box.right || y > box.bottom) && x <= width && y <= height)).toBe(true);
  });
});
