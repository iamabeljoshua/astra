/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from 'playwright';

const VIEWPORT = { width: 1366, height: 800 };
const SPOKEN_BEFORE_LIMIT_MS = 60_000;
const QUIET_MS = 3500;
const REPLY_LIMIT_MS = 45_000;
const TITLE_LIMIT_MS = 12_000;
const MOST_NUDGES = 6;

const { values: args } = parseArgs({
  options: {
    web: { type: 'string' },
    out: { type: 'string' },
    only: { type: 'string' },
  },
});

if (!args.web || !args.out) throw new Error('Give --web with the address of a stack you own, and --out for the pictures.');
const WEB = args.web;
const OUT = args.out;
mkdirSync(OUT, { recursive: true });

interface BoardFacts {
  mode: string | null;
  stageSinceMs: number | null;
  openTask: { id: string; way: string; items?: string[]; answer?: string[]; on?: string; reads?: string } | null;
  elements: number;
  fired: { atWord: number; positionMs: number; wordStartMs: number }[];
}

const failures: string[] = [];
const log: string[] = [];
const note = (line: string) => {
  log.push(line);
  console.log(line);
};
const check = (isRight: boolean, what: string) => {
  note(`${isRight ? 'ok  ' : 'FAIL'} ${what}`);
  if (!isRight) failures.push(what);
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, baseURL: WEB, colorScheme: 'light' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error: ${String(error)}`));
  await page.goto('/');
  await page.getByRole('button', { name: 'Development sign-in' }).click();
  await page.getByRole('button', { name: 'maya@astra.test' }).click();
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).waitFor({ timeout: 30_000 });
  return page;
}

async function startFromQuestion(page: Page, question: string): Promise<void> {
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(question);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('[data-testid="tutor-caption"]').waitFor({ timeout: SPOKEN_BEFORE_LIMIT_MS });
}

const getSaid = (page: Page) => page.locator('[data-testid="tutor-caption"]').innerText().catch(() => '');

async function waitForQuiet(page: Page): Promise<string> {
  const startedAtMs = Date.now();
  let last = await getSaid(page);
  let changedAtMs = Date.now();
  while (Date.now() - startedAtMs < REPLY_LIMIT_MS) {
    await delay(200);
    const said = await getSaid(page);
    if (said !== last) {
      last = said;
      changedAtMs = Date.now();
    }
    if (said !== '' && Date.now() - changedAtMs > QUIET_MS) break;
  }
  return last.replace(/\s+/g, ' ');
}

const readBoard = (page: Page) =>
  page.evaluate((): BoardFacts => {
    const voice = (window as unknown as { astraVoice: { getBoardNow(): { board: { stage?: { mode: string; sinceMs: number } | null; elements: Map<string, { content: Record<string, unknown>; progress?: { isOpen?: boolean } }> } }; records: { fired: BoardFacts['fired'] } } }).astraVoice;
    const { board } = voice.getBoardNow();
    const open = [...board.elements.values()].filter(({ content, progress }) => content.kind === 'task' && progress?.isOpen).at(-1);
    return { mode: board.stage?.mode ?? null, stageSinceMs: board.stage?.sinceMs ?? null, openTask: (open?.content as unknown as BoardFacts['openTask']) ?? null, elements: board.elements.size, fired: voice.records.fired.slice(-6).map(({ atWord, positionMs, wordStartMs }) => ({ atWord, positionMs, wordStartMs })) };
  });

const getHeaderTitle = (page: Page) => page.locator('header .label').first().innerText();

async function say(page: Page, words: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Write on the board' });
  const typeTool = page.getByRole('button', { name: 'Type', exact: true });
  if (await typeTool.count()) await typeTool.click();
  else await input.click();
  await input.pressSequentially(words, { delay: 15 });
  await input.press('Enter');
  await delay(900);
}

async function waitForTitle(page: Page, words: RegExp): Promise<string> {
  const startedAtMs = Date.now();
  let title = await getHeaderTitle(page);
  while (!words.test(title) && Date.now() - startedAtMs < TITLE_LIMIT_MS) {
    await delay(200);
    title = await getHeaderTitle(page);
  }
  return title;
}

const shoot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

async function doPlaceTask(page: Page, { items, answer }: NonNullable<BoardFacts['openTask']>): Promise<void> {
  for (const item of answer ?? items ?? []) {
    await page.locator('[data-testid="place-item"]', { hasText: item }).first().click();
    await page.locator('[data-testid="place-slot"]').first().click();
    await delay(150);
  }
}

const getLoggedMoves = (page: Page) =>
  page.evaluate(() => {
    const voice = (window as unknown as { astraVoice: { player: { getOperations(): { kind: string; atMs: number; command?: { kind: string; mode?: string } }[] } } }).astraVoice;
    return voice.player
      .getOperations()
      .filter(({ kind, command }) => kind === 'command' && command !== undefined)
      .map(({ atMs, command }) => ({ atMs, kind: command?.kind, mode: command?.mode }));
  });

async function proveDirectQuestion(browser: Browser) {
  note('\n--- a direct question goes hands-on');
  const page = await openPage(browser);
  await startFromQuestion(page, "what's 15% of 80?");
  const said = await waitForQuiet(page);
  const board = await readBoard(page);
  note(`tutor: ${said}`);
  note(`board: ${JSON.stringify(board)}`);
  note(`logged commands: ${JSON.stringify(await getLoggedMoves(page))}`);
  check(board.openTask !== null, 'a direct question set a task in its first reply');
  check(board.mode === 'handsOn', 'the board came in');
  check(await page.locator('[data-testid="board-visual"]').count() === 0, 'with no picture, no empty box stands where the visual would be');
  await shoot(page, 'direct-1-hands-on');
  await page.context().close();
}

async function proveTopicTeachesFirst(browser: Browser) {
  note('\n--- a topic teaches first, then an exercise in words');
  const page = await openPage(browser);
  await startFromQuestion(page, 'Give me a lesson on the causes of World War One');
  const said = await waitForQuiet(page);
  const first = await readBoard(page);
  note(`tutor: ${said}`);
  note(`board: ${JSON.stringify(first)}`);
  check(first.openTask === null, 'a topic set no task in its first reply');
  await shoot(page, 'topic-1-teaching');
  let board = first;
  for (let nudge = 0; nudge < MOST_NUDGES && board.openTask === null; nudge += 1) {
    await say(page, nudge === 0 ? 'ok, got it' : 'ok');
    note(`tutor: ${await waitForQuiet(page)}`);
    board = await readBoard(page);
  }
  note(`board: ${JSON.stringify(board)}`);
  check(board.openTask !== null, 'it picked an exercise to do together');
  check(board.mode === 'handsOn', 'the board came in for the exercise');
  check(!/\$|\\frac|=/.test(JSON.stringify(board.openTask)), 'the exercise is in words, not math');
  await shoot(page, 'topic-2-exercise');
  if (board.openTask?.way === 'place') await doPlaceTask(page, board.openTask);
  else await say(page, 'the alliances pulled everyone in once Austria went after Serbia');
  note(`tutor: ${await waitForQuiet(page)}`);
  await shoot(page, 'topic-3-after-the-exercise');
  await page.context().close();
}

async function proveSwitch(browser: Browser) {
  note('\n--- a switch mid-session, and back');
  const page = await openPage(browser);
  await startFromQuestion(page, 'Help me solve 2x + 3 = 11. I want to do it myself on the board, line by line.');
  note(`tutor: ${await waitForQuiet(page)}`);
  check((await readBoard(page)).openTask !== null, 'the problem is set');
  await delay(2500);
  await shoot(page, 'switch-1-problem');
  await say(page, 'teach me physics of the impossible');
  const taught = await waitForQuiet(page);
  note(`tutor: ${taught}`);
  check(!/new session/i.test(taught), 'it never says to start a new session');
  const title = await waitForTitle(page, /impossible/i);
  check(/impossible/i.test(title), `the title moved to the new topic: ${title}`);
  note(`board: ${JSON.stringify(await readBoard(page))}`);
  await shoot(page, 'switch-2-new-topic');
  await say(page, 'so is a force field really possible?');
  const asked = await waitForQuiet(page);
  note(`tutor: ${asked}`);
  check(!/new session/i.test(asked), 'still no new session on the next line');
  await say(page, 'go back to my problem');
  const back = await waitForQuiet(page);
  note(`tutor: ${back}`);
  const backTitle = await waitForTitle(page, /2x/i);
  check(/2x/i.test(backTitle), `the title moved back: ${backTitle}`);
  const backBoard = await readBoard(page);
  note(`board: ${JSON.stringify(backBoard)}`);
  check(backBoard.openTask !== null && backBoard.mode === 'handsOn', 'it went back to the problem, on the board, with a task');
  await shoot(page, 'switch-3-back');
  await say(page, '2x = 8');
  await delay(1200);
  await say(page, 'x = 4');
  note(`tutor: ${await waitForQuiet(page)}`);
  await shoot(page, 'switch-4-solved');
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForURL(/sessions|\/$/, { timeout: 15_000 }).catch(() => {});
  await page.goto('/sessions');
  const row = page.getByRole('link', { name: /2x \+ 3 = 11/ }).first();
  await row.waitFor({ timeout: 15_000 });
  note(`sessions page shows: ${await row.innerText()}`);
  await shoot(page, 'switch-5-sessions-page');
  await page.context().close();
}

interface VisualMoment {
  atMs: number;
  isBig: string | null;
  isMoving: string | null;
  isSmall: string | null;
  transform: string;
  firedCues: number;
}

// Runs in the page from before the first cue, and writes down the picture at each frame it changes, with how many cues had fired by then.
const watchVisual = () => {
  const moments: VisualMoment[] = [];
  (window as unknown as { visualMoments: VisualMoment[] }).visualMoments = moments;
  let last = '';
  const look = () => {
    const box = document.querySelector<HTMLElement>('[data-testid="board-visual"]');
    const voice = (window as unknown as { astraVoice?: { records: { fired: unknown[] } } }).astraVoice;
    if (box) {
      const moment = { atMs: performance.now(), isBig: box.dataset.big ?? null, isMoving: box.dataset.moving ?? null, isSmall: box.dataset.small ?? null, transform: box.style.transform, firedCues: voice?.records.fired.length ?? 0 };
      const key = `${moment.isBig}${moment.isMoving}${moment.isSmall}${moment.transform}`;
      if (key !== last) moments.push(moment);
      last = key;
    }
    requestAnimationFrame(look);
  };
  look();
};

async function proveVisualMove(browser: Browser) {
  note('\n--- with a picture: it stands big, and the move to hands-on lands on a word through a logged command');
  const page = await openPage(browser);
  await page.evaluate(watchVisual);
  await page.getByRole('button', { name: /How a jump shot flies/ }).click();
  await page.locator('[data-testid="tutor-caption"]').waitFor({ timeout: SPOKEN_BEFORE_LIMIT_MS });
  await page.locator('[data-testid="board-visual"]').waitFor({ timeout: SPOKEN_BEFORE_LIMIT_MS });
  await shoot(page, 'visual-1-big');
  note(`tutor: ${await waitForQuiet(page)}`);
  // Sent as a spoken line would be, because typing on the board brings the board in by itself, before any cue.
  for (let nudge = 0; nudge < MOST_NUDGES && (await readBoard(page)).mode !== 'handsOn'; nudge += 1) {
    await page.evaluate(() => (window as unknown as { astraVoice: { sendTyped(text: string): void } }).astraVoice.sendTyped('let me try one together now'));
    await delay(900);
    note(`tutor: ${await waitForQuiet(page)}`);
  }
  const moments = await page.evaluate(() => (window as unknown as { visualMoments: VisualMoment[] }).visualMoments);
  const firstMoving = moments.find(({ isMoving }) => isMoving === 'true');
  const firstSmall = moments.find(({ isSmall }) => isSmall === 'true');
  check(moments[0]?.isBig === 'true', 'the picture stood big before the first cue');
  check(firstMoving !== undefined && firstSmall !== undefined, 'it moved');
  const glideMs = (firstSmall?.atMs ?? 0) - (firstMoving?.atMs ?? 0);
  note(`the glide took ${Math.round(glideMs)} ms, with ${moments.length} frames written, from ${firstMoving?.transform} to ${firstSmall?.transform}, after ${firstMoving?.firedCues} cues had fired`);
  check(glideMs > 400 && glideMs < 800, 'the glide took about 560 ms');
  const board = await readBoard(page);
  const logged = await getLoggedMoves(page);
  const moveOp = logged.find(({ kind, mode }) => kind === 'boardMode' && mode === 'handsOn');
  note(`logged commands: ${JSON.stringify(logged.slice(0, 12))}`);
  note(`stage: ${board.mode} since ${board.stageSinceMs}, cues: ${JSON.stringify(board.fired)}`);
  check(logged.some(({ atMs }) => atMs === board.stageSinceMs), 'the stage moved at the moment of a logged command');
  note(moveOp ? `the tutor itself said boardMode at ${moveOp.atMs} ms` : 'the tutor drew first, and that drawing brought the board in at its own word');
  check(board.fired.every(({ positionMs, wordStartMs }) => positionMs >= wordStartMs && positionMs - wordStartMs < 100), 'every cue fired within 100 ms of its word');
  const visual = page.locator('[data-testid="board-visual"]');
  const box = await visual.boundingBox();
  check((box?.width ?? VIEWPORT.width) < VIEWPORT.width * 0.25, `the picture is small, in the corner: ${JSON.stringify(box)}`);
  await shoot(page, 'visual-2-hands-on');
  await visual.click();
  await delay(800);
  check((await visual.getAttribute('data-big-over-board')) === 'true', 'a click brings it back big');
  await shoot(page, 'visual-3-looked-again');
  await page.context().close();
}

async function proveCardPictureGoes(browser: Browser) {
  note("\n--- a switch in a card's session takes the card's picture away, and leaves no empty box");
  const page = await openPage(browser);
  await page.getByRole('button', { name: /Why a curveball curves|Why Saturn|How a jump shot flies|Free-body/ }).first().click();
  await page.locator('[data-testid="tutor-caption"]').waitFor({ timeout: SPOKEN_BEFORE_LIMIT_MS });
  note(`tutor: ${await waitForQuiet(page)}`);
  check(await page.locator('[data-testid="board-visual"]').count() === 1, "the card's picture is there");
  await say(page, 'actually, teach me about black holes');
  const said = await waitForQuiet(page);
  note(`tutor: ${said}`);
  check(!/new session/i.test(said), 'it never says to start a new session');
  const title = await waitForTitle(page, /black hole/i);
  check(/black hole/i.test(title), `the title moved: ${title}`);
  await delay(800);
  check(await page.locator('[data-testid="board-visual"]').count() === 0, "the card's picture has gone");
  await shoot(page, 'card-switch-no-picture');
  await page.context().close();
}

const JOURNEYS: Record<string, (browser: Browser) => Promise<void>> = { direct: proveDirectQuestion, topic: proveTopicTeachesFirst, switch: proveSwitch, visual: proveVisualMove, card: proveCardPictureGoes };

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain'] });
  const chosen = args.only ? args.only.split(',') : Object.keys(JOURNEYS);
  for (const name of chosen) {
    try {
      await JOURNEYS[name]?.(browser);
    } catch (error) {
      failures.push(`${name} stopped: ${String(error).slice(0, 400)}`);
      note(`FAIL ${name} stopped: ${String(error).slice(0, 400)}`);
    }
  }
  await browser.close();
  note(failures.length === 0 ? '\nPASSED' : `\nFAILED\n${failures.join('\n')}`);
  writeFileSync(join(OUT, 'lesson-proof.txt'), `${log.join('\n')}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

await main();
