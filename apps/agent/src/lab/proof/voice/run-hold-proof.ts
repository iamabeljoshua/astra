/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { startCutProxy } from './cut-proxy.ts';
import { readTrace, type TraceRow } from './read-trace.ts';
import { startVoiceStack, type VoiceStack } from './stack.ts';
import { launchProofBrowser, loadClip, openStudentPage, type SpeechClip, type StudentPage } from './student-page.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string', default: 'releases' },
    out: { type: 'string', default: '/tmp/hold-proof' },
    quietLimitMs: { type: 'string', default: '15000' },
    clips: { type: 'string', default: '10' },
    noise: { type: 'string', default: '0' },
    email: { type: 'string', default: 'maya@astra.test' },
    releaseAfterLastSoundMs: { type: 'string', default: '120' },
    holdsOnly: { type: 'boolean', default: false },
  },
});

const out = args.out as string;
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
const MAYA = args.email as string;
const VOICE = 'say-samantha';
const CLIP_IDS = ['quadratic-roots', 'denominator-x', 'x-squared-over', 'why-down', 'twice', 'numerator', 'parabola', 'gravity', 'factor', 'slope', 'hypotenuse', 'momentum'];
const HOLD_LINE = { id: 'factor', text: 'Do I factor the quadratic first?' };
const SETTLE_MS = 1200;
const BYTES_WINDOW_MS = 1500;

const getClip = (id: string) => loadClip(VOICE, id);
const getWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
const getLostWords = (said: string, heard: string | null) => {
  const heardWords = new Set(getWords(heard ?? ''));
  return getWords(said).filter((word) => !heardWords.has(word));
};

const rowsSince = (stack: VoiceStack, student: StudentPage, afterMs: number): TraceRow[] => readTrace(stack.traceFolder, `session-${student.sessionId}`).filter((row) => row.atMs >= afterMs);

async function waitForRows(stack: VoiceStack, student: StudentPage, afterMs: number, isDone: (rows: TraceRow[]) => boolean, limitMs = 15_000): Promise<TraceRow[]> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const rows = rowsSince(stack, student, afterMs);
    if (isDone(rows) || Date.now() > deadline) return rows;
    await delay(40);
  }
}

const getMic = (student: StudentPage) => student.page.evaluate(() => window.astraVoice?.getView().mic ?? 'noVoice');
const getPressed = (student: StudentPage) => student.page.getByRole('button', { name: 'Talk' }).getAttribute('aria-pressed');
const getEpoch = (student: StudentPage) => student.page.evaluate(() => performance.timeOrigin + performance.now());

async function readMicNow(student: StudentPage) {
  const evidence = await student.getMicEvidence();
  return { liveTracks: evidence.tracks.filter((state) => state === 'live').length, liveSenders: evidence.senders.filter((sender) => sender.state === 'live').length, bytes: evidence.senders.reduce((sum, sender) => sum + sender.bytes, 0) };
}

async function readClosed(student: StudentPage) {
  await delay(SETTLE_MS);
  const before = await readMicNow(student);
  await delay(BYTES_WINDOW_MS);
  const after = await readMicNow(student);
  const mic = await getMic(student);
  const pressed = await getPressed(student);
  const isClosed = after.liveTracks === 0 && after.liveSenders === 0 && after.bytes === before.bytes && pressed === 'false' && mic !== 'on' && mic !== 'starting';
  return { isClosed, liveTracks: after.liveTracks, liveSenders: after.liveSenders, bytesMoved: after.bytes - before.bytes, mic, pressed };
}

async function readOpen(student: StudentPage) {
  const before = await readMicNow(student);
  await delay(800);
  const after = await readMicNow(student);
  return { isOpen: after.liveTracks >= 1 && after.bytes > before.bytes && (await getPressed(student)) === 'true', liveTracks: after.liveTracks, bytesMoved: after.bytes - before.bytes, pressed: await getPressed(student) };
}

const clearFocus = (student: StudentPage) => student.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

