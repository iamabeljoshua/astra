import type { Page } from 'playwright';
import type { DefectKind } from '../../apps/web/src/lab/deck/findLayoutDefects.ts';
import { type DeckServer, type SourcePlant, waitForDeck } from './deck-server.ts';
import { getFlashesInScene } from './flash-check.ts';
import type { DeckSurface } from './sweeps.ts';

const BOARD = '[data-testid="board"]';
interface BoardSize {
  width: number;
  height: number;
}

const LAPTOP_BOARD = { width: 760, height: 752 };
const PHONE_BOARD = { width: 358, height: 506 };
const ROW_SCREENS = new Map([[LAPTOP_BOARD, { width: 1366, height: 800 }], [PHONE_BOARD, { width: 390, height: 844 }]]);
const SMALL_PHONE_SCREEN = { width: 320, height: 568 };
const PHONE_LANDSCAPE_SCREEN = { width: 844, height: 390 };
const BLOCK_CONTENT = '.board-row-block .board-row-content';
const BLOCK_WRAPPER = '.board-row-block .board-row-wrapper';
const FLASH_SCENE = 'hostile-strobe-picture';
const FLASH_SCENE_LAST_COMMAND_MS = 1800;

interface PagePlant {
  name: string;
  scene: string;
  size: { width: number; height: number };
  expects: DefectKind;
  plant(boardSelector: string): void;
}

interface ScriptPlant {
  name: string;
  scene: string;
  size: { width: number; height: number };
  expects: DefectKind;
  script: string;
}

interface Verdict {
  failures: string[];
  lines: string[];
}

