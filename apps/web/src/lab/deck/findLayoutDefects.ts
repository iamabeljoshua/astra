export const DEFECT_KINDS = ['text-on-text', 'text-off-board', 'text-off-its-element', 'text-clipped', 'element-on-element', 'element-off-board', 'ink-off-board', 'ink-on-neighbour', 'raw-source', 'error-mark', 'forbidden-element', 'broken-image', 'stretched-image', 'not-finite', 'unknown-color', 'gradient', 'too-small', 'dropped-words', 'silent-problem'] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

export interface Defect {
  kind: DefectKind;
  detail: string;
}

/** What the live board asked each placed element to say. */
export interface ExpectedWords {
  elementId: string;
  words: readonly string[];
}

/** What the board told the tutor it could not do, which turns a silent fault into a reported one. */
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
  /** An element still arriving can rise from below while the board makes room. */
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
const MATH_LINE_BOX_SHRINK = 0.2;
const UNSEEN_OPACITY = 0.02;
const SETTLED_OPACITY = 0.98;
const RAW_SOURCE = /\\[a-zA-Z]{2,}|\$\$|\bNaN\b|\bundefined\b|\[object |�/;
const NOT_FINITE = /NaN|Infinity|undefined/;
const WORD_ATTRIBUTES = new Set(['alt', 'aria-label', 'data-tex', 'data-mark', 'data-term']);
const ALLOWED_TAGS = new Set(['div', 'span', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ol', 'li', 'figure', 'figcaption', 'img', 'label', 'input', 'svg', 'g', 'path', 'circle', 'text', 'tspan', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtext', 'mspace', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'annotation', 'merror']);
const COLOR_PROPERTIES = ['color', 'fill', 'stroke', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'] as const;
const TOKEN_NAMES = ['paper', 'panel', 'ink', 'ink-2', 'line', 'accent'];
const NO_COLORS = ['rgba(0, 0, 0, 0)', 'none', 'transparent'];

const doOverlap = (first: Box, second: Box, room = 0) => first.left + room < second.right - room && second.left + room < first.right - room && first.top + room < second.bottom - room && second.top + room < first.bottom - room;

const isOutside = (box: Box, bounds: Box, room: number) => box.left < bounds.left - room || box.top < bounds.top - room || box.right > bounds.right + room || box.bottom > bounds.bottom + room;

const hasArea = (box: DOMRect) => box.width > 0 && box.height > 0;

const describe = (box: Box) => `${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`;

// Reads visibility and the product of the opacities up to the board, once per element.
function createPaintReader(board: HTMLElement) {
  const opacities = new Map<Element, number>();
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
  return { getOpacity, isSeen: (element: Element) => getOpacity(element) > UNSEEN_OPACITY && getComputedStyle(element).visibility !== 'hidden' };
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
    if (!parent || text.replace(/[\s​]/g, '') === '' || parent.closest('.katex-mathml, title') || !paint.isSeen(parent)) continue;
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
  return box.left < bounds.left - room.x || box.right > bounds.right + room.x || box.top < bounds.top - room.y || box.bottom > bounds.bottom + room.y;
};

function findClippedText(texts: readonly PlacedText[], board: HTMLElement): Defect[] {
  return texts.flatMap(({ owner, box, text, isMath }): Defect[] => {
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

function findRawSource(texts: readonly PlacedText[]): Defect[] {
  return texts.filter(({ owner, isMath, text }) => !isMath && !owner.closest('.board-code') && RAW_SOURCE.test(text)).map(({ text }) => ({ kind: 'raw-source', detail: `"${text.slice(0, 40)}"` }));
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

function getWordsIn(place: HTMLElement): string {
  const named = [...place.querySelectorAll('[aria-label], img[alt]')].map((element) => element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? '');
  return withoutSpaces([place.textContent ?? '', ...named].join(' '));
}

// Looks inside an element's own place first, so the same words elsewhere on the board cannot stand in for them.
function findDroppedWords({ board, expected, reported }: DefectRequest): Defect[] {
  return expected.filter(({ elementId }) => !reported.marksWithoutTarget.has(elementId)).flatMap(({ elementId, words }) => {
    const shown = getWordsIn(board.querySelector<HTMLElement>(`[data-element="${elementId}"]`) ?? board);
    const isReported = (word: string) => [...reported.labelsWithoutRoom].some((label) => label.includes(word));
    return words.filter((word) => !shown.includes(withoutSpaces(word)) && !isReported(word)).map((word): Defect => ({ kind: 'dropped-words', detail: `${elementId} never showed "${word.slice(0, 40)}", and nothing reported it` }));
  });
}

function getTokenColors(): Set<string> {
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  document.body.append(probe);
  const tokens = TOKEN_NAMES.map((name) => {
    probe.style.color = root.getPropertyValue(`--color-${name}`);
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return new Set([...tokens, ...NO_COLORS]);
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
  const { board, reported, isAtRest } = request;
  const paint = createPaintReader(board);
  const texts = collectTexts(board, paint);
  const whenMoving = [...findTextOnText(texts), ...findTextOffBoard(texts, request), ...findElementDefects(request, paint), ...findInkDefects(board, paint), ...findRawSource(texts), ...findMarkupDefects(board)];
  const defects = isAtRest ? [...whenMoving, ...findTextOffItsElement(texts), ...findClippedText(texts, board), ...findOverflowingBoxes(board, paint), ...findImageDefects(board), ...findTooSmallText(texts, reported), ...findDroppedWords(request)] : whenMoving;
  return { defects, textsChecked: texts.length };
}