async function waitForMicUp(student: StudentPage): Promise<void> {
  try {
    await student.page.waitForFunction(() => window.astraVoice?.getView().mic === 'on', undefined, { timeout: 8000 });
  } catch {
    throw new Error(`the microphone never came on: ${JSON.stringify({ mic: await getMic(student), pressed: await getPressed(student), evidence: await student.getMicEvidence(), phase: await student.page.evaluate(() => window.astraVoice?.getView().phase) })}`);
  }
}

async function getTalkCenter(student: StudentPage) {
  const box = await student.page.getByRole('button', { name: 'Talk' }).boundingBox();
  if (!box) throw new Error('no Talk button');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pointerDownOnTalk(student: StudentPage) {
  const center = await getTalkCenter(student);
  await student.page.mouse.move(center.x, center.y);
  await student.page.mouse.down();
}

const tapTalk = async (student: StudentPage, holdMs = 40) => {
  await pointerDownOnTalk(student);
  await delay(holdMs);
  await student.page.mouse.up();
};

async function withStudent<Result>(title: string, run: (student: StudentPage) => Promise<Result>, { proxy, isHeaded }: { proxy?: string; isHeaded?: boolean } = {}): Promise<Result> {
  const browser = await launchProofBrowser({ proxy, isHeaded });
  try {
    const student = await openStudentPage(browser, { email: MAYA, title });
    return await run(student);
  } finally {
    await browser.close();
  }
}

async function goLiveByTap(student: StudentPage): Promise<void> {
  await tapTalk(student);
  await student.waitForLive();
  await waitForMicUp(student);
}

async function goLive(student: StudentPage): Promise<void> {
  await clearFocus(student);
  await student.page.keyboard.down('Space');
  await student.waitForLive();
  await student.page.keyboard.up('Space');
  await delay(600);
}

async function realTabSwitch(student: StudentPage) {
  await clearFocus(student);
  await student.page.keyboard.down('Space');
  await waitForMicUp(student);
  await delay(400);
  const open = await readOpen(student);
  const other = await student.context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await delay(300);
  const visibility = await student.page.evaluate(() => ({ visibility: document.visibilityState, hasFocus: document.hasFocus() }));
  const closed = await readClosed(student);
  await other.close();
  await student.page.bringToFront();
  await student.page.keyboard.up('Space');
  return { open, visibility, closed };
}

async function releaseCases(student: StudentPage): Promise<Record<string, unknown>> {
  const page = student.page;
  const results: Record<string, unknown> = {};
  const holdSpace = async () => {
    await clearFocus(student);
    await page.keyboard.down('Space');
    await waitForMicUp(student);
    await delay(400);
    return readOpen(student);
  };
  const holdTalk = async () => {
    await pointerDownOnTalk(student);
    await waitForMicUp(student);
    await delay(400);
    return readOpen(student);
  };
  const record = async (name: string, hold: () => Promise<unknown>, release: () => Promise<unknown>) => {
    const open = await hold();
    await release();
    results[name] = { open, closed: await readClosed(student) };
    await page.keyboard.up('Space');
    await page.mouse.up();
    await delay(300);
  };
  await record('spaceKeyUp', holdSpace, () => page.keyboard.up('Space'));
  await record('talkPointerUp', holdTalk, () => page.mouse.up());
  await record('talkPointerUpOutsideTheWindow', holdTalk, async () => {
    await page.mouse.move(-400, -400);
    await page.mouse.up();
  });
  await record('talkPointerCancel', holdTalk, () => page.evaluate(() => document.querySelector('[data-talk-button]')?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))));
  await record('windowBlurSpace', holdSpace, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))));
  await record('windowBlurTalk', holdTalk, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))));
  await record('metaKeyDown', holdSpace, () => page.keyboard.down('Meta').then(() => page.keyboard.up('Meta')));
  await record('tabHidden', holdSpace, () =>
    page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete (document as unknown as Record<string, unknown>).visibilityState;
    }),
  );
  await record('pagehide', holdSpace, () => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))));
  return results;
}

