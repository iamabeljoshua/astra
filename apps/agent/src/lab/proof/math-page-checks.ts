/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// These run inside the page, so they read what the student's browser really has on screen.

export interface FrameWatch {
  frames: number;
  rawSourceFrames: number;
  errorMarkFrames: number;
  forbiddenElementFrames: number;
  overlapFrames: number;
  outsideBoardFrames: number;
  inkOverNeighbourFrames: number;
  wrongEquationFrames: number;
  movingWithReducedMotion: number;
  fontsNotReadyFrames: number;
  mutationsWithNoCause: number;
  mutationsWithCause: number;
  mostTreesAtOnce: number;
  worstFrameGapMs: number;
  examples: string[];
}

interface LabWindow {
  sceneLab?: { describeLive(atMs: number): { elements: { id: string; kind: string; tex?: string; drawn: number; morphFrom?: string; revealedUpTo?: number; sceneSeconds?: number }[] }; player: { getNowMs(): number; getOperations(): { kind: string; atMs: number }[] } };
  __frameWatch?: FrameWatch;
  __stopFrameWatch?: () => void;
}

const FORBIDDEN = 'script, img, iframe, object, embed, a, link, style, form, input';
const PAINT_SHRINK = 0.2;

function getBoard(): HTMLElement {
  return document.querySelector('[data-testid="board"]') as HTMLElement;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function doOverlap(first: Box, second: Box): boolean {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
}

function isShown(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && Number(style.opacity) > 0.02;
}

function getPlacedBoxes(board: HTMLElement): { id: string; box: Box; element: HTMLElement }[] {
  return [...board.querySelectorAll<HTMLElement>('[data-element]')].filter((element) => {
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && Number(style.opacity) > 0.98 && element.getBoundingClientRect().height > 0;
  }).map((element) => ({ id: element.dataset.element as string, box: element.getBoundingClientRect(), element }));
}

// KaTeX's surd is a very long path clipped by its parent, so the parent is what shows.
function getPaints(root: Element): Element[] {
  return [...root.querySelectorAll('.katex-html span, svg.board-ink path')].filter((element) => {
    const hasText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').replace(/[\s\u200b]/g, '') !== '');
    return hasText || element.tagName.toLowerCase() === 'path' || element.classList.contains('frac-line') || element.classList.contains('hide-tail');
  });
}

function checkPlacement(board: HTMLElement, watch: FrameWatch, arriving: ReadonlySet<string>): void {
  const placed = getPlacedBoxes(board);
  const boardBox = board.getBoundingClientRect();
  let hasOverlap = false;
  let isOutside = false;
  let isOverNeighbour = false;
  placed.forEach(({ box, id }, index) => {
    for (const other of placed.slice(index + 1)) {
      if (doOverlap(box, other.box)) {
        hasOverlap = true;
        watch.examples.push(`overlap ${id} ${other.id}`);
      }
    }
    // An element still arriving can rise from below as the board makes room. Its ink, checked next, is what the student sees.
    const isBoxOut = box.left < boardBox.left - 0.5 || box.top < boardBox.top - 0.5 || box.right > boardBox.right + 0.5 || box.bottom > boardBox.bottom + 0.5;
    if (isBoxOut && !arriving.has(id)) {
      isOutside = true;
      watch.examples.push(`outside ${id}`);
    }
  });
  for (const { element, id } of placed) {
    for (const paint of getPaints(element)) {
      if (!isShown(paint)) continue;
      const rect = paint.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left < boardBox.left - 0.5 || rect.right > boardBox.right + 0.5 || rect.top < boardBox.top - 0.5 || rect.bottom > boardBox.bottom + 0.5) {
        isOutside = true;
        watch.examples.push(`ink outside ${id} ${paint.getAttribute('class')} ${paint.textContent} ${Math.round(rect.left)} ${Math.round(rect.right)} ${Math.round(rect.top)} ${Math.round(rect.bottom)} board ${Math.round(boardBox.left)} ${Math.round(boardBox.right)} ${Math.round(boardBox.top)} ${Math.round(boardBox.bottom)}`);
      }
      const inner = { left: rect.left, right: rect.right, top: rect.top + rect.height * PAINT_SHRINK, bottom: rect.bottom - rect.height * PAINT_SHRINK };
      for (const other of placed) {
        if (other.id !== id && doOverlap(inner, other.box)) {
          isOverNeighbour = true;
          watch.examples.push(`ink ${id} ${paint.textContent} over ${other.id}`);
        }
      }
    }
  }
  if (hasOverlap) watch.overlapFrames += 1;
  if (isOutside) watch.outsideBoardFrames += 1;
  if (isOverNeighbour) watch.inkOverNeighbourFrames += 1;
}

