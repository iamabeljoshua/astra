import type { BoardElement, BoardOperation, BoardState, QualityTier } from '@astra/board';
import { getBoardAt, getMotionValue } from '@astra/board';
import { DECK, type DeckScene, getSceneMoments, getSceneOperations, getSceneRestMs, getShownWords } from '@astra/board/test-deck';
import type { BoardProblem } from '../../board/boardPainting';
import { type Defect, type ExpectedWords, findColorDefects, findLayoutDefects, type ReportedProblems } from './findLayoutDefects';

export interface BoardSize {
  width: number;
  height: number;
}

export interface ShownScene {
  key: string;
  board: BoardState;
  atMs: number;
  size: BoardSize;
  tier: QualityTier | null;
}

export interface PlayRequest {
  scene: string;
  size: BoardSize;
  limitMs: number;
  tier: QualityTier | null;
}

export interface PlayResult {
  frameTimesMs: number[];
  tierChanges: { atMs: number; tier: QualityTier }[];
}

export interface SweepRequest {
  sizes: readonly (BoardSize & { name: string })[];
  theme: 'light' | 'dark';
  scenes?: readonly string[];
}

export interface SceneFailure {
  scene: string;
  size: string;
  theme: string;
  atMs: number;
  defects: Defect[];
}

export interface SweepResult {
  renders: number;
  textsChecked: number;
  failures: SceneFailure[];
  tooSmallReported: string[];
  wordsReported: string[];
}

export interface BoardDeck {
  listScenes(): { name: string; subject: string; restMs: number; moments: number[] }[];
  prepare(): Promise<void>;
  show(request: { scene: string; size: BoardSize; atMs?: number; mount?: string }): Promise<void>;
  check(request: { scene: string; atMs?: number }): Defect[];
  checkWithColors(request: { scene: string }): Defect[];
  sweep(request: SweepRequest): Promise<SweepResult>;
  play(request: PlayRequest): Promise<PlayResult>;
  getProblems(): readonly BoardProblem[];
}

const MOST_FAILURES_KEPT = 300;

function getReported(problems: readonly BoardProblem[], refused: ReadonlySet<string>): ReportedProblems {
  const labels = problems.flatMap((problem) => (problem.kind === 'labelWithoutRoom' ? [problem.text] : []));
  const small = problems.flatMap((problem) => (problem.kind === 'tooSmallToRead' ? [problem.elementId] : []));
  const missing = problems.flatMap((problem) => (problem.kind === 'imageMissing' ? [problem.elementId] : []));
  const marks = problems.flatMap((problem) => (problem.kind === 'markWithoutTarget' ? [problem.markId] : []));
  return { labelsWithoutRoom: new Set(labels), tooSmallElements: new Set(small), missingImages: new Set(missing), marksWithoutTarget: new Set(marks), refusedMath: refused };
}

const isWrittenInStrokes = (content: BoardElement['content']) => (content.kind === 'text' && content.handwritten === true) || (content.kind === 'diagram' && content.handwritten !== false);

const getHostId = (content: BoardElement['content']) => ('target' in content && typeof content.target === 'string' ? (content.target.split('.')[0] ?? null) : content.kind === 'plot' && content.over !== undefined ? content.over : null);

const getExpected = (board: BoardState): ExpectedWords[] => [...board.elements.values()].map(({ id, content, revealedUpTo }: BoardElement) => ({ elementId: id, words: getShownWords(content, revealedUpTo !== null), isWrittenInStrokes: isWrittenInStrokes(content), isRevealedInSteps: revealedUpTo !== null, hostId: getHostId(content) }));

const getArriving = (board: BoardState, atMs: number) => new Set([...board.elements.values()].filter(({ entrance }) => getMotionValue(entrance, atMs) < 1).map(({ id }) => id as string));

async function waitForImages(board: HTMLElement): Promise<void> {
  await Promise.all([...board.querySelectorAll('img')].map((image) => image.decode().catch(() => {})));
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(done));

