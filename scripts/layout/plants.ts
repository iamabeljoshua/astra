import type { Page } from 'playwright';
import type { DefectKind } from '../../apps/web/src/lab/deck/findLayoutDefects.ts';
import { type DeckServer, type SourcePlant, waitForDeck } from './deck-server.ts';

const BOARD = '[data-testid="board"]';
const LAPTOP_BOARD = { width: 760, height: 752 };
const PHONE_BOARD = { width: 358, height: 506 };

interface PagePlant {
  name: string;
  scene: string;
  size: { width: number; height: number };
  expects: DefectKind;
  plant(boardSelector: string): void;
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

async function checkPlant(page: Page, plant: PagePlant, mount: string): Promise<DefectKind[]> {
  await page.evaluate(({ scene, size, key }) => window.boardDeck?.show({ scene, size, mount: key }), { scene: plant.scene, size: plant.size, key: mount });
  await page.evaluate(`(${plant.plant.toString().replace(/^plant/, 'function')})(${JSON.stringify(BOARD)})`);
  await page.waitForTimeout(plant.expects === 'broken-image' ? 300 : 0);
  const found = await page.evaluate((scene) => window.boardDeck?.checkWithColors({ scene }) ?? [], plant.scene);
  await page.evaluate(() => window.dispatchEvent(new Event('deck-plant-done')));
  return found.map(({ kind }) => kind);
}

export async function runPagePlants(page: Page, verdict: Verdict): Promise<void> {
  let caught = 0;
  for (const [index, plant] of PAGE_PLANTS.entries()) {
    const found = await checkPlant(page, plant, `plant-${index}`);
    if (found.includes(plant.expects)) caught += 1;
    else verdict.failures.push(`planted defect not caught: ${plant.name}, expected ${plant.expects}, found ${found.join(', ') || 'nothing'}`);
  }
  verdict.lines.push(`Planted in the page: ${caught} of ${PAGE_PLANTS.length} caught`);
}

interface LibraryPlant extends SourcePlant {
  scene: string;
  size: { width: number; height: number };
  expects: DefectKind;
}

const LIBRARY_PLANTS: readonly LibraryPlant[] = [
  { name: 'an empty curve loses its name', file: 'packages/board/src/plot/plot-figure.ts', find: "(isWhole ? { x: (view.rect.left + view.rect.right) / 2, y: (view.rect.top + view.rect.bottom) / 2 } : null)", replace: 'null', scene: 'hostile-curve-with-no-values', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'placement forgets the height of what is above', file: 'packages/board/src/layout/place-elements.ts', find: 'y += placement.height + area.gap;', replace: 'y += area.gap;', scene: 'mixed-lesson-opening', size: LAPTOP_BOARD, expects: 'element-on-element' },
  { name: 'placement stops shrinking a wide line', file: 'packages/board/src/layout/place-elements.ts', find: 'return Math.min(1, widthScale, heightScale);', replace: 'return 1;', scene: 'hostile-widest-table', size: PHONE_BOARD, expects: 'element-off-board' },
  { name: 'a table cell no longer breaks a long word', file: 'packages/board/src/table/table-painter.ts', find: "const cell = makeTextElement('td', 'board-table-cell', text);", replace: "const cell = makeTextElement('td', 'board-table-cell', text); cell.style.overflowWrap = 'normal'; cell.style.whiteSpace = 'nowrap';", scene: 'language-long-words-table', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'a code line no longer wraps', file: 'packages/board/src/code/code-painter.ts', find: "text.dir = 'ltr';", replace: "text.dir = 'ltr'; text.style.whiteSpace = 'pre'; text.style.overflowWrap = 'normal';", scene: 'code-long-line', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'figure labels skip the overlap search', file: 'packages/board/src/figure/place-labels.ts', find: 'return !others.some((other) => doBoxesOverlap(box, other));', replace: 'return true;', scene: 'hostile-marks-on-one-spot', size: PHONE_BOARD, expects: 'text-on-text' },
  { name: 'timeline events pile up', file: 'packages/board/src/timeline/timeline-painter.ts', find: "event.className = 'board-timeline-event';", replace: "event.className = 'board-timeline-event'; event.style.marginTop = '-40px';", scene: 'history-empires-timeline', size: LAPTOP_BOARD, expects: 'text-on-text' },
  { name: 'a drawing label leaves its gutter', file: 'packages/board/src/diagram/label-drawing.ts', find: 'getLabelStep(label, { x: 0, isLeft: true, bodyAt, scale })', replace: 'getLabelStep(label, { x: -400, isLeft: true, bodyAt, scale })', scene: 'biology-cell-labelled', size: PHONE_BOARD, expects: 'text-off-board' },
  { name: 'an image ignores its shape', file: 'apps/web/src/board/imageItem.ts', find: "if (image.getAttribute('height') !== height) image.setAttribute('height', height);", replace: "image.style.height = '40px';", scene: 'history-great-wave', size: LAPTOP_BOARD, expects: 'stretched-image' },
  { name: 'text is set as markup', file: 'apps/web/src/lab/BoardView.tsx', find: '>{content.text}</p>', replace: ' dangerouslySetInnerHTML={{ __html: content.text }} />', scene: 'hostile-markup-everywhere', size: LAPTOP_BOARD, expects: 'forbidden-element' },
  { name: 'a long label is cut to fit', file: 'packages/board/src/figure/place-labels.ts', find: 'return [...lines, line].slice(0, MOST_LINES);', replace: 'return [...lines, line].slice(0, 1);', scene: 'mixed-long-plot-label', size: PHONE_BOARD, expects: 'dropped-words' },
  { name: 'a diagram leaves a plain label off', file: 'packages/board/src/ink/diagram.ts', find: 'textLabels: [...(node.label.text ? [moveTextLabel(node.label.text, labelAt)] : []), ...edges.flatMap((edge) => edge.textLabels)],', replace: 'textLabels: edges.flatMap((edge) => edge.textLabels),', scene: 'biology-food-chain', size: LAPTOP_BOARD, expects: 'dropped-words' },
  { name: 'a long arrow runs straight through the rank between', file: 'packages/board/src/diagram/layout-graph.ts', find: 'points.push(toPoint(axes, centre(lane), band.start - arrowGap), toPoint(axes, centre(lane), band.end + arrowGap));', replace: '', scene: 'mixed-arrow-past-a-wide-node', size: LAPTOP_BOARD, expects: 'line-on-box' },
  { name: 'an arrow loses its straight run past a taller neighbour', file: 'packages/board/src/ink/diagram.ts', find: 'return [{ ...makeStroke(holdCorners(points)), role: \'line\' }', replace: 'return [{ ...makeStroke([points[0] as InkPosition, { x: (points.at(-1) as InkPosition).x, y: (points[0] as InkPosition).y + 400 }, points.at(-1) as InkPosition]), role: \'line\' }', scene: 'mixed-arrow-past-a-wide-node', size: LAPTOP_BOARD, expects: 'line-on-box' },
];

async function checkLibraryPlant(page: Page, server: DeckServer, plant: LibraryPlant): Promise<DefectKind[]> {
  server.plant(plant);
  await page.reload();
  await waitForDeck(page);
  await page.evaluate(({ scene, size }) => window.boardDeck?.show({ scene, size }), { scene: plant.scene, size: plant.size });
  const found = await page.evaluate((scene) => window.boardDeck?.check({ scene }) ?? [], plant.scene);
  return found.map(({ kind }) => kind);
}

export async function runSourcePlants(page: Page, server: DeckServer, verdict: Verdict): Promise<void> {
  let caught = 0;
  for (const plant of LIBRARY_PLANTS) {
    const found = await checkLibraryPlant(page, server, plant);
    if (found.includes(plant.expects)) caught += 1;
    else verdict.failures.push(`planted library defect not caught: ${plant.name}, expected ${plant.expects}, found ${found.join(', ') || 'nothing'}`);
  }
  server.plant(null);
  await page.reload();
  await waitForDeck(page);
  verdict.lines.push(`Planted in the library: ${caught} of ${LIBRARY_PLANTS.length} caught`);
}