function checkContent(board: HTMLElement, watch: FrameWatch): void {
  const visibleText = [...board.querySelectorAll('.katex-html, p')].map((element) => element.textContent).join(' ');
  if (/\\[a-zA-Z]/.test(visibleText)) watch.rawSourceFrames += 1;
  if (board.querySelector('.katex-error')) watch.errorMarkFrames += 1;
  if (board.querySelector(FORBIDDEN)) watch.forbiddenElementFrames += 1;
  watch.mostTreesAtOnce = Math.max(watch.mostTreesAtOnce, ...[...board.querySelectorAll('[data-element]')].map((element) => element.querySelectorAll(':scope > [data-tex]').length));
  const isDrawnEarly = [...board.querySelectorAll<HTMLElement>('[data-tex]')].some((host) => getPaints(host).some((paint) => {
    if (paint.tagName.toLowerCase() === 'path' || paint.classList.contains('hide-tail') || paint.classList.contains('frac-line') || !isShown(paint)) return false;
    const { fontStyle, fontWeight, fontFamily } = getComputedStyle(paint);
    return !document.fonts.check(`${fontStyle} ${fontWeight} 16px ${fontFamily}`);
  }));
  if (isDrawnEarly) watch.fontsNotReadyFrames += 1;
}

function checkEquations(board: HTMLElement, watch: FrameWatch, refused: ReadonlySet<string>, lab: NonNullable<LabWindow['sceneLab']>, wrong: { count: number }): void {
  let isWrong = false;
  for (const element of lab.describeLive(lab.player.getNowMs()).elements) {
    if (element.kind !== 'writeMath' || element.tex === undefined || refused.has(element.tex)) continue;
    const hosts = [...board.querySelectorAll<HTMLElement>(`[data-element="${element.id}"] > [data-tex]`)].map((host) => host.dataset.tex);
    if (hosts.length > 0 && !hosts.includes(element.tex)) {
      isWrong = true;
      watch.examples.push(`board shows ${hosts.join(' and ')} for ${element.tex}`);
    }
  }
  // A frame painted just before this read can be one frame behind, so only two in a row count.
  wrong.count = isWrong ? wrong.count + 1 : 0;
  if (wrong.count >= 2) watch.wrongEquationFrames += 1;
}

function checkReducedMotion(board: HTMLElement, watch: FrameWatch): void {
  const isMoving = [...board.querySelectorAll<HTMLElement>('.katex-html span')].some((element) => element.style.transform !== '' || element.style.clipPath !== '');
  const isStroking = [...board.querySelectorAll<SVGPathElement>('svg.board-ink path')].some((path) => path.style.strokeDasharray !== '' && path.style.strokeDashoffset !== '' && Number(path.style.strokeDashoffset) > 0 && Number(path.style.strokeDashoffset) < 1);
  if (isMoving || isStroking) watch.movingWithReducedMotion += 1;
}

