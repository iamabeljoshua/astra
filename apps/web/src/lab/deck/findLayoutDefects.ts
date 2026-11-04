import { RAW_MATH } from '@astra/contracts';

export const DEFECT_KINDS = ['text-on-text', 'text-off-board', 'text-off-its-element', 'text-clipped', 'element-on-element', 'element-off-board', 'ink-off-board', 'ink-on-neighbour', 'line-on-box', 'line-on-text', 'raw-source', 'error-mark', 'forbidden-element', 'broken-image', 'stretched-image', 'not-finite', 'unknown-color', 'gradient', 'too-small', 'dropped-words', 'silent-problem', 'unseen-element', 'unseen-text', 'text-on-picture', 'label-out-of-box', 'leader-off-label', 'turned-element', 'cropped-image'] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

export interface Defect {
  kind: DefectKind;
  detail: string;
}

export interface ExpectedWords {
  elementId: string;
  words: readonly string[];
  isWrittenInStrokes: boolean;
  isRevealedInSteps: boolean;
  /** The element a mark or an attached curve sits on, which takes its words with it when it leaves the board. */
  hostId: string | null;
}

export interface ReportedProblems {
  labelsWithoutRoom: ReadonlySet<string>;
  tooSmallElements: ReadonlySet<string>;
  missingImages: ReadonlySet<string>;
  marksWithoutTarget: ReadonlySet<string>;
  refusedMath: ReadonlySet<string>;
}