const PAGE_PLANTS: readonly PagePlant[] = [
  {
    name: 'one element laid over another',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'element-on-element',
    plant(board) {
      const wrappers = document.querySelectorAll<HTMLElement>(`${board} [data-element]`);
      (wrappers[1] as HTMLElement).style.transform = (wrappers[0] as HTMLElement).style.transform;
    },
  },
  {
    name: 'a label moved onto another label',
    scene: 'math-marked-parabola',
    size: LAPTOP_BOARD,
    expects: 'text-on-text',
    plant(board) {
      const labels = [...document.querySelectorAll<SVGTextElement>(`${board} svg.board-figure text`)];
      const [first, second] = labels as [SVGTextElement, SVGTextElement];
      second.setAttribute('x', first.getAttribute('x') as string);
      second.setAttribute('y', first.getAttribute('y') as string);
      for (const tspan of second.querySelectorAll('tspan')) {
        tspan.setAttribute('x', first.getAttribute('x') as string);
        tspan.setAttribute('y', first.getAttribute('y') as string);
      }
    },
  },
  {
    name: 'an element pushed past the right edge',
    scene: 'mixed-lesson-opening',
    size: PHONE_BOARD,
    expects: 'element-off-board',
    plant(board) {
      (document.querySelector(`${board} [data-element]`) as HTMLElement).style.transform = 'translate(300px, 16px)';
    },
  },
  {
    name: 'text pushed past the bottom edge',
    scene: 'mixed-lesson-opening',
    size: PHONE_BOARD,
    expects: 'text-off-board',
    plant(board) {
      (document.querySelector(`${board} [data-element]`) as HTMLElement).style.transform = 'translate(16px, 900px)';
    },
  },
  {
    name: 'a table cell that will not wrap',
    scene: 'language-long-words-table',
    size: PHONE_BOARD,
    expects: 'text-off-its-element',
    plant(board) {
      const style = document.createElement('style');
      style.textContent = `${board} td { white-space: nowrap; max-width: 20px; overflow-wrap: normal; }`;
      document.head.append(style);
      window.addEventListener('deck-plant-done', () => style.remove(), { once: true });
    },
  },
  {
    name: 'a paragraph cut by its own box',
    scene: 'mixed-lesson-opening',
    size: PHONE_BOARD,
    expects: 'text-clipped',
    plant(board) {
      const paragraph = document.querySelector(`${board} p`) as HTMLElement;
      paragraph.style.overflow = 'hidden';
      paragraph.style.height = '4px';
    },
  },
  {
    name: 'a code line that runs off the board',
    scene: 'code-long-line',
    size: PHONE_BOARD,
    expects: 'text-off-board',
    plant(board) {
      const style = document.createElement('style');
      style.textContent = `${board} .board-code-source { white-space: pre !important; overflow-wrap: normal !important; }`;
      document.head.append(style);
      window.addEventListener('deck-plant-done', () => style.remove(), { once: true });
    },
  },
  {
    name: 'a KaTeX error mark',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'error-mark',
    plant(board) {
      const mark = document.createElement('span');
      mark.className = 'katex-error';
      mark.textContent = 'x^{';
      document.querySelector(`${board} [data-element]`)?.append(mark);
    },
  },
  {
    name: 'raw TeX shown as words',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'raw-source',
    plant(board) {
      (document.querySelector(`${board} p`) as HTMLElement).textContent = String.raw`\frac{1}{2} of the pie`;
    },
  },
  {
    name: 'the word undefined on the board',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'raw-source',
    plant(board) {
      (document.querySelector(`${board} p`) as HTMLElement).textContent = 'Value: undefined';
    },
  },
  {
    name: 'a broken image',
    scene: 'history-great-wave',
    size: LAPTOP_BOARD,
    expects: 'broken-image',
    plant(board) {
      const image = document.createElement('img');
      image.className = 'board-image';
      image.setAttribute('src', '/picks/no-such-file.jpg');
      Object.defineProperty(image, 'complete', { value: true });
      document.querySelector(`${board} [data-element]`)?.append(image);
    },
  },
  {
    name: 'a stretched image',
    scene: 'history-great-wave',
    size: LAPTOP_BOARD,
    expects: 'stretched-image',
    plant(board) {
      const image = document.querySelector(`${board} img`) as HTMLImageElement;
      image.style.width = '500px';
      image.style.height = '40px';
      image.style.objectFit = 'fill';
    },
  },
  {
    name: 'a link from the outside',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'forbidden-element',
    plant(board) {
      const link = document.createElement('a');
      link.href = 'https://example.com';
      document.querySelector(`${board} [data-element]`)?.append(link);
    },
  },
  {
    name: 'a script tag on the board',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'forbidden-element',
    plant(board) {
      document.querySelector(`${board} [data-element]`)?.append(document.createElement('script'));
    },
  },
  {
    name: 'a number that is not finite in a figure',
    scene: 'math-marked-parabola',
    size: LAPTOP_BOARD,
    expects: 'not-finite',
    plant(board) {
      document.querySelector(`${board} svg.board-figure path`)?.setAttribute('d', 'M NaN 0 L 1 1');
    },
  },
  {
    name: 'a gradient on an element',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'gradient',
    plant(board) {
      (document.querySelector(`${board} p`) as HTMLElement).style.backgroundImage = 'linear-gradient(red, blue)';
    },
  },
  {
    name: 'a color outside the tokens',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'unknown-color',
    plant(board) {
      (document.querySelector(`${board} p`) as HTMLElement).style.color = 'rgb(255, 0, 0)';
    },
  },
  {
    name: 'an element shrunk past reading, with no report',
    scene: 'mixed-lesson-opening',
    size: LAPTOP_BOARD,
    expects: 'too-small',
    plant(board) {
      const wrapper = document.querySelector(`${board} [data-element]`) as HTMLElement;
      wrapper.style.transform = `${wrapper.style.transform} scale(0.2)`;
    },
  },
  {
    name: 'an arrow drawn through a box',
    scene: 'mixed-arrow-past-a-wide-node',
    size: LAPTOP_BOARD,
    expects: 'line-on-box',
    plant(board) {
      const box = (document.querySelector(`${board} path[data-ink="box"]`) as SVGPathElement).getBBox();
      document.querySelector(`${board} path[data-ink="line"]`)?.setAttribute('d', `M${box.x - 5} ${box.y + box.height / 2}L${box.x + box.width + 5} ${box.y + box.height / 2}`);
    },
  },
  {
    name: 'an arrow drawn through the words on another box',
    scene: 'mixed-arrow-past-a-wide-node',
    size: LAPTOP_BOARD,
    expects: 'line-on-text',
    plant(board) {
      const words = (document.querySelector(`${board} svg text`) as SVGTextElement).getBBox();
      document.querySelector(`${board} path[data-ink="line"]`)?.setAttribute('d', `M${words.x - 5} ${words.y + words.height / 2}L${words.x + words.width + 5} ${words.y + words.height / 2}`);
    },
  },
  {
    name: 'a word quietly left off',
    scene: 'language-verb-table',
    size: LAPTOP_BOARD,
    expects: 'dropped-words',
    plant(board) {
      const cell = [...document.querySelectorAll(`${board} td`)].find((candidate) => candidate.textContent === 'hablamos') as HTMLElement;
      cell.textContent = '';
    },
  },
];

const paragraph = `document.querySelector('${BOARD} p')`;
const rawWords = (words: string) => `${paragraph}.textContent = ${JSON.stringify(words)};`;