/** Watches every frame until told to stop, and every write to the board, against the clock that caused it. */
export function startFrameWatch({ isReducedMotion, refusedTex }: { isReducedMotion: boolean; refusedTex: string[] }): void {
  const page = window as unknown as LabWindow;
  const lab = page.sceneLab as NonNullable<LabWindow['sceneLab']>;
  const board = getBoard();
  const refused = new Set(refusedTex);
  const wrong = { count: 0 };
  const watch: FrameWatch = { frames: 0, rawSourceFrames: 0, errorMarkFrames: 0, forbiddenElementFrames: 0, overlapFrames: 0, outsideBoardFrames: 0, inkOverNeighbourFrames: 0, wrongEquationFrames: 0, movingWithReducedMotion: 0, fontsNotReadyFrames: 0, mutationsWithNoCause: 0, mutationsWithCause: 0, mostTreesAtOnce: 0, worstFrameGapMs: 0, examples: [] };
  page.__frameWatch = watch;
  let lastFrameMs = performance.now();
  let isRunning = true;
  const isCaused = () => {
    const nowMs = lab.player.getNowMs();
    const firedLately = lab.player.getOperations().some((operation) => operation.kind === 'command' && nowMs - operation.atMs < 80 && nowMs >= operation.atMs - 80);
    if (firedLately) return true;
    return lab.describeLive(nowMs).elements.some((element) => element.drawn < 1) || lab.describeLive(nowMs - 40).elements.some((element) => element.drawn < 1) || lab.describeLive(nowMs).elements.some((element) => element.revealedUpTo !== undefined && element.revealedUpTo !== lab.describeLive(nowMs - 40).elements.find((other) => other.id === element.id)?.revealedUpTo);
  };
  const observer = new MutationObserver((records) => {
    if (isCaused()) watch.mutationsWithCause += records.length;
    else {
      watch.mutationsWithNoCause += records.length;
      const target = records[0]?.target as HTMLElement | undefined;
      watch.examples.push(`write with no cause at ${Math.round(lab.player.getNowMs())}: ${records[0]?.attributeName} on ${target?.dataset?.element ?? target?.tagName} = ${target?.getAttribute?.(records[0]?.attributeName ?? '')?.slice(0, 80)}`);
    }
  });
  observer.observe(board, { subtree: true, attributes: true, childList: true, characterData: true });
  const check = () => {
    if (!isRunning) return;
    const nowMs = performance.now();
    watch.worstFrameGapMs = Math.max(watch.worstFrameGapMs, nowMs - lastFrameMs);
    lastFrameMs = nowMs;
    watch.frames += 1;
    checkContent(board, watch);
    checkPlacement(board, watch, new Set(lab.describeLive(lab.player.getNowMs()).elements.filter((element) => element.drawn < 1).map((element) => element.id)));
    checkEquations(board, watch, refused, lab, wrong);
    if (isReducedMotion) checkReducedMotion(board, watch);
    watch.examples = watch.examples.slice(0, 40);
    requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
  page.__stopFrameWatch = () => {
    isRunning = false;
    observer.disconnect();
  };
}

export function stopFrameWatch(): FrameWatch {
  const page = window as unknown as LabWindow;
  page.__stopFrameWatch?.();
  return page.__frameWatch as FrameWatch;
}

/** Counts every write to the board and every running animation over a quiet stretch. */
export async function countWritesOver(durationMs: number): Promise<{ writes: number; animations: number }> {
  const board = getBoard();
  let writes = 0;
  const observer = new MutationObserver((records) => {
    writes += records.length;
  });
  observer.observe(board, { subtree: true, attributes: true, childList: true, characterData: true });
  await new Promise((done) => setTimeout(done, durationMs));
  observer.disconnect();
  return { writes, animations: document.getAnimations().filter((animation) => board.contains((animation.effect as KeyframeEffect).target as Node)).length };
}

export interface HostShot {
  id: string;
  tex: string;
  scale: number;
  clip: { x: number; y: number; width: number; height: number };
  glyphs: string[];
  /** How far each glyph sits from the same glyph in a fresh render of the same math, in pixels. */
  worstGlyphOffset: number;
  hasMotionLeft: boolean;
}

const CLIP_ROOM = 6;

/** Compares each equation at rest with a fresh, plain KaTeX render of the same source, placed exactly where the equation is. */
export async function compareEquationsWithPlainKatex(drawingPath: string, atMs: number): Promise<HostShot[]> {
  const { renderTex, collectMathPaints } = (await import(/* @vite-ignore */ drawingPath)) as { renderTex(tex: string, into: HTMLElement): boolean; collectMathPaints(root: Element): { element: HTMLElement; glyph: string | null }[] };
  const board = getBoard();
  const lab = (window as unknown as LabWindow).sceneLab as NonNullable<LabWindow['sceneLab']>;
  const atRest = new Set(lab.describeLive(atMs).elements.filter((element) => element.drawn === 1).map((element) => element.id));
  return [...board.querySelectorAll<HTMLElement>('[data-element] > [data-tex]')].filter((host) => {
    const wrapper = host.parentElement as HTMLElement;
    return wrapper.style.visibility !== 'hidden' && atRest.has(wrapper.dataset.element as string);
  }).map((host) => {
    const wrapper = host.parentElement as HTMLElement;
    const tex = host.dataset.tex as string;
    const reference = document.createElement('div');
    reference.setAttribute('style', host.getAttribute('style') ?? '');
    renderTex(tex, reference);
    wrapper.append(reference);
    const paints = collectMathPaints(host);
    const fresh = collectMathPaints(reference);
    const worst = paints.reduce((largest, paint, index) => {
      const here = paint.element.getBoundingClientRect();
      const there = (fresh[index]?.element as HTMLElement).getBoundingClientRect();
      return Math.max(largest, Math.abs(here.left - there.left), Math.abs(here.top - there.top), Math.abs(here.width - there.width), Math.abs(here.height - there.height));
    }, paints.length === fresh.length ? 0 : Number.POSITIVE_INFINITY);
    reference.remove();
    const rect = host.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    return {
      id: wrapper.dataset.element as string,
      tex,
      scale: rect.width / (host.offsetWidth || 1),
      clip: { x: Math.max(boardRect.left, Math.floor(rect.left) - CLIP_ROOM), y: Math.max(boardRect.top, Math.floor(rect.top) - CLIP_ROOM), width: Math.ceil(rect.width) + 2 * CLIP_ROOM, height: Math.ceil(rect.height) + 2 * CLIP_ROOM },
      glyphs: paints.flatMap((paint) => (paint.glyph ? [paint.glyph] : [])),
      worstGlyphOffset: worst,
      hasMotionLeft: paints.some(({ element }) => element.style.transform !== '' || element.style.clipPath !== '' || element.style.visibility !== '' || element.style.opacity !== ''),
    };
  });
}

/** Swaps one equation for a fresh KaTeX render in the same spot, or back, so two screenshots of one clip can be compared byte for byte. */
export async function swapInPlainKatex(drawingPath: string, id: string, isSwapped: boolean): Promise<void> {
  const { renderTex } = (await import(/* @vite-ignore */ drawingPath)) as { renderTex(tex: string, into: HTMLElement): boolean };
  const wrapper = getBoard().querySelector(`[data-element="${id}"]`) as HTMLElement;
  const host = wrapper.querySelector<HTMLElement>(':scope > [data-tex]') as HTMLElement;
  const existing = wrapper.querySelector('[data-plain-reference]');
  if (!isSwapped) {
    existing?.remove();
    host.style.visibility = '';
    return;
  }
  const reference = document.createElement('div');
  reference.setAttribute('style', host.getAttribute('style') ?? '');
  reference.dataset.plainReference = '';
  renderTex(host.dataset.tex as string, reference);
  wrapper.append(reference);
  host.style.visibility = 'hidden';
}

const COLOR_PROPERTIES = ['color', 'fill', 'stroke', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'] as const;

/** Every color the board really paints with, and any gradient, compared with the theme's tokens. */
export function getColorsOnBoard(): { unknownColors: string[]; gradients: number; tokens: string[] } {
  const board = getBoard();
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  document.body.append(probe);
  const tokens = ['paper', 'panel', 'ink', 'ink-2', 'line', 'accent'].map((name) => {
    probe.style.color = root.getPropertyValue(`--color-${name}`);
    return getComputedStyle(probe).color;
  });
  probe.remove();
  const allowed = new Set([...tokens, 'rgba(0, 0, 0, 0)', 'none', 'transparent']);
  const unknown = new Set<string>();
  let gradients = 0;
  for (const element of [board, ...board.querySelectorAll('*')]) {
    const style = getComputedStyle(element);
    if (style.backgroundImage.includes('gradient')) gradients += 1;
    const isDrawing = element instanceof SVGElement && element.tagName.toLowerCase() !== 'svg';
    for (const property of COLOR_PROPERTIES) {
      const value = style[property];
      if ((property === 'fill' || property === 'stroke') && !isDrawing) continue;
      if (!allowed.has(value)) unknown.add(`${property} ${value} on ${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}`);
    }
  }
  return { unknownColors: [...unknown], gradients, tokens };
}

export function getBoardSummary(): { elements: { id: string; tex: string | null; text: string | null }[]; hasScript: boolean; wasRun: boolean } {
  const board = getBoard();
  return {
    elements: [...board.querySelectorAll<HTMLElement>('[data-element]')].map((element) => ({ id: element.dataset.element as string, tex: element.querySelector<HTMLElement>(':scope > [data-tex]')?.dataset.tex ?? null, text: element.querySelector('p')?.textContent ?? null })),
    hasScript: board.querySelector(FORBIDDEN) !== null,
    wasRun: (window as unknown as { pwned?: unknown }).pwned !== undefined,
  };
}