export interface DefectRequest {
  board: HTMLElement;
  expected: readonly ExpectedWords[];
  reported: ReportedProblems;
  isAtRest: boolean;
  arriving: ReadonlySet<string>;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PlacedText {
  owner: Element;
  ownerKey: string;
  box: Box;
  text: string;
  wrapper: HTMLElement | null;
  isMath: boolean;
}

const TEXT_OWNERS = 'p, td, th, figcaption, label, .board-slider-value, .board-timeline-when, .board-timeline-label, .board-code-number, .board-code-source, .board-image-missing';
const SMALLEST_READABLE_PX = 9;
const EDGE_ROOM_PX = 0.5;
const HOME_ROOM_PX = 1.5;
const TEXT_ROOM_PX = 1;
const LINE_STEP_PX = 4;
const WALK_STEP_PX = 2;
/** A font's box stands well above and below its letters, so a stroke counts only once it reaches this far in. */
const LETTER_BOX_SHRINK = 0.2;
const LEADER_REACH_PX = 14;
const BOX_ROOM_PX = 3;
const LEAST_TEXT_CONTRAST = 1.6;
const LEAST_STROKE_CONTRAST = 1.15;
const LEAST_READABLE_OPACITY = 0.3;
const LINE_OVERLAP_SHARE = 0.5;
const SHOWN_OBJECT_FITS = new Set(['fill', 'contain']);
/** A hand-drawn box wobbles past its true edge, so a line must get this far in before it counts as on the box. */
const BOX_WOBBLE_PX = 2.5;
const MATH_LINE_BOX_SHRINK = 0.2;
const UNSEEN_OPACITY = 0.02;
const SETTLED_OPACITY = 0.98;
const RAW_SOURCE = /\bNaN\b|\bundefined\b|\[object |�/;
const NOT_FINITE = /NaN|Infinity|undefined/;
const WORD_ATTRIBUTES = new Set(['alt', 'aria-label', 'data-tex', 'data-mark', 'data-term']);
const ALLOWED_TAGS = new Set(['div', 'span', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ol', 'li', 'figure', 'figcaption', 'img', 'label', 'input', 'svg', 'g', 'path', 'circle', 'text', 'tspan', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtext', 'mspace', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'annotation', 'merror']);
const COLOR_PROPERTIES = ['color', 'fill', 'stroke', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'] as const;
const TOKEN_NAMES = ['paper', 'panel', 'ink', 'ink-2', 'line', 'accent', 'pen'];
const NO_COLORS = ['none', 'transparent'];

const doOverlap = (first: Box, second: Box, room = 0) => first.left + room < second.right - room && second.left + room < first.right - room && first.top + room < second.bottom - room && second.top + room < first.bottom - room;

const isOutside = (box: Box, bounds: Box, room: number) => box.left < bounds.left - room || box.top < bounds.top - room || box.right > bounds.right + room || box.bottom > bounds.bottom + room;

const hasArea = (box: DOMRect) => box.width > 0 && box.height > 0;

const describe = (box: Box) => `${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`;

type Rgba = readonly [number, number, number, number];

function createColorReader() {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const known = new Map<string, Rgba>();
  return (color: string): Rgba => {
    const seen = known.get(color);
    if (seen) return seen;
    if (!context) return [0, 0, 0, 1];
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data as unknown as [number, number, number, number];
    const read: Rgba = [red, green, blue, alpha / 255];
    known.set(color, read);
    return read;
  };
}

const getLuminance = (channels: readonly number[]) => {
  const [red, green, blue] = channels.map((channel) => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const getContrast = (first: readonly number[], second: readonly number[]) => {
  const [lighter, darker] = [getLuminance(first), getLuminance(second)].sort((one, two) => two - one) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
};

// Everything here asks what is painted, so words and marks that exist on the page and cannot be seen do not count as shown.
function createPaintReader(board: HTMLElement) {
  const opacities = new Map<Element, number>();
  const clipped = new Map<Element, boolean>();
  const readColor = createColorReader();
  const getOpacity = (element: Element): number => {
    const known = opacities.get(element);
    if (known !== undefined) return known;
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    const own = style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
    const chained = element === board || !parent ? own : own * (getComputedStyle(parent).display === 'none' ? 0 : getOpacity(parent));
    opacities.set(element, chained);
    return chained;
  };
  const isClipped = (element: Element): boolean => {
    const known = clipped.get(element);
    if (known !== undefined) return known;
    const parent = element.parentElement;
    const found = getComputedStyle(element).clipPath !== 'none' || (element !== board && parent !== null && isClipped(parent));
    clipped.set(element, found);
    return found;
  };
  const getBackground = (element: Element): Rgba => {
    for (let place: Element | null = element; place; place = place.parentElement) {
      if (place instanceof SVGElement) continue;
      const color = readColor(getComputedStyle(place).backgroundColor);
      if (color[3] > 0.5) return color;
    }
    return [255, 255, 255, 1];
  };
  const getTextContrast = (element: Element): number => {
    const style = getComputedStyle(element);
    const color = readColor(element instanceof SVGElement ? style.fill : style.webkitTextFillColor || style.color);
    return color[3] < UNSEEN_OPACITY ? 1 : getContrast(color, getBackground(element));
  };
  const getStrokeContrast = (element: Element): number => {
    const color = readColor(getComputedStyle(element).stroke);
    return color[3] < UNSEEN_OPACITY ? 1 : getContrast(color, getBackground(element));
  };
  const isSeen = (element: Element) => getOpacity(element) > UNSEEN_OPACITY && getComputedStyle(element).visibility !== 'hidden';
  return {
    getOpacity,
    isSeen,
    isClipped,
    getTextContrast,
    getStrokeContrast,
    canRead: (element: Element) => isSeen(element) && getOpacity(element) >= LEAST_READABLE_OPACITY && !isClipped(element) && getTextContrast(element) >= LEAST_TEXT_CONTRAST,
  };
}

type PaintReader = ReturnType<typeof createPaintReader>;

function getTextBoxes(node: Text, parent: Element, isMath: boolean): Box[] {
  if (parent.closest('svg')) return [parent.getBoundingClientRect()].filter(hasArea);
  const range = document.createRange();
  range.selectNodeContents(node);
  const boxes = [...range.getClientRects()].filter(hasArea);
  if (!isMath) return boxes;
  return boxes.map((box) => ({ left: box.left, right: box.right, top: box.top + box.height * MATH_LINE_BOX_SHRINK, bottom: box.bottom - box.height * MATH_LINE_BOX_SHRINK }));
}

function getOwner(parent: Element): { owner: Element; isMath: boolean } {
  const math = parent.closest('.katex');
  if (math) return { owner: math.closest('[data-element]') ?? math, isMath: true };
  return { owner: parent.closest('text') ?? parent.closest(TEXT_OWNERS) ?? parent, isMath: false };
}

function collectTexts(board: HTMLElement, paint: PaintReader): PlacedText[] {
  const walker = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
  const placed: PlacedText[] = [];
  const keys = new Map<Element, string>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent ?? '';
    if (!parent || text.replace(/[\s\u200b]/g, '') === '' || parent.closest('.katex-mathml, title') || !paint.isSeen(parent)) continue;
    const { owner, isMath } = getOwner(parent);
    if (!keys.has(owner)) keys.set(owner, String(keys.size));
    for (const box of getTextBoxes(node as Text, parent, isMath)) placed.push({ owner, ownerKey: keys.get(owner) as string, box, text, wrapper: parent.closest<HTMLElement>('[data-element]'), isMath });
  }
  return placed;
}

function findTextOnText(texts: readonly PlacedText[]): Defect[] {
  const defects: Defect[] = [];
  texts.forEach((first, index) => {
    for (const second of texts.slice(index + 1)) {
      if (first.ownerKey !== second.ownerKey && doOverlap(first.box, second.box, TEXT_ROOM_PX)) defects.push({ kind: 'text-on-text', detail: `"${first.text.slice(0, 30)}" on "${second.text.slice(0, 30)}" at ${describe(first.box)}` });
    }
  });
  return defects;
}

// The lines of one owner may touch, but never stack, whether a tspan or a paragraph's line box.
function findLinesOnEachOther(texts: readonly PlacedText[]): Defect[] {
  const defects: Defect[] = [];
  texts.forEach((first, index) => {
    if (first.isMath) return;
    for (const second of texts.slice(index + 1)) {
      if (first.ownerKey !== second.ownerKey) continue;
      const across = Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left);
      const down = Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top);
      const shorter = Math.min(first.box.bottom - first.box.top, second.box.bottom - second.box.top);
      if (across > TEXT_ROOM_PX && down > shorter * LINE_OVERLAP_SHARE) defects.push({ kind: 'text-on-text', detail: `two lines of "${first.text.slice(0, 30)}" lie on each other at ${describe(first.box)}` });
    }
  });
  return defects;
}

function findTextOffBoard(texts: readonly PlacedText[], { board }: Pick<DefectRequest, 'board'>): Defect[] {
  const bounds = board.getBoundingClientRect();
  return texts.filter(({ box }) => isOutside(box, bounds, EDGE_ROOM_PX)).map(({ text, box }) => ({ kind: 'text-off-board', detail: `"${text.slice(0, 30)}" at ${describe(box)}, board ${describe(bounds)}` }));
}

const isHtmlOwner = (owner: Element) => !owner.closest('svg') && owner.matches(TEXT_OWNERS);

function findTextOffItsElement(texts: readonly PlacedText[]): Defect[] {
  return texts.flatMap(({ owner, box, text, wrapper, isMath }): Defect[] => {
    const home = isHtmlOwner(owner) ? owner.getBoundingClientRect() : wrapper && !isMath ? wrapper.getBoundingClientRect() : null;
    return home && isOutside(box, home, HOME_ROOM_PX) ? [{ kind: 'text-off-its-element', detail: `"${text.slice(0, 30)}" at ${describe(box)}, home ${describe(home)}` }] : [];
  });
}

const clipsOverflow = (element: Element) => {
  const { overflowX, overflowY } = getComputedStyle(element);
  return overflowX !== 'visible' || overflowY !== 'visible';
};

function getClippingAncestors(start: Element, board: HTMLElement): Element[] {
  const clipping: Element[] = [];
  for (let element = start.parentElement; element && element !== board; element = element.parentElement) if (clipsOverflow(element)) clipping.push(element);
  return clipping;
}

// A font's box stands a little past its glyphs on an SVG label, with the ink inside, so a figure allows for that.
const isCutBy = (box: Box, clipper: Element) => {
  const bounds = clipper.getBoundingClientRect();
  const room = clipper.tagName.toLowerCase() === 'svg' ? { x: 1, y: 2 } : { x: EDGE_ROOM_PX, y: EDGE_ROOM_PX };
  return box.left < bounds.left - room.x || box.right > bounds.right + room.x || box.top < bounds.top - room.y || box.bottom > bounds.bottom + room.y || isCutByRoundedCorner(box, clipper);
};

const readRadius = (radius: string, size: number) => {
  const first = radius.split(' ')[0] ?? '0';
  return first.endsWith('%') ? (Number.parseFloat(first) / 100) * size : Number.parseFloat(first) || 0;
};

function isCutByRoundedCorner(box: Box, clipper: Element): boolean {
  const bounds = clipper.getBoundingClientRect();
  const style = getComputedStyle(clipper);
  const corners = [
    { radius: style.borderTopLeftRadius, x: box.left, y: box.top, centreX: bounds.left, centreY: bounds.top, signX: 1, signY: 1 },
    { radius: style.borderTopRightRadius, x: box.right, y: box.top, centreX: bounds.right, centreY: bounds.top, signX: -1, signY: 1 },
    { radius: style.borderBottomLeftRadius, x: box.left, y: box.bottom, centreX: bounds.left, centreY: bounds.bottom, signX: 1, signY: -1 },
    { radius: style.borderBottomRightRadius, x: box.right, y: box.bottom, centreX: bounds.right, centreY: bounds.bottom, signX: -1, signY: -1 },
  ];
  return corners.some(({ radius, x, y, centreX, centreY, signX, signY }) => {
    const across = readRadius(radius, bounds.width);
    const down = readRadius(radius, bounds.height);
    if (across <= 0 || down <= 0) return false;
    const offX = (centreX + signX * across - x) * signX;
    const offY = (centreY + signY * down - y) * signY;
    return offX > 0 && offY > 0 && (offX / across) ** 2 + (offY / down) ** 2 > 1;
  });
}

function findClippedText(texts: readonly PlacedText[], board: HTMLElement, paint: PaintReader): Defect[] {
  return texts.flatMap(({ owner, box, text, isMath }): Defect[] => {
    if (paint.isClipped(owner)) return [{ kind: 'text-clipped', detail: `"${text.slice(0, 30)}" under a clip-path` }];
    if (isMath) return [];
    const clipper = [owner, ...getClippingAncestors(owner, board)].filter((element) => clipsOverflow(element)).find((element) => isCutBy(box, element));
    return clipper ? [{ kind: 'text-clipped', detail: `"${text.slice(0, 30)}" at ${describe(box)} cut by ${clipper.tagName.toLowerCase()}` }] : [];
  });
}

function findOverflowingBoxes(board: HTMLElement, paint: PaintReader): Defect[] {
  return [...board.querySelectorAll<HTMLElement>('[data-element] *')].filter((element) => element instanceof HTMLElement && !element.closest('.katex') && clipsOverflow(element) && paint.isSeen(element) && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)).map((element) => ({ kind: 'text-clipped', detail: `${element.tagName.toLowerCase()}.${element.className} holds ${element.scrollWidth} by ${element.scrollHeight} in ${element.clientWidth} by ${element.clientHeight}` }));
}

function findElementDefects({ board, arriving }: Pick<DefectRequest, 'board' | 'arriving'>, paint: PaintReader): Defect[] {
  const bounds = board.getBoundingClientRect();
  const placed = [...board.querySelectorAll<HTMLElement>('[data-element]')].filter((element) => paint.getOpacity(element) > SETTLED_OPACITY && element.getBoundingClientRect().height > 0).map((element) => ({ id: element.dataset.element as string, box: element.getBoundingClientRect() }));
  return placed.flatMap(({ id, box }, index): Defect[] => [
    ...placed.slice(index + 1).filter((other) => doOverlap(box, other.box)).map((other): Defect => ({ kind: 'element-on-element', detail: `${id} on ${other.id}` })),
    ...(isOutside(box, bounds, EDGE_ROOM_PX) && !arriving.has(id) ? [{ kind: 'element-off-board', detail: `${id} at ${describe(box)}` } as Defect] : []),
  ]);
}

const isStrokeSeen = (path: SVGPathElement) => !(path.style.strokeDashoffset !== '' && Number(path.style.strokeDashoffset) >= 1);

function findInkDefects(board: HTMLElement, paint: PaintReader): Defect[] {
  const bounds = board.getBoundingClientRect();
  const wrappers = [...board.querySelectorAll<HTMLElement>('[data-element]')].filter((element) => paint.isSeen(element));
  const inks = [...board.querySelectorAll<SVGPathElement>('svg.board-ink path')].filter((path) => paint.isSeen(path) && isStrokeSeen(path));
  return inks.flatMap((path): Defect[] => {
    const box = path.getBoundingClientRect();
    if (!hasArea(box) && box.width === 0 && box.height === 0) return [];
    const home = path.closest<HTMLElement>('[data-element]');
    const off: Defect[] = isOutside(box, bounds, EDGE_ROOM_PX) ? [{ kind: 'ink-off-board', detail: `${home?.dataset.element ?? 'a mark'} at ${describe(box)}` }] : [];
    const neighbours = home ? wrappers.filter((wrapper) => wrapper !== home && doOverlap(box, wrapper.getBoundingClientRect(), HOME_ROOM_PX)) : [];
    return [...off, ...neighbours.map((neighbour): Defect => ({ kind: 'ink-on-neighbour', detail: `${home?.dataset.element} on ${neighbour.dataset.element}` }))];
  });
}

const walkedLines = new WeakMap<SVGGeometryElement, { key: string; points: DOMPoint[] }>();

// A path is walked once for its shape, because the sweep reads the same still drawing many times.
function getLocalPoints(path: SVGGeometryElement, step: number): DOMPoint[] {
  const key = `${path.getAttribute('d') ?? path.outerHTML}|${step}`;
  const known = walkedLines.get(path);
  if (known?.key === key) return known.points;
  const length = path.getTotalLength();
  const points = Array.from({ length: Math.ceil(length / step) + 1 }, (_, index) => path.getPointAtLength(Math.min(length, index * step)));
  walkedLines.set(path, { key, points });
  return points;
}

function getLinePoints(path: SVGGeometryElement, step = LINE_STEP_PX): DOMPoint[] {
  const toPage = path.getScreenCTM();
  if (!toPage) return [];
  return getLocalPoints(path, step).map((point) => point.matrixTransform(toPage));
}

const isInside = (point: DOMPoint, box: Box, room: number) => point.x > box.left + room && point.x < box.right - room && point.y > box.top + room && point.y < box.bottom - room;

// Reports any box or words an arrow runs through, even on a line that has not started drawing yet.
function findLineDefects(board: HTMLElement): Defect[] {
  return [...board.querySelectorAll<SVGSVGElement>('[data-element] svg')].flatMap((svg) => {
    const lines = [...svg.querySelectorAll<SVGPathElement>('path[data-ink="line"]')].map((line) => getLinePoints(line));
    if (lines.length === 0) return [];
    const id = svg.closest<HTMLElement>('[data-element]')?.dataset.element;
    const boxes = [...svg.querySelectorAll('path[data-ink="box"]')].map((box) => box.getBoundingClientRect());
    const labels = [...svg.querySelectorAll('text')].map((label) => ({ words: label.textContent ?? '', box: label.getBoundingClientRect() }));
    const onBoxes = boxes.filter((box) => lines.some((line) => line.some((point) => isInside(point, box, BOX_WOBBLE_PX)))).map((box): Defect => ({ kind: 'line-on-box', detail: `${id}: an arrow crosses the box at ${describe(box)}` }));
    const onWords = labels.filter(({ box }) => lines.some((line) => line.some((point) => isInside(point, box, TEXT_ROOM_PX)))).map(({ words, box }): Defect => ({ kind: 'line-on-text', detail: `${id}: an arrow crosses "${words.slice(0, 30)}" at ${describe(box)}` }));
    return [...onBoxes, ...onWords];
  });
}

const STROKE_SHAPES = 'svg path, svg line, svg polyline, svg circle, svg ellipse, svg rect';

const isDrawnStroke = (shape: SVGGeometryElement, paint: PaintReader) => {
  if (!paint.isSeen(shape) || !isStrokeSeen(shape as SVGPathElement)) return false;
  const { stroke, strokeOpacity } = getComputedStyle(shape);
  return stroke !== 'none' && Number(strokeOpacity) > 0;
};

const getLetterBox = ({ left, right, top, bottom }: Box): Box => ({ left: left + TEXT_ROOM_PX, right: right - TEXT_ROOM_PX, top: top + (bottom - top) * LETTER_BOX_SHRINK, bottom: bottom - (bottom - top) * LETTER_BOX_SHRINK });

const isTickNumber = (owner: Element) => owner.matches('[data-mark^="tick-"]');

const describeStroke = (shape: Element) => `${shape.closest('[data-element]')?.getAttribute('data-element') ?? 'a mark'} ${shape.getAttribute('data-mark') ?? shape.getAttribute('data-ink') ?? 'stroke'}`;

// Every stroke but a plot's grid, which lies under each word's halo, against every word but a tick number, and a word's box is cut down to its letters first.
function findStrokesThroughText(board: HTMLElement, texts: readonly PlacedText[], paint: PaintReader): Defect[] {
  const words = texts.filter(({ owner, isMath }) => isMath || !isTickNumber(owner)).map((text) => ({ ...text, letters: getLetterBox(text.box) }));
  if (words.length === 0) return [];
  return [...board.querySelectorAll<SVGGeometryElement>(STROKE_SHAPES)].filter((shape) => !shape.matches('[data-mark="grid"]') && isDrawnStroke(shape, paint)).flatMap((shape): Defect[] => {
    const box = shape.getBoundingClientRect();
    const near = words.filter(({ letters }) => doOverlap(box, letters, -1));
    if (near.length === 0) return [];
    const points = getLinePoints(shape, WALK_STEP_PX);
    return near.filter(({ letters }) => points.some((point) => isInside(point, letters, 0))).map(({ text, letters }): Defect => ({ kind: 'line-on-text', detail: `${describeStroke(shape)} crosses "${text.slice(0, 30)}" at ${describe(letters)}` }));
  });
}

function findTextOnPictures(board: HTMLElement, texts: readonly PlacedText[], paint: PaintReader): Defect[] {
  const pictures = [...board.querySelectorAll('img')].filter((image) => paint.isSeen(image)).map((image) => image.getBoundingClientRect());
  return texts.filter(({ box }) => pictures.some((picture) => doOverlap(box, picture, TEXT_ROOM_PX))).map(({ text, box }): Defect => ({ kind: 'text-on-picture', detail: `"${text.slice(0, 30)}" lies on a picture at ${describe(box)}` }));
}

const unionBoxes = (boxes: readonly Box[]): Box => ({ left: Math.min(...boxes.map(({ left }) => left)), top: Math.min(...boxes.map(({ top }) => top)), right: Math.max(...boxes.map(({ right }) => right)), bottom: Math.max(...boxes.map(({ bottom }) => bottom)) });

function getWrittenWords(svg: SVGSVGElement, paint: PaintReader): { name: string; box: Box }[] {
  const groups = new Map<string, Box[]>();
  for (const stroke of svg.querySelectorAll<SVGGeometryElement>('path[data-word]')) {
    const name = stroke.dataset.word as string;
    if (paint.isSeen(stroke)) groups.set(name, [...(groups.get(name) ?? []), stroke.getBoundingClientRect()]);
  }
  return [...groups].map(([name, boxes]) => ({ name, box: unionBoxes(boxes) }));
}

// A label written in strokes has no text node, so its strokes are read as one box, and a node's label must sit inside a box.
function findDiagramLabelDefects(board: HTMLElement, texts: readonly PlacedText[], paint: PaintReader): Defect[] {
  return [...board.querySelectorAll<SVGSVGElement>('[data-element] svg.board-ink')].flatMap((svg): Defect[] => {
    const id = svg.closest<HTMLElement>('[data-element]')?.dataset.element;
    const boxes = [...svg.querySelectorAll('path[data-ink="box"]')].filter((box) => paint.isSeen(box)).map((box) => box.getBoundingClientRect());
    const written = getWrittenWords(svg, paint);
    const typedNodes = [...svg.querySelectorAll('text[data-label="node"]')].filter((label) => paint.isSeen(label)).map((label) => ({ name: label.textContent ?? '', box: label.getBoundingClientRect() as Box }));
    const isInABox = ({ box }: { box: Box }) => boxes.some((frame) => !isOutside(box, frame, BOX_ROOM_PX));
    const outOfBox = [...typedNodes, ...written.filter(({ name }) => name.startsWith('node-'))].filter((label) => !isInABox(label)).map(({ name, box }): Defect => ({ kind: 'label-out-of-box', detail: `${id}: "${name.slice(0, 30)}" at ${describe(box)} is not inside a box` }));
    const onEachOther = written.flatMap((first, index) => written.slice(index + 1).filter((second) => doOverlap(first.box, second.box, TEXT_ROOM_PX)).map((second): Defect => ({ kind: 'text-on-text', detail: `${id}: written "${first.name}" on written "${second.name}" at ${describe(first.box)}` })));
    const typed = texts.filter(({ owner }) => owner.closest('svg') === svg).map(({ box }) => box);
    const onTyped = written.filter(({ box }) => typed.some((other) => doOverlap(box, other, TEXT_ROOM_PX))).map(({ name, box }): Defect => ({ kind: 'text-on-text', detail: `${id}: written "${name}" on typed words at ${describe(box)}` }));
    const lines = [...svg.querySelectorAll<SVGGeometryElement>('path[data-ink="line"], path[data-ink="leader"]')].filter((line) => isDrawnStroke(line, paint)).map((line) => getLinePoints(line, WALK_STEP_PX));
    const lineOnWritten = written.filter(({ box }) => lines.some((line) => line.some((point) => isInside(point, getLetterBox(box), 0)))).map(({ name, box }): Defect => ({ kind: 'line-on-text', detail: `${id}: a line crosses written "${name}" at ${describe(box)}` }));
    return [...outOfBox, ...onEachOther, ...onTyped, ...lineOnWritten];
  });
}

// A leader is drawn with its label, in the same order, so the nth leader must start beside the nth label.
function findLeadersOffTheirLabels(board: HTMLElement): Defect[] {
  return [...board.querySelectorAll<SVGSVGElement>('[data-element] svg.board-ink')].flatMap((svg): Defect[] => {
    const labels = [...svg.querySelectorAll('text[data-label="part"]')];
    const leaders = [...svg.querySelectorAll<SVGGeometryElement>('path[data-ink="leader"]')];
    return leaders.flatMap((leader, index): Defect[] => {
      const label = labels[index];
      const start = getLinePoints(leader)[0];
      if (!label || !start) return [{ kind: 'leader-off-label', detail: `leader ${index} has no label` }];
      const box = label.getBoundingClientRect();
      const distance = Math.hypot(Math.max(box.left - start.x, 0, start.x - box.right), Math.max(box.top - start.y, 0, start.y - box.bottom));
      return distance > LEADER_REACH_PX ? [{ kind: 'leader-off-label', detail: `the line from "${(label.textContent ?? '').slice(0, 30)}" starts ${Math.round(distance)} px away from it` }] : [];
    });
  });
}

function findUnseenText(texts: readonly PlacedText[], paint: PaintReader): Defect[] {
  const checked = new Set<string>();
  return texts.flatMap(({ owner, ownerKey, text }): Defect[] => {
    if (checked.has(ownerKey)) return [];
    checked.add(ownerKey);
    if (paint.getOpacity(owner) < LEAST_READABLE_OPACITY) return [{ kind: 'unseen-text', detail: `"${text.slice(0, 30)}" at opacity ${paint.getOpacity(owner).toFixed(2)}` }];
    const contrast = paint.getTextContrast(owner);
    return contrast < LEAST_TEXT_CONTRAST ? [{ kind: 'unseen-text', detail: `"${text.slice(0, 30)}" at contrast ${contrast.toFixed(2)} on what is behind it` }] : [];
  });
}

const hasSeenStroke = (svg: Element, paint: PaintReader) => [...svg.querySelectorAll<SVGGeometryElement>('path')].some((path) => isDrawnStroke(path, paint) && paint.getStrokeContrast(path) >= LEAST_STROKE_CONTRAST);

// At rest an element is seen or has been moved off a full board, and nothing else may hide it.
function findUnseenElements({ board, expected }: Pick<DefectRequest, 'board' | 'expected'>, paint: PaintReader): Defect[] {
  return expected.flatMap(({ elementId, isRevealedInSteps }): Defect[] => {
    const wrapper = board.querySelector<HTMLElement>(`[data-element="${CSS.escape(elementId)}"]`);
    if (!wrapper || wrapper.hasAttribute('data-moved-off') || wrapper.hasAttribute('data-no-place')) return [];
    const box = wrapper.getBoundingClientRect();
    if (paint.getOpacity(wrapper) < SETTLED_OPACITY || !paint.isSeen(wrapper) || !hasArea(box) || paint.isClipped(wrapper)) return [{ kind: 'unseen-element', detail: `${elementId} is unseen at rest, at opacity ${paint.getOpacity(wrapper).toFixed(2)}` }];
    const pictures = [...wrapper.querySelectorAll('img')].filter((image) => !paint.isSeen(image) || paint.getOpacity(image) < SETTLED_OPACITY);
    if (pictures.length > 0) return [{ kind: 'unseen-element', detail: `${elementId} holds a picture that is unseen at rest` }];
    if (isRevealedInSteps) return [];
    const inks = [...wrapper.querySelectorAll('svg.board-ink')];
    const blank = inks.find((svg) => svg.querySelector('path') && !hasSeenStroke(svg, paint));
    const stopped = inks.flatMap((svg) => [...svg.querySelectorAll<SVGGeometryElement>('path')]).find((path) => !isDrawnStroke(path, paint) || (path as SVGPathElement).style.strokeDashoffset !== '');
    return blank || stopped ? [{ kind: 'unseen-element', detail: `${elementId} has strokes that never finished drawing` }] : [];
  });
}

function findTurnedElements(board: HTMLElement): Defect[] {
  return [...board.querySelectorAll<HTMLElement>('[data-element], [data-element] img, [data-element] svg, [data-element] p, [data-element] table')].flatMap((element): Defect[] => {
    const { transform } = getComputedStyle(element);
    if (transform === 'none') return [];
    const { a, b, c, d } = new DOMMatrix(transform);
    return a <= 0 || d <= 0 || Math.abs(b) > 0.001 || Math.abs(c) > 0.001 ? [{ kind: 'turned-element', detail: `${element.tagName.toLowerCase()} turned by ${transform}` }] : [];
  });
}

function findRawSource(texts: readonly PlacedText[]): Defect[] {
  return texts.filter(({ owner, isMath, text }) => !isMath && !owner.closest('.board-code') && (RAW_SOURCE.test(text) || RAW_MATH.test(text))).map(({ text }) => ({ kind: 'raw-source', detail: `"${text.slice(0, 40)}"` }));
}

function isElementAllowed(element: Element): boolean {
  if (!ALLOWED_TAGS.has(element.tagName.toLowerCase())) return false;
  if (element.tagName === 'INPUT') return element.closest('.board-slider') !== null;
  if (element.tagName === 'IMG') return element.classList.contains('board-image') && (element.getAttribute('src') ?? '').startsWith('/');
  return ![...element.attributes].some(({ name }) => name.startsWith('on') || name === 'href' || name === 'xlink:href');
}

function findMarkupDefects(board: HTMLElement): Defect[] {
  const elements = [...board.querySelectorAll('*')];
  const errors = board.querySelectorAll('.katex-error, merror');
  const forbidden = elements.filter((element) => !isElementAllowed(element));
  const notFinite = elements.filter((element) => [...element.attributes].some(({ name, value }) => !WORD_ATTRIBUTES.has(name) && NOT_FINITE.test(value)));
  return [...[...errors].map((element): Defect => ({ kind: 'error-mark', detail: element.textContent?.slice(0, 40) ?? '' })), ...forbidden.map((element): Defect => ({ kind: 'forbidden-element', detail: element.outerHTML.slice(0, 80) })), ...notFinite.map((element): Defect => ({ kind: 'not-finite', detail: element.outerHTML.slice(0, 120) }))];
}

function findImageDefects(board: HTMLElement): Defect[] {
  return [...board.querySelectorAll('img')].flatMap((image): Defect[] => {
    if (image.complete && image.naturalWidth === 0) return [{ kind: 'broken-image', detail: image.getAttribute('src') ?? '' }];
    if (!image.naturalWidth || !image.offsetHeight) return [];
    if (!SHOWN_OBJECT_FITS.has(getComputedStyle(image).objectFit)) return [{ kind: 'cropped-image', detail: `${image.getAttribute('src')} is cut to fit` }];
    const isStretched = Math.abs(image.offsetWidth / image.offsetHeight - image.naturalWidth / image.naturalHeight) > 0.03 * (image.naturalWidth / image.naturalHeight);
    return isStretched ? [{ kind: 'stretched-image', detail: `${image.getAttribute('src')} shown at ${image.offsetWidth} by ${image.offsetHeight}` }] : [];
  });
}

function getTextScale(owner: Element, wrapper: HTMLElement | null): number {
  if (!wrapper || !wrapper.offsetWidth) return 1;
  const isFigureText = owner.closest('svg.board-figure, svg.board-notes') !== null;
  return isFigureText ? 1 : wrapper.getBoundingClientRect().width / wrapper.offsetWidth;
}

function findTooSmallText(texts: readonly PlacedText[], reported: ReportedProblems): Defect[] {
  const checked = new Set<string>();
  return texts.flatMap(({ owner, ownerKey, wrapper, text, isMath }): Defect[] => {
    if (checked.has(ownerKey)) return [];
    checked.add(ownerKey);
    if (reported.tooSmallElements.has(wrapper?.dataset.element ?? '')) return [];
    const sized = isMath ? (owner.querySelector('.katex') ?? owner) : owner;
    const shownPx = Number.parseFloat(getComputedStyle(sized).fontSize) * getTextScale(owner, wrapper);
    return shownPx < SMALLEST_READABLE_PX ? [{ kind: 'too-small', detail: `"${text.slice(0, 30)}" at ${shownPx.toFixed(1)} px, and nothing reported it` }] : [];
  });
}

const withoutSpaces = (text: string) => text.replace(/\s+/g, '');

function getSeenWords(place: HTMLElement, isWrittenInStrokes: boolean, paint: PaintReader): string {
  const seen: string[] = [];
  const walker = document.createTreeWalker(place, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent && !parent.closest('.katex-mathml, title') && paint.canRead(parent) && getTextBoxes(node as Text, parent, false).length > 0) seen.push(node.textContent ?? '');
  }
  const written = isWrittenInStrokes ? [...place.querySelectorAll('[aria-label]')].filter((named) => paint.isSeen(named) && hasSeenStroke(named, paint)).map((named) => named.getAttribute('aria-label') ?? '') : [];
  const pictures = [...place.querySelectorAll('img[alt]')].filter((image) => paint.isSeen(image)).map((image) => image.getAttribute('alt') ?? '');
  return withoutSpaces([...seen, ...written, ...pictures].join(' '));
}