const SEEN_PLANTS: readonly ScriptPlant[] = [
  { name: 'a rounded corner cuts the words', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'text-clipped', script: `const p = ${paragraph}; p.style.borderRadius = '50%'; p.style.overflow = 'hidden'; p.style.background = 'var(--color-panel)';` },
  { name: 'a clip-path cuts half the words', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'text-clipped', script: `${paragraph}.style.clipPath = 'inset(0 50% 0 0)';` },
  { name: 'a label moved onto a curve', scene: 'math-curve-in-steps', size: LAPTOP_BOARD, expects: 'line-on-text', script: `const svg = document.querySelector('${BOARD} svg.board-figure'); const curve = svg.querySelector('path[data-mark^="curve-"]'); const at = curve.getPointAtLength(curve.getTotalLength() * 0.7); const label = svg.querySelector('text:not([data-mark^="tick-"])'); for (const span of label.querySelectorAll('tspan')) { span.setAttribute('x', at.x - 20); span.setAttribute('y', at.y + 4); }` },
  { name: 'pale words on a pale box', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'unseen-text', script: `const p = ${paragraph}; p.style.color = 'var(--color-paper)'; p.style.background = 'var(--color-panel)';` },
  { name: 'words in the color of the board', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'unseen-text', script: `${paragraph}.style.color = 'var(--color-paper)';` },
  { name: 'transparent words', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'unseen-text', script: `${paragraph}.style.color = 'transparent';` },
  { name: 'a table too wide for a phone', scene: 'language-verb-table', size: PHONE_BOARD, expects: 'text-off-board', script: `document.querySelector('${BOARD} table').style.minWidth = '900px';` },
  { name: 'right-to-left words off the left edge', scene: 'language-arabic-table', size: PHONE_BOARD, expects: 'text-off-board', script: `const p = ${paragraph}; p.dir = 'rtl'; p.style.whiteSpace = 'nowrap'; p.textContent = 'مرحبا بالعالم '.repeat(12);` },
  { name: 'right-to-left words cut inside a cell', scene: 'language-arabic-table', size: PHONE_BOARD, expects: 'text-clipped', script: `const cell = document.querySelector('${BOARD} td'); cell.style.overflow = 'hidden'; cell.style.whiteSpace = 'nowrap'; cell.style.maxWidth = '20px'; cell.dir = 'rtl';` },
  { name: 'a long word that will not wrap', scene: 'mixed-lesson-opening', size: PHONE_BOARD, expects: 'text-off-board', script: `const p = ${paragraph}; p.style.overflowWrap = 'normal'; p.style.wordBreak = 'normal'; p.classList.remove('wrap-anywhere'); p.textContent = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3);` },
  { name: 'emoji lines collapsed onto each other', scene: 'mixed-lesson-opening', size: PHONE_BOARD, expects: 'text-on-text', script: `const p = ${paragraph}; p.textContent = '🎉🧬🌍👩‍🔬 '.repeat(20); p.style.lineHeight = '0.2';` },
  { name: 'the lines of a paragraph on each other', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'text-on-text', script: `const p = ${paragraph}; p.textContent = 'This is a paragraph long enough that it must wrap across several lines on the board when it is drawn at this width. '.repeat(3); p.style.lineHeight = '0.3';` },
  { name: 'a label with its two lines on each other', scene: 'biology-flower-labelled', size: PHONE_BOARD, expects: 'text-on-text', script: `const label = [...document.querySelectorAll('${BOARD} svg text')].find((text) => text.querySelectorAll('tspan').length > 1); for (const span of label.querySelectorAll('tspan')) span.setAttribute('y', label.querySelector('tspan').getAttribute('y'));` },
  { name: 'huge words', scene: 'mixed-lesson-opening', size: PHONE_BOARD, expects: 'element-off-board', script: `${paragraph}.style.fontSize = '300px';` },
  { name: 'tiny words', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'too-small', script: `${paragraph}.style.fontSize = '4px';` },
  { name: 'a tiny table cell', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'too-small', script: `document.querySelector('${BOARD} td').style.fontSize = '3px';` },
  { name: 'a word under visibility hidden', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'dropped-words', script: `document.querySelector('${BOARD} td').style.visibility = 'hidden';` },
  { name: 'a row under display none', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'dropped-words', script: `document.querySelector('${BOARD} tbody tr').style.display = 'none';` },
  { name: 'a table at opacity 0', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'dropped-words', script: `document.querySelector('${BOARD} table').style.opacity = '0';` },
  { name: 'a whole element at opacity 0', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'unseen-element', script: `document.querySelector('${BOARD} [data-element]').style.opacity = '0';` },
  { name: 'a picture at opacity 0', scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'unseen-element', script: `document.querySelector('${BOARD} img').style.opacity = '0';` },
  { name: 'a picture covers a table', scene: 'history-pyramid-facts', size: LAPTOP_BOARD, expects: 'element-on-element', script: `const image = document.querySelector('${BOARD} img'); image.style.position = 'relative'; image.style.zIndex = '5'; image.style.height = '740px'; image.style.objectFit = 'cover'; image.style.maxHeight = 'none';` },
  { name: 'words laid on a picture inside one element', scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'text-on-picture', script: `const wrapper = document.querySelector('${BOARD} img').parentElement; const caption = document.createElement('p'); caption.textContent = 'a caption laid on the picture'; caption.style.position = 'absolute'; caption.style.left = '40px'; caption.style.top = '40px'; wrapper.append(caption);` },
  { name: 'a note moved onto a picture', scene: 'history-school-of-athens', size: LAPTOP_BOARD, expects: 'text-on-picture', script: `const picture = document.querySelector('${BOARD} img').getBoundingClientRect(); const note = [...document.querySelectorAll('${BOARD} svg text')].find((text) => text.textContent.includes('Plato')); const svg = note.closest('svg').getBoundingClientRect(); const x = picture.left - svg.left + picture.width / 2; const y = picture.top - svg.top + picture.height / 2; note.setAttribute('x', x); note.setAttribute('y', y); for (const span of note.querySelectorAll('tspan')) { span.setAttribute('x', x); span.setAttribute('y', y); }` },
  { name: 'handwritten words moved onto other words', scene: 'biology-carbon-cycle', size: LAPTOP_BOARD, expects: 'text-on-text', script: `const svg = document.querySelector('${BOARD} svg.board-ink:has(path[data-word])'); const strokes = [...svg.querySelectorAll('path[data-word]')]; for (const stroke of strokes.slice(0, strokes.length / 2)) stroke.setAttribute('transform', 'translate(120 40)');` },
  { name: 'a box smaller than its label', scene: 'history-cause-diagram', size: LAPTOP_BOARD, expects: 'label-out-of-box', script: `document.querySelectorAll('${BOARD} path[data-ink="box"]')[0].setAttribute('transform', 'scale(0.4)');` },
  { name: 'a node label outside its box', scene: 'biology-food-chain', size: LAPTOP_BOARD, expects: 'label-out-of-box', script: `const label = document.querySelector('${BOARD} svg text'); const y = Number(label.querySelector('tspan').getAttribute('y')) + 60; for (const span of label.querySelectorAll('tspan')) span.setAttribute('y', y);` },
  { name: 'a leader drawn through another label', scene: 'biology-cell-labelled', size: LAPTOP_BOARD, expects: 'line-on-text', script: `const svg = document.querySelector('${BOARD} svg.board-ink'); const words = svg.querySelectorAll('text')[0].getBBox(); [...svg.querySelectorAll('path')].at(-1).setAttribute('d', 'M' + (words.x - 20) + ' ' + (words.y + words.height / 2) + 'L' + (words.x + words.width + 20) + ' ' + (words.y + words.height / 2));` },
  { name: 'a leader moved off its label', scene: 'biology-cell-labelled', size: LAPTOP_BOARD, expects: 'leader-off-label', script: `[...document.querySelectorAll('${BOARD} svg.board-ink path')].at(-1).setAttribute('transform', 'translate(-60 30)');` },
  { name: 'a ring moved across a table', scene: 'mixed-marks-on-parts', size: LAPTOP_BOARD, expects: 'line-on-text', script: `document.querySelectorAll('${BOARD} svg.board-marks g:not(.board-notes)')[1].style.transform = 'translate(60px, 100px)';` },
  { name: 'a picture cut to fit', scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'cropped-image', script: `document.querySelector('${BOARD} img').style.objectFit = 'none';` },
  { name: 'an upside-down picture', scene: 'history-two-pictures', size: LAPTOP_BOARD, expects: 'turned-element', script: `document.querySelector('${BOARD} img').style.transform = 'rotate(180deg)';` },
  { name: 'raw math in round brackets', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'raw-source', script: rawWords(String.raw`\(x^2 + 1\) is a curve`) },
  { name: 'raw math in square brackets', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'raw-source', script: rawWords(String.raw`\[y = mx + c\]`) },
  { name: 'raw math between dollars', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'raw-source', script: rawWords('$x$ is the unknown') },
  { name: 'raw braces', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'raw-source', script: rawWords('a_{1} + b^{2}') },
];