const SCENARIOS: Record<string, (stack: VoiceStack) => Promise<unknown>> = {
  // Every way a hold can end, on one page, with the sender's own bytes.
  releases: () =>
    withStudent('Every release', async (student) => {
      await goLive(student);
      return releaseCases(student);
    }),

  // Only a headed browser fires a real blur and a real hidden tab, and it takes the window for about 20 s.
  realTab: () =>
    withStudent(
      'A real tab switch',
      async (student) => {
        await goLive(student);
        return realTabSwitch(student);
      },
      { isHeaded: true },
    ),

  // Key repeat, a tap, double and triple taps, Enter, and Space in a field and on another button.
  presses: () =>
    withStudent('Every press', async (student) => {
      const page = student.page;
      await goLive(student);
      const results: Record<string, unknown> = {};
      const countCaptures = () => student.getMicEvidence().then((evidence) => evidence.tracks.length);

      const capturesBefore = await countCaptures();
      await clearFocus(student);
      await page.keyboard.down('Space');
      await waitForMicUp(student);
      for (let repeat = 0; repeat < 25; repeat += 1) await page.keyboard.down('Space');
      results.keyRepeat = { open: await readOpen(student), capturesAdded: (await countCaptures()) - capturesBefore };
      await page.keyboard.up('Space');
      results.keyRepeatClosed = await readClosed(student);

      await tapTalk(student);
      await waitForMicUp(student);
      results.oneTap = await readOpen(student);
      await tapTalk(student);
      results.oneTapOff = await readClosed(student);

      for (const gapMs of [0, 20, 60, 200]) {
        await tapTalk(student, 20);
        await delay(gapMs);
        await tapTalk(student, 20);
        results[`doubleTap${gapMs}`] = await readClosed(student);
      }

      await tapTalk(student, 20);
      await delay(100);
      await tapTalk(student, 20);
      await delay(100);
      await tapTalk(student, 20);
      await waitForMicUp(student);
      results.tripleTap = await readOpen(student);
      await tapTalk(student);
      results.tripleTapOff = await readClosed(student);

      await page.getByRole('button', { name: 'Talk' }).focus();
      await page.keyboard.press('Enter');
      await waitForMicUp(student);
      results.enterOn = await readOpen(student);
      await page.keyboard.press('Enter');
      results.enterOff = await readClosed(student);

      await page.getByRole('button', { name: 'Talk' }).focus();
      await page.keyboard.press('Space');
      await waitForMicUp(student);
      results.spaceTapOnFocusedTalkOn = await readOpen(student);
      await page.keyboard.press('Space');
      results.spaceTapOnFocusedTalkOff = await readClosed(student);

      await page.keyboard.down('Space');
      await waitForMicUp(student);
      await delay(500);
      results.spaceHoldOnFocusedTalk = await readOpen(student);
      await page.keyboard.up('Space');
      results.spaceHoldOnFocusedTalkOff = await readClosed(student);

      await clearFocus(student);
      await page.keyboard.press('Space');
      results.spaceTapOnPage = await readClosed(student);

      const capturesBeforeField = await countCaptures();
      const box = page.getByRole('textbox', { name: 'Your reply' });
      await box.focus();
      await page.keyboard.down('Space');
      await delay(700);
      await page.keyboard.up('Space');
      results.spaceInTextField = { capturesAdded: (await countCaptures()) - capturesBeforeField, boxValue: JSON.stringify(await box.inputValue()), closed: await readClosed(student) };
      await box.fill('');

      await page.getByRole('button', { name: 'Light' }).focus();
      await page.keyboard.down('Space');
      await delay(600);
      await page.keyboard.up('Space');
      results.spaceOnAnotherButton = { capturesAdded: (await countCaptures()) - capturesBeforeField, closed: await readClosed(student) };

      await clearFocus(student);
      await page.keyboard.down('Space');
      await waitForMicUp(student);
      await delay(400);
      await tapTalk(student);
      const closedWithSpaceDown = await readClosed(student);
      await page.keyboard.up('Space');
      results.talkPressedDuringSpaceHold = { closedWithSpaceDown, afterBothUp: await readClosed(student) };

      await pointerDownOnTalk(student);
      await waitForMicUp(student);
      await delay(400);
      await clearFocus(student);
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
      const stillHeld = await readOpen(student);
      await page.mouse.up();
      results.spacePressedDuringTalkHold = { stillHeld, afterRelease: await readClosed(student) };
      return results;
    }),

  // A hold from a cold page: the press itself opens the room, and the line ends before anyone is listening.
  beforeReady: (stack) =>
    withStudent('Before the room is ready', async (student) => {
      const focusAtStart = await student.page.evaluate(() => document.activeElement?.tagName);
      const clip = getClip(HOLD_LINE.id);
      const startedAtMs = await getEpoch(student);
      await student.page.keyboard.down('Space');
      await delay(700);
      const said = await student.say(clip);
      const releasedAtMs = await getEpoch(student);
      await student.page.keyboard.up('Space');
      const pressedOpen = await readMicNow(student);
      const rows = await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'replyDecided'), 20_000);
      const final = rows.find((row) => row.name === 'words' && row.isFinal);
      return {
        focusAtStart,
        said: clip.text,
        heard: final?.text ?? null,
        lostWords: getLostWords(clip.text, final?.text ?? null),
        phaseAtRelease: await student.page.evaluate(() => window.astraVoice?.getView().phase ?? 'none'),
        micAtRelease: pressedOpen,
        releaseToFinalMs: final ? Math.round(final.atMs - releasedAtMs) : null,
        lastSoundToFinalMs: final ? Math.round(final.atMs - said.lastSoundEpochMs) : null,
        replies: rows.filter((row) => row.name === 'replyDecided').length,
        closed: await readClosed(student),
      };
    }),

  // Letting go during a drop keeps what was captured and sends it when the room is back. A hold through a whole drop stays one hold.
  drop: async (stack) => {
    const proxy = await startCutProxy();
    try {
      return await withStudent(
        'Hold over a drop',
        async (student) => {
          await goLive(student);
          const page = student.page;
          const results: Record<string, unknown> = {};
          const clip = getClip(HOLD_LINE.id);

          await clearFocus(student);
          let startedAtMs = await getEpoch(student);
          await page.keyboard.down('Space');
          await waitForMicUp(student);
          await delay(800);
          proxy.cut();
          await delay(500);
          await student.say(clip);
          await page.keyboard.up('Space');
          const releasedInDrop = { mic: await getMic(student), pressed: await getPressed(student), now: await readMicNow(student) };
          await delay(3000);
          proxy.restore();
          let rows = await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'replyDecided'), 35_000);
          let final = rows.find((row) => row.name === 'words' && row.isFinal);
          results.letGoDuringDrop = { releasedInDrop, heard: final?.text ?? null, lostWords: getLostWords(clip.text, final?.text ?? null), replies: rows.filter((row) => row.name === 'replyDecided').length, phase: await page.evaluate(() => window.astraVoice?.getView().phase), closed: await readClosed(student) };

          await delay(4000);
          startedAtMs = await getEpoch(student);
          await page.keyboard.down('Space');
          await waitForMicUp(student);
          await delay(500);
          proxy.cut();
          await delay(3500);
          proxy.restore();
          await delay(15_000);
          const stillHeld = { mic: await getMic(student), pressed: await getPressed(student), phase: await page.evaluate(() => window.astraVoice?.getView().phase), open: await readOpen(student) };
          await student.say(clip);
          await page.keyboard.up('Space');
          rows = await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'replyDecided'), 20_000);
          final = rows.find((row) => row.name === 'words' && row.isFinal);
          results.holdThroughDrop = { stillHeld, heard: final?.text ?? null, lostWords: getLostWords(clip.text, final?.text ?? null), closed: await readClosed(student) };

          await delay(1000);
          proxy.cut();
          await delay(3500);
          proxy.restore();
          await delay(12_000);
          results.rejoinNeverTurnsMicOn = { phase: await page.evaluate(() => window.astraVoice?.getView().phase), closed: await readClosed(student) };
          return results;
        },
        { proxy: `http://127.0.0.1:${proxy.port}` },
      );
    } finally {
      proxy.close();
    }
  },

  quietClose: () =>
    withStudent('Hold as the room closes', async (student) => {
      await goLive(student);
      await clearFocus(student);
      await student.page.keyboard.down('Space');
      await waitForMicUp(student);
      await delay(400);
      const open = await readOpen(student);
      await student.page.waitForFunction(() => window.astraVoice?.getView().phase === 'closedForQuiet', undefined, { timeout: Number(args.quietLimitMs) + 30_000 });
      const closed = await readClosed(student);
      await student.page.keyboard.up('Space');
      const pressAgain = await student.page.evaluate(() => window.astraVoice?.getView().mic);
      return { open, closed, pressAgain, afterKeyUp: await readClosed(student) };
    }),

  // The limit on the real clock, a key that never comes up.
  longHold: () =>
    withStudent('A very long hold', async (student) => {
      await goLive(student);
      await clearFocus(student);
      await student.page.keyboard.down('Space');
      await waitForMicUp(student);
      const pressedAtMs = Date.now();
      await delay(400);
      const open = await readOpen(student);
      for (let repeat = 0; repeat < 6; repeat += 1) {
        await delay(3000);
        await student.page.keyboard.down('Space');
      }
      await student.page.waitForFunction(() => window.astraVoice?.getView().mic === 'off', undefined, { timeout: 70_000 });
      const closedAfterMs = Date.now() - pressedAtMs;
      const closed = await readClosed(student);
      const note = await student.page.getByText('You held for a minute').count();
      await student.page.keyboard.down('Space');
      await delay(800);
      const repeatAfterLimit = await readMicNow(student);
      await student.page.keyboard.up('Space');
      return { open, closedAfterMs, closed, note, repeatAfterLimit };
    }),

  // Pressing while the tutor speaks stops it, and the board freezes as for a real word.
  interrupt: (stack) =>
    withStudent('Hold over the tutor', async (student) => {
      await goLive(student);
      const rounds: unknown[] = [];
      for (let round = 0; round < 4; round += 1) {
        const startedAtMs = await getEpoch(student);
        const box = student.page.getByRole('textbox', { name: 'Your reply' });
        await box.fill('Show me the ball.');
        await box.press('Enter');
        await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnStarted' && row.kind === 'reply'), 15_000);
        await delay(2500);
        await clearFocus(student);
        const pressedAtMs = await getEpoch(student);
        await student.page.keyboard.down('Space');
        await delay(600);
        const clip = getClip('why-down');
        await student.say(clip);
        const releasedAtMs = await getEpoch(student);
        await student.page.keyboard.up('Space');
        const rows = await waitForRows(stack, student, pressedAtMs, (found) => found.some((row) => row.name === 'replyDecided'), 12_000);
        const trace = await student.getTrace();
        const stopRow = rows.find((row) => row.name === 'stopDecided');
        const final = rows.find((row) => row.name === 'words' && row.isFinal);
        const lastLocalYield = trace.localYieldEpochMs.find((atMs) => atMs >= pressedAtMs) ?? 0;
        const stopAtPage = Object.values(trace.stopEpochMs).at(-1) ?? 0;
        rounds.push({
          localLowerAfterPressMs: Math.round(lastLocalYield - pressedAtMs),
          stopDecidedAfterPressMs: stopRow ? Math.round(stopRow.atMs - pressedAtMs) : null,
          stopAtPageAfterPressMs: Math.round(stopAtPage - pressedAtMs),
          reason: stopRow?.reason,
          heard: final?.text ?? null,
          lostWords: getLostWords(clip.text, final?.text ?? null),
          releaseToFinalMs: final ? Math.round(final.atMs - releasedAtMs) : null,
          replies: rows.filter((row) => row.name === 'replyDecided').map((row) => row.text),
        });
        await waitForRows(stack, student, pressedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 15_000);
        await delay(1000);
      }
      return { rounds, closed: await readClosed(student) };
    }),

  // Noise over a speaking tutor: with press-once it cuts in, and between holds nothing can.
  noiseCuts: (stack) =>
    withStudent('Noise over the tutor', async (student) => {
      await goLive(student);
      const results: Record<string, unknown> = {};
      const speakUnderBursts = async () => {
        const startedAtMs = await getEpoch(student);
        const box = student.page.getByRole('textbox', { name: 'Your reply' });
        await box.fill('Show me the ball.');
        await box.press('Enter');
        await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnStarted' && row.kind === 'reply'), 15_000);
        for (let burst = 0; burst < 4; burst += 1) {
          await delay(1500);
          await Promise.all(['gravity', 'momentum', 'parabola'].map((id) => student.say(getClip(id))));
        }
        await delay(2000);
        return rowsSince(stack, student, startedAtMs);
      };
      const countOf = (rows: TraceRow[], name: string) => rows.filter((row) => row.name === name).length;
      await clearFocus(student);
      const betweenHolds = await speakUnderBursts();
      results.betweenHolds = { voiceStarted: countOf(betweenHolds, 'voiceStarted'), stops: betweenHolds.filter((row) => row.name === 'stopDecided').map((row) => row.reason), bytes: await readMicNow(student) };
      await delay(8000);
      await tapTalk(student);
      await waitForMicUp(student);
      await delay(2500);
      const pressOnce = await speakUnderBursts();
      results.pressOnce = { voiceStarted: countOf(pressOnce, 'voiceStarted'), stops: pressOnce.filter((row) => row.name === 'stopDecided').map((row) => row.reason) };
      results.promptAfter = await student.page.getByText('It sounds noisy.').allTextContents();
      results.isRoomNoisy = await student.page.evaluate(() => window.astraVoice?.getView().isRoomNoisy);
      await tapTalk(student);
      results.closed = await readClosed(student);
      return results;
    }),

  // Sound with no words cutting the tutor again and again raises the prompt, for a student who never held.
  cutsRaisePrompt: (stack) =>
    withStudent('Kept being cut', async (student) => {
      await goLiveByTap(student);
      await delay(3000);
      const startedAtMs = await getEpoch(student);
      const box = student.page.getByRole('textbox', { name: 'Your reply' });
      await box.fill('Show me the ball.');
      await box.press('Enter');
      await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnStarted' && row.kind === 'reply'), 15_000);
      for (let burst = 0; burst < 5; burst += 1) {
        await delay(2500);
        await Promise.all(['gravity', 'momentum', 'parabola'].map((id) => student.say(getClip(id))));
      }
      await delay(2500);
      const rows = rowsSince(stack, student, startedAtMs);
      return { stops: rows.filter((row) => row.name === 'stopDecided').map((row) => row.reason), resumes: rows.filter((row) => row.name === 'resumeStarted').length, prompt: await student.page.getByText('It sounds noisy.').allTextContents(), mic: await getMic(student) };
    }),

  // Steady noise through the real worklet raises the prompt, and a quiet room does not.
  steadyNoise: () =>
    withStudent('Steady noise', async (student) => {
      await goLiveByTap(student);
      const results: Record<string, unknown> = {};
      await delay(6000);
      results.afterQuiet = await student.page.getByText('It sounds noisy.').count();
      await student.say(getClip('factor'));
      await student.say(getClip('slope'));
      results.afterSpeech = await student.page.getByText('It sounds noisy.').count();
      const noisedAtMs = Date.now();
      await student.setNoise(0.05);
      await student.page.getByText('It sounds noisy.').waitFor({ timeout: 15_000 });
      results.secondsToPrompt = (Date.now() - noisedAtMs) / 1000;
      results.mic = await getMic(student);
      await student.setNoise(0);
      await student.page.getByRole('button', { name: 'Dismiss' }).click();
      results.afterDismiss = await student.page.getByText('It sounds noisy.').count();
      await student.setNoise(0.05);
      await delay(6000);
      results.afterSecondNoise = await student.page.getByText('It sounds noisy.').count();
      await student.setNoise(0);
      await tapTalk(student);
      results.closed = await readClosed(student);
      return results;
    }),

  // Same clips, same stand-in brain and fake voice: press-once against hold.
  measure: (stack) => runMeasure(stack),

  invitation: (stack) =>
    withStudent('First session', async (student) => {
      const results: Record<string, unknown> = {};
      const page = student.page;
      const box = page.getByRole('textbox', { name: 'Your reply' });
      const typeAndHear = async (text: string) => {
        const startedAtMs = await getEpoch(student);
        await box.fill(text);
        await box.press('Enter');
        await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 20_000);
        await delay(5000);
        return rowsSince(stack, student, startedAtMs).filter((row) => row.name === 'turnStarted').map((row) => row.kind);
      };
      results.firstAnswer = await typeAndHear('Why does it fall?');
      results.secondAnswer = await typeAndHear('And then what?');
      await page.reload();
      await box.waitFor();
      results.afterReload = await typeAndHear('Tell me more.');
      return results;
    }),
};