// Longest first, and each match is used up, so a short word cannot pass by sitting inside a longer one or a repeat of itself.
function getWordsNotShown(words: readonly string[], shown: string): string[] {
  let remaining = shown;
  return [...words].sort((first, second) => withoutSpaces(second).length - withoutSpaces(first).length).filter((word) => {
    const bare = withoutSpaces(word);
    if (!remaining.includes(bare)) return true;
    remaining = remaining.replace(bare, () => '');
    return false;
  });
}

const isMovedOff = (board: HTMLElement, id: string | null) => id !== null && board.querySelector(`[data-element="${CSS.escape(id)}"]`)?.hasAttribute('data-moved-off') === true;

// Looks inside an element's own place first, so the same words elsewhere on the board cannot stand in for them, and counts only what is painted.
function findDroppedWords({ board, expected, reported }: DefectRequest, paint: PaintReader): Defect[] {
  return expected.filter(({ elementId, hostId }) => !reported.marksWithoutTarget.has(elementId) && !isMovedOff(board, elementId) && !isMovedOff(board, hostId)).flatMap(({ elementId, words, isWrittenInStrokes }) => {
    const shown = getSeenWords(board.querySelector<HTMLElement>(`[data-element="${CSS.escape(elementId)}"]`) ?? board, isWrittenInStrokes, paint);
    const isReported = (word: string) => [...reported.labelsWithoutRoom].some((label) => label.includes(word));
    return getWordsNotShown(words, shown).filter((word) => !isReported(word)).map((word): Defect => ({ kind: 'dropped-words', detail: `${elementId} never showed "${word.slice(0, 40)}", and nothing reported it` }));
  });
}