const row = (index: number) => `document.querySelectorAll('${BOARD} .board-row')[${index}]`;

const ROW_PLANTS: readonly ScriptPlant[] = [
  { name: 'a row pulled up onto the row above', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'element-on-element', script: `${row(1)}.style.marginTop = '-120px';` },
  { name: 'a row of words pulled onto the row above', scene: 'language-verb-table', size: PHONE_BOARD, expects: 'text-on-text', script: `${row(1)}.style.marginTop = '-120px';` },
  { name: 'gutter words laid on their own row', scene: 'hostile-marks-on-wide-things', size: LAPTOP_BOARD, expects: 'text-on-text', script: `document.querySelector('${BOARD} .board-row-gutter').style.transform = 'translate(-560px, 0)';` },
  { name: 'gutter words under the row on a phone, laid back on it', scene: 'hostile-marks-on-wide-things', size: PHONE_BOARD, expects: 'text-on-text', script: `document.querySelector('${BOARD} .board-row-gutter').style.transform = 'translate(0, -90px)';` },
  { name: 'a note from over the rows laid on a row', scene: 'mixed-marks-on-parts', size: LAPTOP_BOARD, expects: 'text-on-text', script: `const flow = document.querySelector('${BOARD} svg.board-marks').getBoundingClientRect(); const cell = document.querySelector('${BOARD} td').getBoundingClientRect(); const note = document.querySelector('${BOARD} svg.board-marks text'); const x = cell.left - flow.left + 4; const y = cell.top - flow.top + 16; note.setAttribute('x', x); note.setAttribute('y', y); for (const span of note.querySelectorAll('tspan')) { span.setAttribute('x', x); span.setAttribute('y', y); }` },
  { name: 'a picture hangs over the row below', scene: 'history-pyramid-facts', size: LAPTOP_BOARD, expects: 'element-on-element', script: `${row(1)}.style.marginTop = '-200px';` },
  { name: 'a row cut by its own content box', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'text-clipped', script: `const box = document.querySelector('${BOARD} ${BLOCK_CONTENT}'); box.style.overflow = 'hidden'; box.style.height = '40px';` },
  { name: 'a table cut by its wrapper across', scene: 'language-verb-table', size: PHONE_BOARD, expects: 'text-clipped', script: `const box = document.querySelector('${BOARD} ${BLOCK_WRAPPER}'); box.style.overflow = 'hidden'; box.style.width = '80px';` },
  { name: 'a timeline cut by a clip-path on its row', scene: 'history-empires-timeline', size: LAPTOP_BOARD, expects: 'text-clipped', script: `document.querySelector('${BOARD} ${BLOCK_WRAPPER}').style.clipPath = 'inset(0 50% 0 0)';` },
  { name: 'a code block cut short on its row', scene: 'code-long-line', size: PHONE_BOARD, expects: 'text-clipped', script: `const box = document.querySelector('${BOARD} .board-code'); box.style.overflow = 'hidden'; box.style.height = '50px';` },
  { name: 'the board stops scrolling, so the last rows are lost', scene: 'math-board-fills-up', size: PHONE_LANDSCAPE_SCREEN, expects: 'text-off-board', script: `document.querySelector('${BOARD} .board-scroll').style.overflow = 'hidden';` },
  { name: 'a table too wide for the column leaves the board', scene: 'language-verb-table', size: PHONE_BOARD, expects: 'text-off-board', script: `document.querySelector('${BOARD} table').style.minWidth = '900px';` },
  { name: 'a row pushed past the right edge', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'element-off-board', script: `const box = document.querySelector('${BOARD} ${BLOCK_WRAPPER}'); box.style.left = '900px';` },
  { name: 'a row pushed above the top, where no scroll reaches', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'element-off-board', script: `document.querySelector('${BOARD} .board-flow').style.marginTop = '-400px';` },
  { name: 'a row shrunk past reading', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'too-small', script: `document.querySelector('${BOARD} ${BLOCK_WRAPPER}').style.transform = 'scale(0.2)';` },
  { name: 'a note hidden in the gutter', scene: 'hostile-marks-on-wide-things', size: LAPTOP_BOARD, expects: 'dropped-words', script: `document.querySelector('${BOARD} .board-row-note').style.visibility = 'hidden';` },
];