interface MeasuredLine {
  clip: string;
  lostWords: string[];
  lastSoundToFinalMs: number | null;
  lastSoundToReplyDecidedMs: number | null;
  lastSoundToFirstWordMs: number | null;
  lastSoundToReactionMs: number | null;
  releaseToFinalMs?: number | null;
  releaseToReplyDecidedMs?: number | null;
  releaseToFirstWordMs?: number | null;
  releaseToLineEndedMs?: number | null;
  releaseToDotMs?: number | null;
  releaseToReactionMs?: number | null;
}

function getPercentile(values: number[], fraction: number): number | null {
  const sorted = [...values].sort((first, second) => first - second);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] as number;
}

const readLine = async ({ stack, student, clip, startedAtMs, lastSoundAtMs, releasedAtMs }: { stack: VoiceStack; student: StudentPage; clip: SpeechClip; startedAtMs: number; lastSoundAtMs: number; releasedAtMs?: number }): Promise<MeasuredLine> => {
  const rows = await waitForRows(stack, student, startedAtMs, (found) => found.some((row) => row.name === 'turnFinished' && row.kind === 'reply'), 15_000);
  const final = rows.find((row) => row.name === 'words' && row.isFinal);
  const replyDecided = rows.find((row) => row.name === 'replyDecided');
  const replyTurn = rows.find((row) => row.name === 'turnStarted' && row.kind === 'reply');
  const reactionTurn = rows.find((row) => row.name === 'turnStarted' && row.kind === 'reaction');
  const lineEnded = rows.find((row) => row.name === 'lineEnded');
  const trace = await student.getTrace();
  const firstWordAtMs = replyTurn?.turnId ? trace.firstAudioEpochMs[replyTurn.turnId] : undefined;
  const reactionAtMs = reactionTurn?.turnId ? trace.firstAudioEpochMs[reactionTurn.turnId] : undefined;
  const since = (from: number, to: number | undefined) => (to === undefined ? null : Math.round(to - from));
  return {
    clip: clip.id,
    lostWords: getLostWords(clip.text, final?.text ?? null),
    lastSoundToFinalMs: since(lastSoundAtMs, final?.atMs),
    lastSoundToReplyDecidedMs: since(lastSoundAtMs, replyDecided?.atMs),
    lastSoundToFirstWordMs: since(lastSoundAtMs, firstWordAtMs),
    lastSoundToReactionMs: since(lastSoundAtMs, reactionAtMs),
    ...(releasedAtMs === undefined ? {} : { releaseToFinalMs: since(releasedAtMs, final?.atMs), releaseToReplyDecidedMs: since(releasedAtMs, replyDecided?.atMs), releaseToFirstWordMs: since(releasedAtMs, firstWordAtMs), releaseToLineEndedMs: since(releasedAtMs, lineEnded?.atMs), releaseToDotMs: since(releasedAtMs, trace.heardEpochMs.find((atMs) => atMs >= releasedAtMs)), releaseToReactionMs: since(releasedAtMs, reactionAtMs) }),
  };
};