export function createBoardDeck({ present, getBoardElement }: { present(shown: ShownScene): void; getBoardElement(): HTMLElement }) {
  const scenes = new Map(DECK.map((scene) => [scene.name, { scene, operations: getSceneOperations(scene) }]));
  let problems: BoardProblem[] = [];
  let noteTierChange: (tier: QualityTier) => void = () => {};
  const refused = new Set<string>();

  const getEntry = (name: string): { scene: DeckScene; operations: BoardOperation[] } => {
    const entry = scenes.get(name);
    if (!entry) throw new Error(`no deck scene ${name}`);
    return entry;
  };

  const showNow = ({ scene, size, atMs, mount, tier = 0 }: { scene: string; size: BoardSize; atMs?: number; mount?: string; tier?: QualityTier | null }) => {
    const { scene: found, operations } = getEntry(scene);
    const shownAt = atMs ?? getSceneRestMs(found);
    const key = mount ?? `${scene}|${size.width}|${size.height}`;
    present({ key, board: getBoardAt(operations, shownAt), atMs: shownAt, size, tier });
    return shownAt;
  };

  const checkNow = (name: string, atMs: number) => {
    const { scene, operations } = getEntry(name);
    const board = getBoardAt(operations, atMs);
    const isAtRest = atMs >= getSceneRestMs(scene);
    return findLayoutDefects({ board: getBoardElement(), expected: getExpected(board), reported: getReported(problems, refused), isAtRest, arriving: getArriving(board, atMs) });
  };

  const sweepScene = async (name: string, request: SweepRequest, result: SweepResult) => {
    const { scene } = getEntry(name);
    for (const size of request.sizes) {
      problems = [];
      refused.clear();
      for (const atMs of getSceneMoments(scene)) {
        showNow({ scene: name, size, atMs, mount: `${name}|${size.name}|${request.theme}` });
        await waitForImages(getBoardElement());
        const { defects, textsChecked } = checkNow(name, atMs);
        const colors = atMs >= getSceneRestMs(scene) ? findColorDefects(getBoardElement()) : [];
        result.renders += 1;
        result.textsChecked += textsChecked;
        if ((defects.length > 0 || colors.length > 0) && result.failures.length < MOST_FAILURES_KEPT) result.failures.push({ scene: name, size: size.name, theme: request.theme, atMs, defects: [...defects, ...colors].slice(0, 6) });
      }
      const silent = (scene.expectedProblems ?? []).filter((kind) => !problems.some((problem) => problem.kind === kind));
      if (silent.length > 0) result.failures.push({ scene: name, size: size.name, theme: request.theme, atMs: getSceneRestMs(scene), defects: silent.map((kind) => ({ kind: 'silent-problem', detail: `the board never reported ${kind}` })) });
      for (const problem of problems) {
        if (problem.kind === 'tooSmallToRead') result.tooSmallReported.push(`${name} at ${size.name}: ${problem.elementId}`);
        if (problem.kind === 'labelWithoutRoom') result.wordsReported.push(`${name} at ${size.name}: ${problem.text.slice(0, 30)}`);
      }
    }
  };

  const deck: BoardDeck = {
    listScenes: () => DECK.map((scene) => ({ name: scene.name, subject: scene.subject, restMs: getSceneRestMs(scene), moments: getSceneMoments(scene) })),
    async prepare() {
      for (const scene of DECK) {
        showNow({ scene: scene.name, size: { width: 760, height: 752 } });
        await waitForImages(getBoardElement());
      }
      await document.fonts.ready;
      await nextFrame();
      await nextFrame();
    },
    async show(request) {
      problems = [];
      refused.clear();
      showNow(request);
      await waitForImages(getBoardElement());
      await nextFrame();
    },
    check: ({ scene, atMs }) => checkNow(scene, atMs ?? getSceneRestMs(getEntry(scene).scene)).defects,
    checkWithColors: ({ scene }) => [...checkNow(scene, getSceneRestMs(getEntry(scene).scene)).defects, ...findColorDefects(getBoardElement())],
    async sweep(request) {
      document.documentElement.dataset.theme = request.theme;
      const result: SweepResult = { renders: 0, textsChecked: 0, failures: [], tooSmallReported: [], wordsReported: [] };
      for (const name of request.scenes ?? DECK.map((scene) => scene.name)) await sweepScene(name, request, result);
      return result;
    },
    play: ({ scene, size, limitMs, tier }) =>
      new Promise((done) => {
        const startedAtMs = performance.now();
        const result: PlayResult = { frameTimesMs: [], tierChanges: [] };
        noteTierChange = (changed) => result.tierChanges.push({ atMs: performance.now() - startedAtMs, tier: changed });
        const playFrame = (now: number) => {
          const atMs = now - startedAtMs;
          result.frameTimesMs.push(atMs);
          showNow({ scene, size, atMs: Math.max(0, atMs), mount: `play|${scene}|${size.width}|${tier}`, tier });
          if (atMs < limitMs) requestAnimationFrame(playFrame);
          else done(result);
        };
        requestAnimationFrame(playFrame);
      }),
    getProblems: () => problems,
  };
  return { deck, noteProblem: (problem: BoardProblem) => problems.push(problem), noteRefusedMath: (tex: string) => refused.add(tex), noteTier: (tier: QualityTier) => noteTierChange(tier) };
}