async function getPlantSize(page: Page, { size }: { size: BoardSize }, surface: DeckSurface): Promise<BoardSize> {
  if (surface === 'view') return size;
  const screen = ROW_SCREENS.get(size) ?? size;
  await page.setViewportSize(screen);
  return screen;
}

async function checkPlant(page: Page, plant: PagePlant | ScriptPlant, mount: string, surface: DeckSurface): Promise<DefectKind[]> {
  const shownSize = await getPlantSize(page, plant, surface);
  await page.evaluate(({ scene, size, key }) => window.boardDeck?.show({ scene, size, mount: key }), { scene: plant.scene, size: shownSize, key: mount });
  await page.evaluate('script' in plant ? `(() => { ${plant.script} })()` : `(${plant.plant.toString().replace(/^plant/, 'function')})(${JSON.stringify(BOARD)})`);
  await page.waitForTimeout(plant.expects === 'broken-image' ? 300 : 0);
  const found = await page.evaluate((scene) => window.boardDeck?.checkWithColors({ scene }) ?? [], plant.scene);
  await page.evaluate(() => window.dispatchEvent(new Event('deck-plant-done')));
  return found.map(({ kind }) => kind);
}

const ONLY_ON_THE_VIEW: ReadonlySet<string> = new Set(['one element laid over another', 'an element pushed past the right edge', 'text pushed past the bottom edge', 'an element shrunk past reading, with no report', 'huge words']);