const summarise = (lines: MeasuredLine[], field: keyof MeasuredLine) => {
  const values = lines.flatMap((line) => (typeof line[field] === 'number' ? [line[field]] : []));
  return { n: values.length, p50: getPercentile(values, 0.5), p95: getPercentile(values, 0.95), worst: values.length ? Math.max(...values) : null };
};

async function runMeasure(stack: VoiceStack) {
  const clips = CLIP_IDS.slice(0, Number(args.clips)).map(getClip);
  const noise = Number(args.noise);
  const releaseAfterLastSoundMs = Number(args.releaseAfterLastSoundMs);
  return withStudent('Measure', async (student) => {
    await goLive(student);
    if (noise > 0) await student.setNoise(noise);

    await clearFocus(student);
    const coldHolds: MeasuredLine[] = [];
    const holds: MeasuredLine[] = [];
    for (const [index, clip] of clips.entries()) {
      const startedAtMs = await getEpoch(student);
      await student.page.keyboard.down('Space');
      await delay(500);
      const playing = student.say(clip);
      await delay(clip.lastMs + releaseAfterLastSoundMs);
      const releasedAtMs = await getEpoch(student);
      await student.page.keyboard.up('Space');
      const said = await playing;
      const line = await readLine({ stack, student, clip, startedAtMs, lastSoundAtMs: said.lastSoundEpochMs, releasedAtMs });
      (index === 0 ? coldHolds : holds).push(line);
      await delay(800);
    }

    await tapTalk(student);
    await waitForMicUp(student);
    await delay(3500);
    const presses: MeasuredLine[] = [];
    for (const clip of args.holdsOnly ? [] : clips) {
      const startedAtMs = await getEpoch(student);
      const said = await student.say(clip);
      presses.push(await readLine({ stack, student, clip, startedAtMs, lastSoundAtMs: said.lastSoundEpochMs }));
      await delay(800);
    }
    await tapTalk(student);
    if (noise > 0) await student.setNoise(0);
    const fields: (keyof MeasuredLine)[] = ['lastSoundToFinalMs', 'lastSoundToReplyDecidedMs', 'lastSoundToFirstWordMs', 'lastSoundToReactionMs', 'releaseToFinalMs', 'releaseToReplyDecidedMs', 'releaseToFirstWordMs', 'releaseToLineEndedMs', 'releaseToDotMs', 'releaseToReactionMs'];
    return {
      noise,
      releaseAfterLastSoundMs,
      summary: {
        hold: Object.fromEntries(fields.map((field) => [field, summarise(holds, field)])),
        pressOnce: Object.fromEntries(fields.slice(0, 4).map((field) => [field, summarise(presses, field)])),
      },
      lostWords: { hold: holds.reduce((sum, line) => sum + line.lostWords.length, 0), pressOnce: presses.reduce((sum, line) => sum + line.lostWords.length, 0), coldHold: coldHolds[0]?.lostWords },
      coldHold: coldHolds[0],
      holds,
      presses,
      closed: await readClosed(student),
    };
  });
}

mkdirSync(out, { recursive: true });
const stack = await startVoiceStack({ out, agentEnv: { ASTRA_VOICE: 'fake', ...((args.only as string).includes('quietClose') ? { ASTRA_QUIET_LIMIT_MS: args.quietLimitMs as string } : {}) } });
let didThrow = false;
try {
  for (const name of (args.only as string).split(',')) {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`no scenario ${name}`);
    try {
      const result = await scenario(stack);
      console.log(name, JSON.stringify(result));
      writeFileSync(join(out, `result-${name}.json`), `${JSON.stringify(result, null, 1)}\n`);
    } catch (problem) {
      didThrow = true;
      console.log(name, 'THREW', String(problem).slice(0, 800));
    }
  }
} finally {
  await stack.stop();
}
process.exit(didThrow ? 1 : 0);
