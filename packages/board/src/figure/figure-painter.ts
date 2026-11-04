/// <reference lib="dom" />
import type { Branch, FigureMark, MarkTone, MarkWeight } from './figure-marks.ts';
import { LABEL_FONT } from './place-labels.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TONES: Record<MarkTone, string> = { ink: 'var(--color-ink)', 'ink-2': 'var(--color-ink-2)', line: 'var(--color-line)', pen: 'var(--color-pen)' };
const WEIGHT_CLASSES: Record<MarkWeight, string> = { hair: 'figure-hair', thin: 'figure-thin', bold: 'figure-bold' };
const TAG_OF_MARK: Record<FigureMark['kind'], string> = { path: 'path', area: 'path', dot: 'circle', text: 'text' };

interface PaintedMark {
  node: SVGElement;
  kind: FigureMark['kind'];
  branches: readonly Branch[] | null;
}

const toFixed = (value: number) => Number(value.toFixed(2));

function getPathData(branches: readonly Branch[], isClosed: boolean): string {
  let data = '';
  for (const branch of branches) {
    branch.forEach((point, index) => {
      data += `${index === 0 ? 'M' : 'L'}${toFixed(point.x)} ${toFixed(point.y)}`;
    });
    if (isClosed && branch.length > 0) data += 'Z';
  }
  return data;
}

function setAttribute(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

function paintText(node: SVGElement, mark: FigureMark & { kind: 'text' }): void {
  setAttribute(node, 'x', String(toFixed(mark.at.x)));
  setAttribute(node, 'y', String(toFixed(mark.at.y)));
  setAttribute(node, 'text-anchor', mark.anchor);
  setAttribute(node, 'fill', TONES[mark.tone]);
  const spans = [...node.children];
  mark.lines.forEach((line, index) => {
    const span = spans[index] ?? node.appendChild(document.createElementNS(SVG_NAMESPACE, 'tspan'));
    setAttribute(span, 'x', String(toFixed(mark.at.x)));
    setAttribute(span, 'y', String(toFixed(mark.at.y + index * LABEL_FONT.lineHeight)));
    if (span.textContent !== line) span.textContent = line;
  });
  for (const extra of spans.slice(mark.lines.length)) extra.remove();
}

function paintMark(painted: PaintedMark, mark: FigureMark): void {
  const { node } = painted;
  if (mark.kind === 'text') return paintText(node, mark);
  if (mark.kind === 'dot') {
    setAttribute(node, 'cx', String(toFixed(mark.at.x)));
    setAttribute(node, 'cy', String(toFixed(mark.at.y)));
    setAttribute(node, 'r', String(toFixed(mark.radius)));
    setAttribute(node, 'fill', TONES[mark.tone]);
    return;
  }
  const branches = mark.kind === 'path' ? mark.branches : mark.polygons;
  if (painted.branches !== branches) setAttribute(node, 'd', getPathData(branches, mark.kind === 'area'));
  painted.branches = branches;
  if (mark.kind === 'area') {
    setAttribute(node, 'fill', TONES[mark.tone]);
    return;
  }
  setAttribute(node, 'stroke', TONES[mark.tone]);
  setAttribute(node, 'class', mark.isDashed ? `${WEIGHT_CLASSES[mark.weight]} figure-dashed` : WEIGHT_CLASSES[mark.weight]);
}

/** A mark that did not change writes nothing, so a frozen board stays untouched. */
export function createFigurePainter(svg: SVGElement) {
  const painted = new Map<string, PaintedMark>();
  let lastOrder = '';

  const getPainted = (mark: FigureMark): PaintedMark => {
    const known = painted.get(mark.key);
    if (known?.kind === mark.kind) return known;
    known?.node.remove();
    const node = document.createElementNS(SVG_NAMESPACE, TAG_OF_MARK[mark.kind]);
    node.setAttribute('data-mark', mark.key);
    const created = { node, kind: mark.kind, branches: null };
    painted.set(mark.key, created);
    svg.append(node);
    return created;
  };

  return {
    paint(marks: readonly FigureMark[]) {
      for (const mark of marks) paintMark(getPainted(mark), mark);
      const live = new Set(marks.map((mark) => mark.key));
      for (const [key, { node }] of painted) {
        if (live.has(key)) continue;
        node.remove();
        painted.delete(key);
      }
      const order = marks.map((mark) => mark.key).join('|');
      if (order !== lastOrder) for (const mark of marks) svg.append((painted.get(mark.key) as PaintedMark).node);
      lastOrder = order;
    },
  };
}