export async function runPagePlants(page: Page, surface: DeckSurface, verdict: Verdict): Promise<void> {
  let caught = 0;
  const plants = surface === 'rows' ? [...ROW_PLANTS, ...[...PAGE_PLANTS, ...SEEN_PLANTS].filter(({ name }) => !ONLY_ON_THE_VIEW.has(name))] : [...PAGE_PLANTS, ...SEEN_PLANTS];
  for (const [index, plant] of plants.entries()) {
    const found = await checkPlant(page, plant, `plant-${index}`, surface).catch((error: Error) => [`the plant itself failed: ${error.message.split('\n')[0]}` as DefectKind]);
    if (found.includes(plant.expects)) caught += 1;
    else verdict.failures.push(`planted defect not caught: ${plant.name}, expected ${plant.expects}, found ${found.join(', ') || 'nothing'}`);
  }
  verdict.lines.push(`Planted in the page: ${caught} of ${plants.length} caught`);
}

interface LibraryPlant extends SourcePlant {
  scene: string;
  size: { width: number; height: number };
  expects: DefectKind;
  playsThrough?: boolean;
}

const LIBRARY_PLANTS: readonly LibraryPlant[] = [
  { name: 'an empty curve loses its name', file: 'packages/board/src/plot/plot-figure.ts', find: "(isWhole ? { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 } : null)", replace: 'null', scene: 'hostile-curve-with-no-values', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'placement forgets the height of what is above', file: 'packages/board/src/layout/place-elements.ts', find: 'y += placement.height + area.gap;', replace: 'y += area.gap;', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'element-on-element' },
  { name: 'placement stops shrinking a wide line', file: 'packages/board/src/layout/place-elements.ts', find: 'return Math.min(1, widthScale, heightScale);', replace: 'return 1;', scene: 'hostile-widest-table', size: PHONE_BOARD, expects: 'element-off-board' },
  { name: 'a table cell no longer breaks a long word', file: 'packages/board/src/table/table-painter.ts', find: "const cell = makeTextElement('td', 'board-table-cell', text);", replace: "const cell = makeTextElement('td', 'board-table-cell', text); cell.style.overflowWrap = 'normal'; cell.style.whiteSpace = 'nowrap';", scene: 'language-long-words-table', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'a code line no longer wraps', file: 'packages/board/src/code/code-painter.ts', find: "text.dir = 'ltr';", replace: "text.dir = 'ltr'; text.style.whiteSpace = 'pre'; text.style.overflowWrap = 'normal';", scene: 'code-long-line', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'figure labels skip the overlap search', file: 'packages/board/src/figure/place-labels.ts', find: 'return !others.some((other) => doBoxesOverlap(box, other));', replace: 'return true;', scene: 'hostile-marks-on-one-spot', size: PHONE_BOARD, expects: 'text-on-text' },
  { name: 'timeline events pile up', file: 'packages/board/src/timeline/timeline-painter.ts', find: "event.className = 'board-timeline-event';", replace: "event.className = 'board-timeline-event'; event.style.marginTop = '-40px';", scene: 'history-empires-timeline', size: LAPTOP_BOARD, expects: 'text-on-text' },
  { name: 'a drawing label leaves its gutter', file: 'packages/board/src/diagram/label-drawing.ts', find: 'getLabelStep(label, { x: leftRoom - SIDE_GAP - label.text.width, isLeft: true, bodyAt, scale })', replace: 'getLabelStep(label, { x: -400, isLeft: true, bodyAt, scale })', scene: 'biology-cell-labelled', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'an image ignores its shape', file: 'apps/web/src/board/imageItem.ts', find: "if (image.getAttribute('height') !== height) image.setAttribute('height', height);", replace: "image.style.height = '40px';", scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'stretched-image' },
  { name: 'text is set as markup', file: 'apps/web/src/lab/BoardView.tsx', find: '>{content.text}</p>', replace: ' dangerouslySetInnerHTML={{ __html: content.text }} />', scene: 'hostile-markup-everywhere', size: LAPTOP_BOARD, expects: 'forbidden-element' },
  { name: 'a long label is cut to fit', file: 'packages/board/src/figure/place-labels.ts', find: 'return [whole, ...narrower];', replace: 'return narrower.map((shape) => ({ ...shape, lines: shape.lines.slice(0, 1) }));', scene: 'mixed-long-plot-label', size: PHONE_BOARD, expects: 'dropped-words' },
  { name: 'a diagram leaves a plain label off', file: 'packages/board/src/ink/diagram.ts', find: 'textLabels: [...(node.label.text ? [moveTextLabel(node.label.text, labelAt)] : []), ...edges.flatMap((edge) => edge.textLabels)],', replace: 'textLabels: edges.flatMap((edge) => edge.textLabels),', scene: 'biology-food-chain', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'a picture never fades in', file: 'apps/web/src/board/imageItem.ts', find: 'getEntranceOpacity: ({ progress }) => Math.max(0, (progress - UNSEEN_ENTRANCE_SHARE) / (1 - UNSEEN_ENTRANCE_SHARE)),', replace: 'getEntranceOpacity: () => 0,', scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'unseen-element' },
  { name: 'a table never fades in', file: 'apps/web/src/board/boardItems.ts', find: 'getEntranceOpacity: ({ progress }) => progress,', replace: 'getEntranceOpacity: () => 0,', scene: 'language-verb-table', size: LAPTOP_BOARD, expects: 'unseen-element' },
  { name: 'a diagram label stays hidden', file: 'apps/web/src/board/boardItems.ts', find: "writeStyle(text, 'visibility', drawn === 0 ? 'hidden' : '');", replace: "writeStyle(text, 'visibility', 'hidden');", scene: 'biology-food-chain', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'a plot label ignores the curve', file: 'packages/board/src/figure/place-labels.ts', find: 'const lines = request.isOptional ? [] : (room.linesToClear ?? []);', replace: 'const lines: readonly Branch[] = [];', scene: 'physics-wave-plot', size: PHONE_BOARD, expects: 'line-on-text' },
  { name: 'a note ignores the ring it names', file: 'apps/web/src/board/boardMarks.ts', find: 'shouldAvoid: [], linesToClear, onNoRoom', replace: 'shouldAvoid: [], onNoRoom', scene: 'mixed-note-beside-its-ring', size: PHONE_BOARD, expects: 'line-on-text' },
  { name: 'a ring goes back to an ellipse', file: 'packages/board/src/ink/marks.ts', find: 'const power = 2 / getRingRoundness(box, wander);', replace: 'const power = 1;', scene: 'hostile-marks-on-wide-things', size: LAPTOP_BOARD, expects: 'line-on-text' },
  { name: 'a long arrow runs straight through the rank between', file: 'packages/board/src/diagram/layout-graph.ts', find: 'points.push(toPoint(axes, centre(lane), band.start - arrowGap), toPoint(axes, centre(lane), band.end + arrowGap));', replace: '', scene: 'mixed-arrow-past-a-wide-node', size: LAPTOP_BOARD, expects: 'line-on-box' },
  { name: 'an arrow loses its straight run past a taller neighbour', file: 'packages/board/src/ink/diagram.ts', find: 'return [{ ...makeStroke(holdCorners(points, ARROW.cornerReach)), role: \'line\' }', replace: 'return [{ ...makeStroke([points[0] as InkPosition, { x: (points.at(-1) as InkPosition).x, y: (points[0] as InkPosition).y + 400 }, points.at(-1) as InkPosition]), role: \'line\' }', scene: 'mixed-arrow-past-a-wide-node', size: LAPTOP_BOARD, expects: 'line-on-box' },
];

