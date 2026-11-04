import type { Drawing } from '@astra/contracts';
import { type DiagramRequest, type DiagramStep, type DiagramTextLabel, type DrawnDiagram, type LabelDrawing, setPlainLabel } from '../ink/diagram.ts';
import { getSpread, makeSeededRandom, makeStroke, type InkPosition, type InkStroke } from '../ink/ink-stroke.ts';
import type { MarkBox } from '../ink/marks.ts';
import { DRAWING_SHEETS, type DrawingSheet, type SheetPart } from './drawing-sheets.ts';

const LARGEST_BODY_WIDTH = 460;
const SMALLEST_GUTTER = 72;
const LARGEST_GUTTER = 190;
const GUTTER_SHARE = 0.27;
const SIDE_GAP = 10;
const LABEL_GAP = 8;
const LEADER_GAP = 4;
const WOBBLE = 0.6;
/** A font's box starts above its baseline's ascent, so the first label starts a little down. */
const TOP_ROOM_EMS = 0.2;

export interface LabeledDrawing extends DrawnDiagram {
  partBoxes: ReadonlyMap<string, MarkBox>;
}

interface PlacedLabel {
  anchor: SheetPart;
  text: LabelDrawing;
  y: number;
}

type DrawingLabels = NonNullable<Drawing['labels']>;

const wobble = (random: () => number) => (point: InkPosition, scale: number, at: InkPosition): InkPosition => ({ x: at.x + point.x * scale + getSpread(random, WOBBLE), y: at.y + point.y * scale + getSpread(random, WOBBLE) });

function getSideLabels(labels: DrawingLabels, sheet: DrawingSheet, isLeft: boolean, request: DiagramRequest & { gutter: number }): PlacedLabel[] {
  const picked = labels.flatMap((label) => {
    const anchor = sheet.parts[label.part];
    return anchor && (anchor.x < 50) === isLeft ? [{ anchor, text: setPlainLabel(label.text, { ...request, maxWidth: request.gutter }), y: 0 }] : [];
  });
  return picked.sort((first, second) => first.anchor.y - second.anchor.y);
}

// Each label sits level with its part where it can, and pushes the ones after it down, then back up if they ran past the bottom.
function stackLabels(labels: PlacedLabel[], { scale, bodyHeight, topRoom }: { scale: number; bodyHeight: number; topRoom: number }): number {
  let bottom = topRoom;
  for (const label of labels) {
    label.y = Math.max(bottom, label.anchor.y * scale - label.text.height / 2);
    bottom = label.y + label.text.height + LABEL_GAP;
  }
  let limit = Math.max(bodyHeight, topRoom + labels.reduce((sum, label) => sum + label.text.height + LABEL_GAP, 0) - LABEL_GAP);
  for (const label of [...labels].reverse()) {
    label.y = Math.max(topRoom, Math.min(label.y, limit - label.text.height));
    limit = label.y - LABEL_GAP;
  }
  return labels.reduce((tallest, label) => Math.max(tallest, label.y + label.text.height), 0);
}

function getLabelStep(label: PlacedLabel, { x, isLeft, bodyAt, scale }: { x: number; isLeft: boolean; bodyAt: InkPosition; scale: number }): DiagramStep {
  const middleY = label.y + label.text.height / 2;
  const startX = isLeft ? x + label.text.width + LEADER_GAP : x - LEADER_GAP;
  const leader: InkStroke = makeStroke([{ x: startX, y: middleY }, { x: bodyAt.x + label.anchor.x * scale, y: bodyAt.y + label.anchor.y * scale }]);
  return { strokes: [leader], textLabels: [{ ...(label.text.text as DiagramTextLabel), x, y: label.y }] };
}

/** One of our drawings, drawn first, with each label then arriving in a gutter beside it on a line to its part. A short board shrinks the whole, so nothing here depends on height. */
export function drawLabeledSheet({ name, labels = [] }: Pick<Drawing, 'name' | 'labels'>, request: DiagramRequest): LabeledDrawing | null {
  const sheet = DRAWING_SHEETS[name];
  if (!sheet) return null;
  const gutter = Math.max(SMALLEST_GUTTER, Math.min(LARGEST_GUTTER, request.maxWidth * GUTTER_SHARE));
  const left = getSideLabels(labels, sheet, true, { ...request, gutter });
  const right = getSideLabels(labels, sheet, false, { ...request, gutter });
  const leftRoom = left.length > 0 ? Math.max(...left.map(({ text }) => text.width)) + SIDE_GAP : 0;
  const rightRoom = right.length > 0 ? Math.max(...right.map(({ text }) => text.width)) + SIDE_GAP : 0;
  const bodyWidth = Math.max(0, Math.min(LARGEST_BODY_WIDTH, request.maxWidth - leftRoom - rightRoom));
  const scale = bodyWidth / 100;
  const bodyHeight = sheet.height * scale;
  const topRoom = request.fontSize * TOP_ROOM_EMS;
  const tallest = Math.max(bodyHeight, stackLabels(left, { scale, bodyHeight, topRoom }), stackLabels(right, { scale, bodyHeight, topRoom }));
  const bodyAt = { x: leftRoom, y: 0 };
  const rightX = leftRoom + bodyWidth + SIDE_GAP;
  const toPage = wobble(makeSeededRandom(request.seed));
  const body: DiagramStep = { strokes: sheet.strokes.map((points) => makeStroke(points.map((point) => toPage(point, scale, bodyAt)))), textLabels: [] };
  const steps = [body, ...left.map((label) => getLabelStep(label, { x: 0, isLeft: true, bodyAt, scale })), ...right.map((label) => getLabelStep(label, { x: rightX, isLeft: false, bodyAt, scale }))];
  const partBoxes = new Map(Object.entries(sheet.parts).map(([partName, { x, y, radius }]) => [partName, { x: bodyAt.x + (x - radius) * scale, y: bodyAt.y + (y - radius) * scale, width: 2 * radius * scale, height: 2 * radius * scale }]));
  return { steps, width: leftRoom + bodyWidth + rightRoom, height: tallest, partBoxes };
}
