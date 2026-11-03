// Drives the production build in real browsers and prints PASS or FAIL per numbered change. Usage: behavior.mjs <label> [section,section]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { BASE, SCRATCH, getTextBox, launch, openPage, setMode, waitForLoadedHome } from './lib.mjs';

const label = process.argv[2] ?? 'run';
const only = process.argv[3]?.split(',');
const OUT = `${SCRATCH}/shots/${label}`;
mkdirSync(OUT, { recursive: true });
const LONG = 'Why does a ball thrown at an angle follow a curved path instead of a straight line, and how would I work out how far it lands if I know the speed I threw it at, the angle, and the height of my hand above the ground? Can you also show me what changes when air resistance is included, because my teacher said the simple answer is only an approximation.';
const results = [];
function check(section, kind, name, ok, detail = '') {
  results.push({ section, kind, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${section}] [${kind}] ${name}${detail ? ` | ${detail}` : ''}`);
}
const readBox = (page) => page.evaluate(() => {
  const t = document.querySelector('textarea');
  const shown = t.style.height;
  const rect = t.getBoundingClientRect();
  t.style.height = 'auto';
  const contentPx = t.scrollHeight;
  t.style.height = shown;
  return { heightPx: rect.height, style: shown, contentPx, clientPx: t.clientHeight, valueLength: t.value.length };
});
const activeTag = (page) => page.evaluate(() => { const a = document.activeElement; return `${a.tagName}${a === document.body ? '' : `:${(a.getAttribute('aria-label') || a.textContent || '').slice(0, 30)}`}`; });

async function rotateWithMenuOpen(kind, browser) {
  for (const [from, to, text] of [
    [[390, 844], [380, 844], 'A question I already typed'],
    [[390, 844], [844, 390], 'Why is the sky blue?'],
    [[375, 667], [667, 375], 'Why is the sky blue?'],
    [[412, 915], [915, 412], 'Why is the sky blue?'],
    [[360, 800], [800, 360], 'Why is the sky blue?'],
    [[390, 844], [390, 700], ''],
    [[390, 844], [390, 700], 'Why is the sky blue?'],
    [[390, 844], [390, 700], LONG],
    [[360, 640], [640, 360], 'Why is the sky blue?'],
    [[390, 500], [390, 844], LONG],
  ]) {
    const { context, page } = await openPage(browser, { width: from[0], height: from[1] });
    await waitForLoadedHome(page);
    await getTextBox(page).focus();
    if (text) await page.keyboard.insertText(text);
    await page.waitForTimeout(40);
    const before = await readBox(page);
    const restPx = await page.evaluate(() => { const t = document.querySelector('textarea'); return t.value === '' ? t.getBoundingClientRect().height : null; });
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.click();
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: to[0], height: to[1] });
    await page.waitForTimeout(120);
    if (to[0] > 760) {
      await page.setViewportSize({ width: from[0], height: from[1] });
      await page.waitForTimeout(120);
    }
    await menu.click();
    await page.waitForTimeout(650);
    const after = await readBox(page);
    const textVisible = after.heightPx >= 42 && after.heightPx >= Math.min(after.contentPx, 140);
    const fits = after.heightPx <= Math.max(before.heightPx, Math.min(after.contentPx, 140)) + 1;
    check(1, kind, `${from.join('x')} to ${to.join('x')} with Menu open, ${text ? `${text.length} chars` : 'empty'}`, textVisible && fits, `height ${after.heightPx} style ${after.style} content ${after.contentPx}`);
    if (text === 'A question I already typed') await page.screenshot({ path: `${OUT}/1-collapse-${kind}.png` });
    await context.close();
  }
}

async function walkTabs(page, { steps, reverse = false }) {
  const rows = [];
  const tabKey = page.context().browser().browserType().name() === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press(reverse ? `Shift+${tabKey}` : tabKey);
    await page.waitForTimeout(40);
    const row = await page.evaluate(() => {
      const active = document.activeElement;
      const box = active.getBoundingClientRect();
      const dock = document.querySelector('form')?.parentElement;
      const dockTop = dock.getBoundingClientRect().top;
      const inDock = dock.contains(active);
      const inMain = !!active.closest('main');
      const ringBottom = box.bottom + 4;
      const ringTop = box.top - 4;
      const atCenter = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        name: (active.getAttribute('aria-label') || active.textContent || active.tagName).slice(0, 28),
        inDock, inMain, height: box.height,
        coveredPx: inMain && !inDock ? Math.max(0, Math.min(box.bottom, innerHeight) - dockTop) : 0,
        ringCoveredPx: inMain && !inDock ? Math.max(0, ringBottom - dockTop) : 0,
        padding: getComputedStyle(document.documentElement).scrollPaddingBottom,
        ringAboveWindowPx: Math.max(0, -ringTop),
        ringBelowWindowPx: Math.max(0, ringBottom - innerHeight),
        hitsSelf: !!atCenter && (active === atCenter || active.contains(atCenter)),
        scrollY: Math.round(scrollY),
        isBody: active === document.body,
      };
    });
    rows.push(row);
  }
  return rows;
}

async function checkFocusStops(kind, name, rows) {
  const stops = rows.filter((row) => row.inMain && !row.inDock);
  const covered = stops.filter((row) => row.coveredPx > 0);
  const ringCut = stops.filter((row) => row.ringCoveredPx > 0);
  const clipped = stops.filter((row) => row.ringAboveWindowPx > 0 || row.ringBelowWindowPx > 0);
  check(2, kind, `${name}: ${stops.length} focus stops in the cards, none covered by the dock`, stops.length > 0 && covered.length === 0 && stops.every((row) => row.hitsSelf), covered.map((row) => `${row.name} ${row.coveredPx}/${row.height}`).join('; '));
  check(2, kind, `${name}: focus ring clear of the dock`, stops.length > 0 && ringCut.length === 0, ringCut.map((row) => `${row.name} ${row.ringCoveredPx}`).join('; '));
  check(2, kind, `${name}: focus ring inside the window`, stops.length > 0 && clipped.length === 0, clipped.map((row) => `${row.name} above ${row.ringAboveWindowPx} below ${row.ringBelowWindowPx}`).join('; '));
}

async function focusBehindDock(kind, browser) {
  for (const [width, height] of [[390, 844], [640, 400], [1280, 400], [390, 660]]) {
    const { context, page } = await openPage(browser, { width, height, deviceScaleFactor: width === 640 ? 2 : 1 });
    await waitForLoadedHome(page);
    const forward = await walkTabs(page, { steps: width >= 761 ? 14 : 12 });
    await checkFocusStops(kind, `${width}x${height} Tab`, forward);
    if (width === 390 && height === 844) await page.screenshot({ path: `${OUT}/2-focus-${kind}.png` });
    const backward = await walkTabs(page, { steps: 9, reverse: true });
    await checkFocusStops(kind, `${width}x${height} Shift+Tab`, backward);
    await context.close();
  }
  // The dock grows with a long question, a chip, and a notice, then focus walks back into the cards.
  for (const [width, height] of [[390, 844], [640, 400]]) {
    const { context, page } = await openPage(browser, { width, height });
    await waitForLoadedHome(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'homework.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    await getTextBox(page).focus();
    await page.keyboard.insertText(LONG);
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.waitForTimeout(80);
    await page.locator('main ul button').first().focus();
    const padding = await page.evaluate(() => ({ dock: document.querySelector('form').parentElement.getBoundingClientRect().height, paddingWhileOnCard: getComputedStyle(document.documentElement).scrollPaddingBottom }));
    await getTextBox(page).focus();
    const paddingInBox = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
    check(2, kind, `${width}x${height} scroll padding tracks a grown dock while focus is on a card, and is off in the box`, parseFloat(padding.paddingWhileOnCard) >= padding.dock && paddingInBox === 'auto', `${JSON.stringify(padding)} in box ${paddingInBox}`);
    const rows = await walkTabs(page, { steps: 9, reverse: true });
    await checkFocusStops(kind, `${width}x${height} grown dock Shift+Tab`, rows);
    await context.close();
  }
}

async function scrollStability(kind, browser) {
  for (const [width, height] of [[390, 844], [640, 400], [1366, 650]]) {
    const { context, page } = await openPage(browser, { width, height });
    await waitForLoadedHome(page);
    await page.evaluate(() => window.scrollTo(0, 30));
    await page.waitForTimeout(40);
    const start = await page.evaluate(() => scrollY);
    const center = await page.evaluate(() => { const box = document.querySelector('textarea').getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; });
    await page.mouse.click(center[0], center[1]);
    await page.waitForTimeout(60);
    const focused = await activeTag(page);
    const afterFocus = await page.evaluate(() => scrollY);
    await page.keyboard.type('hello');
    await page.waitForTimeout(60);
    const afterTyping = await page.evaluate(() => scrollY);
    check('2-scroll', kind, `${width}x${height} clicking and typing in the box leaves the page where it was`, focused.startsWith('TEXTAREA') && afterFocus === start && afterTyping === start, `start ${start} focus ${afterFocus} typing ${afterTyping} active ${focused}`);
    await context.close();
  }
  {
    const { context, page } = await openPage(browser, { width: 390, height: 700 });
    await waitForLoadedHome(page);
    await getTextBox(page).focus({ preventScroll: true });
    await page.keyboard.insertText(LONG.slice(0, 200));
    await page.waitForTimeout(50);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(50);
    const seen = [await page.evaluate(() => Math.round(scrollY))];
    for (const letter of 'abc') {
      await page.keyboard.type(letter);
      await page.waitForTimeout(40);
      seen.push(await page.evaluate(() => Math.round(scrollY)));
    }
    console.log(`INFO [2-scroll] [${kind}] typing with a grown box at the true bottom, scrollY: ${seen.join(' ')}`);
    await context.close();
  }
  const { context, page } = await openPage(browser, { width: 1366, height: 650 });
  await waitForLoadedHome(page);
  const rows = [];
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press(kind === 'webkit' ? 'Alt+Tab' : 'Tab');
    await page.waitForTimeout(40);
    rows.push(await page.evaluate(() => [document.activeElement.textContent.slice(0, 12), Math.round(scrollY)]));
  }
  check('2-scroll', kind, '1366x650 Tab through the sidebar does not move the page', rows.every(([, y]) => y === 0), JSON.stringify(rows));
  await context.close();
}

async function staleHeights(kind, browser) {
  for (const width of [376, 380, 384, 388, 390, 400, 420, 360]) {
    await setMode({ fontDelayMs: 1200 });
    const { context, page } = await openPage(browser, { width, height: 800 });
    await page.goto(`${BASE}/`);
    await page.locator('textarea').waitFor();
    await page.waitForTimeout(150);
    const early = await readBox(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.fonts].some((face) => face.family.includes('Barlow') && face.status === 'loaded'));
    await page.waitForTimeout(1800);
    const late = await readBox(page);
    check(3, kind, `${width} wide, height fits after Barlow arrives late`, Math.abs(late.heightPx - late.contentPx) <= 0.5, `before font ${early.heightPx} after font ${late.heightPx} content ${late.contentPx}`);
    await context.close();
    await setMode({ fontDelayMs: 0 });
  }
  for (const width of [320, 340]) {
    const { context, page } = await openPage(browser, { width, height: 800 });
    await waitForLoadedHome(page);
    const off = await readBox(page);
    await page.getByRole('button', { name: 'Talk' }).click();
    await page.waitForTimeout(40);
    const on = await readBox(page);
    check(3, kind, `${width} wide, Talk placeholder change fits the box`, Math.abs(on.heightPx - on.contentPx) <= 0.5 && on.heightPx !== off.heightPx, `off ${off.heightPx} on ${on.heightPx} content ${on.contentPx}`);
    await context.close();
  }
  for (const width of [320, 375]) {
    const { context, page } = await openPage(browser, { width, height: 800 });
    await waitForLoadedHome(page);
    const rest = await readBox(page);
    const dockBefore = await page.evaluate(() => document.querySelector('form').parentElement.getBoundingClientRect().top);
    await getTextBox(page).focus();
    await page.keyboard.type('a');
    await page.waitForTimeout(30);
    const typed = await readBox(page);
    const dockAfter = await page.evaluate(() => document.querySelector('form').parentElement.getBoundingClientRect().top);
    await page.keyboard.insertText(' '.repeat(2) + LONG.slice(0, 120));
    await page.waitForTimeout(30);
    const long = await readBox(page);
    await getTextBox(page).fill('');
    await page.waitForTimeout(30);
    const cleared = await readBox(page);
    check(3, kind, `${width} wide, a wrapped placeholder rests at two lines and the first key moves nothing`, rest.heightPx > 42 && typed.heightPx === rest.heightPx && dockAfter === dockBefore, `rest ${rest.heightPx} typed ${typed.heightPx} dock ${dockBefore} to ${dockAfter}`);
    check(3, kind, `${width} wide, longer text still grows and clearing returns to rest`, long.heightPx > rest.heightPx && cleared.heightPx === rest.heightPx, `long ${long.heightPx} cleared ${cleared.heightPx}`);
    await context.close();
  }
}

async function enterKey(kind, browser) {
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  await waitForLoadedHome(page);
  await getTextBox(page).fill('Why');
  const noticeText = () => page.locator('main [role=status]').last().innerText();
  const press = (keyCode, isComposing) => page.evaluate(([code, composing]) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: code, which: code, isComposing: composing, bubbles: true, cancelable: true });
    document.querySelector('textarea').dispatchEvent(event);
    return { keyCode: event.keyCode, isComposing: event.isComposing };
  }, [keyCode, isComposing]);
  const sent229 = await press(229, false);
  await page.waitForTimeout(40);
  const after229 = await noticeText();
  check(4, kind, 'Enter with keyCode 229 and isComposing false does not send', after229 === '' && sent229.keyCode === 229, `event ${JSON.stringify(sent229)} notice "${after229}"`);
  await press(13, true);
  await page.waitForTimeout(40);
  check(4, kind, 'Enter with isComposing true does not send', (await noticeText()) === '');
  await press(13, false);
  await page.waitForTimeout(40);
  check(4, kind, 'plain Enter still sends', (await noticeText()) !== '', await noticeText());
  await getTextBox(page).fill('Why');
  await getTextBox(page).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(40);
  check(4, kind, 'a real Enter key press sends and adds no line', (await noticeText()) !== '' && (await getTextBox(page).inputValue()) === 'Why');
  await context.close();
}

async function failureState(kind, browser) {
  await setMode({ home: '500' });
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  await page.goto(`${BASE}/`);
  const line = page.locator('main').getByText(/did not load|Something went wrong/);
  await line.waitFor({ timeout: 8000 });
  const liveRole = await line.evaluate((node) => node.closest('[role=alert],[role=status],[aria-live]')?.getAttribute('role') ?? null);
  const text = await line.innerText();
  check(5, kind, 'failure line is in a live region', liveRole === 'alert', `role ${liveRole} text "${text}"`);
  check(5, kind, 'failure line does not repeat Try again', !/try again/i.test(text), text);
  await page.screenshot({ path: `${OUT}/5-failure-${kind}.png` });
  const tryAgain = page.getByRole('button', { name: 'Try again' });
  await tryAgain.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const during = await activeTag(page);
  check(5, kind, 'focus has a place while the retry runs', !during.startsWith('BODY'), during);
  const ringWhileRetrying = await page.evaluate(() => { const a = document.activeElement; return { visible: a.matches(':focus-visible'), outline: getComputedStyle(a).outlineStyle }; });
  check(5, kind, 'that focus shows a ring after a key press', ringWhileRetrying.visible && ringWhileRetrying.outline !== 'none', JSON.stringify(ringWhileRetrying));
  await page.screenshot({ path: `${OUT}/5-retrying-${kind}.png` });
  await line.waitFor({ timeout: 8000 });
  const afterFail = await activeTag(page);
  check(5, kind, 'focus stays put when the retry fails', !afterFail.startsWith('BODY'), afterFail);
  await page.keyboard.press(kind === 'webkit' ? 'Alt+Tab' : 'Tab');
  check(5, kind, 'next Tab after a failed retry reaches Try again', (await activeTag(page)).includes('Try again'), await activeTag(page));
  await setMode({ home: 'real' });
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  await page.waitForTimeout(100);
  const afterSuccess = await activeTag(page);
  check(5, kind, 'focus stays put when the retry succeeds', !afterSuccess.startsWith('BODY'), afterSuccess);
  await page.keyboard.press(kind === 'webkit' ? 'Alt+Tab' : 'Tab');
  check(5, kind, 'next Tab after a good retry reaches Continue', (await activeTag(page)).includes('Continue session'), await activeTag(page));
  await context.close();

  await setMode({ home: '500' });
  const mouse = await openPage(browser, { width: 1280, height: 800 });
  await mouse.page.goto(`${BASE}/`);
  await mouse.page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 8000 });
  await setMode({ home: 'real' });
  await mouse.page.getByRole('button', { name: 'Try again' }).click();
  await mouse.page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  const mouseState = await mouse.page.evaluate(() => ({ tag: document.activeElement.tagName, ring: document.activeElement.matches(':focus-visible') }));
  check(5, kind, 'a mouse press moves focus without a ring', mouseState.tag === 'H1' && !mouseState.ring, JSON.stringify(mouseState));
  await mouse.context.close();
}

async function attachmentChip(kind, browser) {
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const { context, page } = await openPage(browser, { width, height });
    await waitForLoadedHome(page);
    await page.locator('input[type=file]').setInputFiles({ name: 'homework.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x') });
    const remove = page.getByRole('button', { name: 'Remove homework.jpg' });
    const named = await remove.count();
    check(6, kind, `${width} wide, Remove names the file`, named === 1, `count ${named}`);
    const target = page.locator('main form button', { hasText: '×' });
    const hit = await target.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      let hits = 0; let total = 0; const misses = [];
      for (let dx = -11.5; dx <= 11.5; dx += 1) {
        for (let dy = -11.5; dy <= 11.5; dy += 1) {
          total += 1;
          const point = document.elementFromPoint(centerX + dx, centerY + dy);
          if (point === button) hits += 1; else if (misses.length < 3) misses.push([dx, dy, point?.tagName]);
        }
      }
      return { boxWidth: box.width, boxHeight: box.height, hits, total, misses };
    });
    check(6, kind, `${width} wide, a press lands on Remove across 24 by 24 px`, hit.hits === hit.total, JSON.stringify(hit));
    const chipPath = `${OUT}/6-chip-${width}-${kind}.png`;
    await page.locator('main form').screenshot({ path: chipPath });
    await target.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(40);
    const after = await activeTag(page);
    check(6, kind, `${width} wide, focus returns to Photo or PDF after removing`, after.includes('Photo or PDF'), after);
    check(6, kind, `${width} wide, the chip is gone`, (await page.getByText('homework.jpg').count()) === 0);
    await context.close();
  }
}

async function hungApi(kind, browser) {
  await setMode({ home: 'hang' });
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  const started = Date.now();
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 40000 });
  const elapsed = Date.now() - started;
  const line = await page.locator('main [role=alert], main p.text-ink-2').first().innerText();
  check(7, kind, 'a hung API shows the failure line within about 15 seconds', elapsed <= 16500, `${elapsed} ms, "${line}"`);
  await page.screenshot({ path: `${OUT}/7-hung-${kind}.png` });
  await context.close();
  await setMode({ home: 'real' });
}

async function wrongShape(kind, browser) {
  for (const [shape, width] of [['wrong', 1280], ['wrong-picks', 390]]) {
    await setMode({ home: 'real' });
    const { context, page } = await openPage(browser, { width, height: 800 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await waitForLoadedHome(page);
    await getTextBox(page).focus();
    await page.keyboard.insertText('A question I must not lose');
    await setMode({ home: shape });
    await page.waitForTimeout(30500);
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({
      value: document.querySelector('textarea')?.value ?? null,
      h1: document.querySelector('h1')?.textContent,
      h2: [...document.querySelectorAll('main h2')].map((node) => node.textContent),
      alert: document.querySelector('[role=alert]')?.textContent ?? null,
      alertHeading: document.querySelector('[role=alert] h1, [role=alert] h2')?.textContent ?? null,
      sidebar: !!document.querySelector('aside'),
    }));
    check(8, kind, `${shape} on a background refetch at ${width} keeps the typed text`, state.value === 'A question I must not lose', JSON.stringify(state));
    check(8, kind, `${shape}: fallback has a heading and an announcement`, !!state.alert && !!state.alertHeading && !!state.sidebar);
    await page.screenshot({ path: `${OUT}/8-${shape}-${kind}.png` });
    await setMode({ home: 'real' });
    const tryAgain = page.getByRole('button', { name: 'Try again' });
    if (await tryAgain.count()) {
      await tryAgain.focus();
      await page.keyboard.press('Enter');
      await page.locator('main ul li').first().waitFor({ timeout: 5000 });
      const restored = await page.evaluate(() => ({ value: document.querySelector('textarea').value, alert: document.querySelector('[role=alert]')?.textContent ?? null, cards: document.querySelectorAll('main ul li').length, active: document.activeElement.tagName }));
      check(8, kind, `${shape}: Try again brings the cards back and keeps the text`, restored.cards === 6 && restored.alert === null && restored.value === 'A question I must not lose' && restored.active === 'H1', JSON.stringify(restored));
    }
    await context.close();
  }
  // Root boundary: a crash outside the cards, on the real build, forced by a browser API that throws.
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  await page.addInitScript(() => { window.ResizeObserver = class { constructor() { throw new Error('forced crash outside the cards'); } }; });
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'Reload' }).waitFor({ timeout: 5000 });
  const root = await page.evaluate(() => ({ alert: document.querySelector('[role=alert]')?.textContent, heading: document.querySelector('h1')?.textContent, title: document.title }));
  check(8, kind, 'root fallback has a heading and an announcement with concrete wording', root.heading && root.alert?.includes(root.heading) && !/Something went wrong/.test(root.alert), JSON.stringify(root));
  await page.screenshot({ path: `${OUT}/8-root-${kind}.png` });
  await context.close();
}

async function artwork(kind, browser) {
  await setMode({ home: 'artwork', session: 'saturn' });
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  const failed = [];
  page.on('response', (response) => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  await page.waitForTimeout(500);
  const saturn = await page.evaluate(() => {
    const image = document.querySelector('main section:has(.button-solid) img');
    return image && { src: image.getAttribute('src'), alt: image.alt, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, loaded: image.naturalWidth > 0 };
  });
  check(9, kind, 'a session with artwork saturn shows its picture', saturn?.src === '/picks/saturn.jpg' && saturn.loaded && !!saturn.alt, JSON.stringify(saturn));
  const picks = await page.evaluate(() => [...document.querySelectorAll('main ul li')].slice(0, 2).map((li) => ({ imgs: [...li.querySelectorAll('img')].map((image) => image.getAttribute('src')), svgs: li.querySelectorAll('svg').length, title: li.querySelector('.font-medium')?.textContent })));
  check(9, kind, 'cards with unknown names and constructor keep their text and show no broken image', picks.every((pick) => pick.imgs.length === 0 && pick.svgs === 0 && pick.title), JSON.stringify(picks));
  await page.screenshot({ path: `${OUT}/9-saturn-${kind}.png` });
  await setMode({ home: 'artwork', session: 'nope' });
  await context.close();
  const second = await openPage(browser, { width: 1280, height: 800 });
  await second.page.goto(`${BASE}/`);
  await second.page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  const unknown = await second.page.evaluate(() => { const card = document.querySelector('main section:has(.button-solid)'); return { images: card.querySelectorAll('img').length, drawings: card.querySelectorAll('svg').length, columns: getComputedStyle(card).gridTemplateColumns }; });
  check(9, kind, 'a session with an unknown name shows no picture and takes the full width', unknown.images === 0 && unknown.drawings === 0 && unknown.columns.split(' ').length === 1, JSON.stringify(unknown));
  await second.context.close();
  await setMode({ home: 'real', session: '' });
}

async function preload(kind, browser) {
  const html = await (await fetch(`${BASE}/`)).text();
  check(10, kind, 'the shell has no Newsreader preload', !html.includes('newsreader') && !html.includes('greetingFontPreload'));
  check(10, kind, 'the theme script is still there', html.includes("localStorage.getItem('theme')"));
  await setMode({ fontDelayMs: 1500 });
  const { context, page } = await openPage(browser, { width: 1280, height: 800, theme: 'dark' });
  await page.addInitScript(() => {
    window.__seen = { firstTheme: null, h1BeforeFont: null };
    new MutationObserver(() => {
      const h1 = document.querySelector('h1');
      const face = [...document.fonts].find((candidate) => candidate.family.includes('Newsreader'));
      if (window.__seen.firstTheme === null && document.body) window.__seen.firstTheme = document.documentElement.dataset.theme ?? 'none';
      if (h1 && window.__seen.h1BeforeFont === null) window.__seen.h1BeforeFont = face?.status ?? 'no face';
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /Maya/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.fonts].some((face) => face.family.includes('Newsreader') && face.status === 'loaded'), null, { timeout: 8000 });
  const seen = await page.evaluate(() => ({ ...window.__seen, display: [...new Set([...document.fonts].filter((face) => face.family.includes('Newsreader')).map((face) => face.display))] }));
  check(10, kind, 'Newsreader still uses font-display swap and the greeting shows before the font', seen.display.join() === 'swap' && seen.h1BeforeFont !== 'loaded', JSON.stringify(seen));
  check(10, kind, 'a saved dark theme is set before the first element renders', seen.firstTheme === 'dark', seen.firstTheme);
  await context.close();
  await setMode({ fontDelayMs: 0 });
}

async function drawingsAndErrors(kind, browser) {
  const { context, page } = await openPage(browser, { width: 1280, height: 800 });
  const errors = [];
  await page.addInitScript(() => { window.__errors = []; window.addEventListener('error', (event) => window.__errors.push(event.message)); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await waitForLoadedHome(page);
  const svgs = await page.evaluate(() => [...document.querySelectorAll('main svg[role=img]')].map((svg) => svg.outerHTML.replace(/class="[^"]*"/g, '')));
  writeFileSync(`${OUT}/11-svgs-${kind}.json`, JSON.stringify(svgs, null, 1));
  await getTextBox(page).fill(LONG);
  for (const width of [1100, 800, 500, 390, 700, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(80);
  }
  const during = await readBox(page);
  const windowErrors = await page.evaluate(() => window.__errors);
  check('11-ro', kind, 'resizing with long text fits the box and logs no error', Math.abs(during.heightPx - Math.min(during.contentPx, 140)) <= 1 && errors.length === 0 && windowErrors.length === 0, `height ${during.heightPx} content ${during.contentPx} console ${JSON.stringify(errors)} window ${JSON.stringify(windowErrors)}`);
  await context.close();
}

const SECTIONS = {
  1: rotateWithMenuOpen, 2: focusBehindDock, scroll: scrollStability, 3: staleHeights, 4: enterKey, 5: failureState, 6: attachmentChip, 7: hungApi, 8: wrongShape, 9: artwork, 10: preload, 11: drawingsAndErrors,
};
await setMode({ home: 'real', fontDelayMs: 0, session: '' });
for (const kind of (process.env.KINDS ?? 'chromium,webkit').split(',')) {
  const browser = await launch(kind);
  for (const [name, run] of Object.entries(SECTIONS)) {
    if (only && !only.includes(name)) continue;
    try {
      await run(kind, browser);
    } catch (error) {
      check(name, kind, 'section threw', false, String(error.message).split('\n')[0]);
      await setMode({ home: 'real', fontDelayMs: 0, session: '' });
    }
  }
  await browser.close();
}
writeFileSync(`${OUT}/behavior-${only?.join('-') ?? 'all'}.json`, JSON.stringify(results, null, 1));
const failed = results.filter((row) => !row.ok);
console.log(`${results.length - failed.length} of ${results.length} checks passed`);