const ROW_LIBRARY_PLANTS: readonly LibraryPlant[] = [
  { name: 'a row keeps its old table when the tutor replaces it', file: 'apps/web/src/board/boardRowPainting.ts', find: 'if (known && canKeepItem(known.content, element.content)) {', replace: 'if (known) {', scene: 'mixed-hide-and-replace', size: LAPTOP_BOARD, expects: 'dropped-words', playsThrough: true },
  { name: 'a ring stays inside the column and runs through the words', file: 'apps/web/src/board/boardRowPainting.ts', find: 'left: board.left - flow.left, top: board.top - flow.top, width: board.right - flow.left,', replace: 'left: 0, top: 0, width: flow.width,', scene: 'mixed-marks-on-parts', size: LAPTOP_BOARD, expects: 'line-on-text' },
  { name: 'a note forgets the gutter words under a row', file: 'apps/web/src/board/boardRowPainting.ts', find: 'alsoTaken: rows.flatMap((row) => getGutterWords(row, flow))', replace: 'alsoTaken: []', scene: 'hostile-marks-on-wide-things', size: PHONE_BOARD, expects: 'text-on-text' },
  { name: 'a note under the last row keeps no room', file: 'apps/web/src/board/boardRowPainting.ts', find: 'const room = Math.max(0, Math.ceil(marks.getNotesBottom() - lastRowBottom));', replace: 'const room = 0;', scene: 'physics-lever-labelled', size: PHONE_LANDSCAPE_SCREEN, expects: 'text-off-board' },
  { name: 'a wide diagram keeps its first layout', file: 'packages/board/src/ink/diagram.ts', find: 'tries < MOST_NARROWINGS && drawn.width > maxWidth', replace: 'tries < 0', scene: 'mixed-arrow-past-a-wide-node', size: SMALL_PHONE_SCREEN, expects: 'ink-off-board' },
  { name: 'a gutter mark loses its label', file: 'apps/web/src/board/GutterMark.tsx', find: '{content.label && <span', replace: '{false && <span', scene: 'hostile-marks-on-wide-things', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'a row of tutor text is set as markup', file: 'apps/web/src/board/SharedBoard.tsx', find: '>{content.text}</p>', replace: ' dangerouslySetInnerHTML={{ __html: content.text }} />', scene: 'hostile-markup-everywhere', size: LAPTOP_BOARD, expects: 'forbidden-element' },
];