function getTokenColors(): Set<string> {
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  document.body.append(probe);
  const readColor = (color: string) => {
    probe.style.color = color;
    return getComputedStyle(probe).color;
  };
  const known = [...TOKEN_NAMES.map((name) => readColor(root.getPropertyValue(`--color-${name}`))), readColor('transparent')];
  probe.remove();
  return new Set([...known, ...NO_COLORS]);
}

export function findColorDefects(board: HTMLElement): Defect[] {
  const allowed = getTokenColors();
  return [board, ...board.querySelectorAll('*')].flatMap((element): Defect[] => {
    const style = getComputedStyle(element);
    const isDrawing = element instanceof SVGElement && element.tagName.toLowerCase() !== 'svg';
    const colors = COLOR_PROPERTIES.filter((property) => (property !== 'fill' && property !== 'stroke') || isDrawing).filter((property) => !allowed.has(style[property])).map((property): Defect => ({ kind: 'unknown-color', detail: `${property} ${style[property]} on ${element.tagName.toLowerCase()}` }));
    return style.backgroundImage.includes('gradient') ? [...colors, { kind: 'gradient', detail: element.tagName.toLowerCase() }] : colors;
  });
}

/** Everything a student could see go wrong, read off the page and not off what was asked for. */
export function findLayoutDefects(request: DefectRequest): { defects: Defect[]; textsChecked: number } {
  const { board, reported, isAtRest, arriving } = request;
  const paint = createPaintReader(board);
  const texts = collectTexts(board, paint);
  const whenMoving = [...findTextOnText(texts), ...findLinesOnEachOther(texts), ...findTextOffBoard(texts, request), ...findElementDefects(request, paint), ...findInkDefects(board, paint), ...findLineDefects(board), ...findRawSource(texts), ...findMarkupDefects(board), ...findTextOnPictures(board, texts, paint)];
  const whenStill = isAtRest || arriving.size === 0 ? [...findStrokesThroughText(board, texts, paint), ...findDiagramLabelDefects(board, texts, paint), ...findLeadersOffTheirLabels(board)] : [];
  const defects = isAtRest ? [...whenMoving, ...whenStill, ...findTextOffItsElement(texts), ...findClippedText(texts, board, paint), ...findOverflowingBoxes(board, paint), ...findImageDefects(board), ...findTooSmallText(texts, reported), ...findUnseenText(texts, paint), ...findUnseenElements(request, paint), ...findTurnedElements(board), ...findDroppedWords(request, paint)] : [...whenMoving, ...whenStill];
  return { defects, textsChecked: texts.length };
}