const LIBRARY_PLANTS_ONLY_ON_THE_VIEW: ReadonlySet<string> = new Set(['placement forgets the height of what is above', 'placement stops shrinking a wide line', 'text is set as markup', 'a note ignores the ring it names']);

async function checkLibraryPlant(page: Page, server: DeckServer, plant: LibraryPlant, surface: DeckSurface): Promise<DefectKind[]> {
  server.plant(plant);
  const shownSize = await getPlantSize(page, plant, surface);
  await page.reload();
  await waitForDeck(page);
  const moments = plant.playsThrough ? await page.evaluate((scene) => window.boardDeck?.listScenes().find(({ name }) => name === scene)?.moments ?? [], plant.scene) : [];
  for (const atMs of moments) await page.evaluate(({ scene, size, at }) => window.boardDeck?.show({ scene, size, atMs: at, mount: 'played' }), { scene: plant.scene, size: shownSize, at: atMs });
  if (moments.length === 0) await page.evaluate(({ scene, size }) => window.boardDeck?.show({ scene, size }), { scene: plant.scene, size: shownSize });
  const found = await page.evaluate((scene) => window.boardDeck?.check({ scene }) ?? [], plant.scene);
  return found.map(({ kind }) => kind);
}

const FLASH_PLANT: SourcePlant = { name: 'a picture shows from its first moment', file: 'apps/web/src/board/imageItem.ts', find: 'const UNSEEN_ENTRANCE_SHARE = 0.42;', replace: 'const UNSEEN_ENTRANCE_SHARE = 0;' };

async function runFlashPlant(page: Page, server: DeckServer, surface: DeckSurface, verdict: Verdict): Promise<void> {
  server.plant(FLASH_PLANT);
  const size = await getPlantSize(page, { size: LAPTOP_BOARD }, surface);
  await page.reload();
  await waitForDeck(page);
  const shots = await page.context().newCDPSession(page);
  const { flashes } = await getFlashesInScene(page, shots, { scene: FLASH_SCENE, lastCommandMs: FLASH_SCENE_LAST_COMMAND_MS, size });
  await shots.detach();
  if (flashes <= 3) verdict.failures.push(`planted defect not caught: ${FLASH_PLANT.name}, ${flashes} flashes in a second`);
  verdict.lines.push(`Planted flash: ${FLASH_PLANT.name}, ${flashes} flashes in a second`);
}

export async function runSourcePlants(page: Page, server: DeckServer, surface: DeckSurface, verdict: Verdict): Promise<void> {
  await runFlashPlant(page, server, surface, verdict);
  let caught = 0;
  const plants = surface === 'rows' ? [...ROW_LIBRARY_PLANTS, ...LIBRARY_PLANTS.filter(({ name }) => !LIBRARY_PLANTS_ONLY_ON_THE_VIEW.has(name))] : LIBRARY_PLANTS;
  for (const plant of plants) {
    const found = await checkLibraryPlant(page, server, plant, surface);
    if (found.includes(plant.expects)) caught += 1;
    else verdict.failures.push(`planted library defect not caught: ${plant.name}, expected ${plant.expects}, found ${found.join(', ') || 'nothing'}`);
  }
  server.plant(null);
  await page.reload();
  await waitForDeck(page);
  verdict.lines.push(`Planted in the library: ${caught} of ${plants.length} caught`);
}
