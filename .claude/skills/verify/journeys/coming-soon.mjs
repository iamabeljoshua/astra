import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const deadlineMs = 180_000;

const ATTACH = 'Photo or PDF';
const NOTE = 'Photos and PDFs are coming soon.';
const FILE_NAME = 'worksheet-zq7.pdf';
const FILE_BYTES = 'file-bytes-zq7';
const NOTE_LASTS_MS = 5_000;
const TUTOR_ARRIVES_WITHIN_MS = 25_000;
const NO_ROOM_NOTE = 'Your tutor could not connect just now.';
const NETWORK_LOG_FOLDER = process.env.COMING_SOON_LOG_FOLDER ?? '.verify/evidence';
const hasRoomService = Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

function writeFileToAttach() {
  const path = join(mkdtempSync(join(tmpdir(), 'coming-soon-')), FILE_NAME);
  writeFileSync(path, FILE_BYTES);
  return path;
}

function logTheNetwork(page) {
  const entries = [];
  page.on('request', (request) => {
    const body = request.postData() ?? '';
    entries.push({ kind: 'http', method: request.method(), url: request.url(), contentType: request.headers()['content-type'] ?? null, body });
  });
  page.on('websocket', (socket) => {
    entries.push({ kind: 'websocket-open', url: socket.url() });
    socket.on('framesent', ({ payload }) => entries.push({ kind: 'websocket-sent', url: socket.url(), body: Buffer.from(payload).toString('latin1') }));
  });
  return entries;
}

// A tutor's data channel is outside what Playwright can log, so this records each send as the page makes it.
function logDataChannels(page) {
  return page.addInitScript(() => {
    window.dataChannelSends = [];
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function logThenSend(data) {
      window.dataChannelSends.push(typeof data === 'string' ? data : new TextDecoder('latin1').decode(data));
      return send.call(this, data);
    };
  });
}

function countNonGets(entries) {
  return entries.filter(({ kind, method }) => kind === 'http' && method !== 'GET').length;
}

const noteOn = (page) => page.getByRole('status').filter({ hasText: NOTE });

async function assertNoteShowsThenCloses(page) {
  await noteOn(page).waitFor();
  await page.keyboard.press('Escape');
  await noteOn(page).waitFor({ state: 'hidden', timeout: 1_000 });
}

// CDP's drag input reaches the page as a real drop, so the browser's own handling of a file runs too.
async function dropRealFile({ page, cdp, target, filePath }) {
  const box = await target.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const data = { items: [], files: [filePath], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, ...point, data });
  await page.waitForTimeout(100);
}

function pasteOn(target, types) {
  return target.evaluate(
    (element, { fileName, fileBytes, pastedTypes }) => {
      const clipboardData = new DataTransfer();
      if (pastedTypes.includes('text/plain')) clipboardData.setData('text/plain', fileName);
      if (pastedTypes.includes('Files')) clipboardData.items.add(new File([fileBytes], fileName, { type: 'application/pdf' }));
      const paste = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true, composed: true });
      element.dispatchEvent(paste);
      return { wasRefused: paste.defaultPrevented, types: [...clipboardData.types] };
    },
    { fileName: FILE_NAME, fileBytes: FILE_BYTES, pastedTypes: types },
  );
}

async function tryEveryWayIn({ page, cdp, control, field, fieldValue, filePath, pickersOpened }) {
  const nonGetsBefore = countNonGets(page.networkEntries);

  await control.click();
  await assertNoteShowsThenCloses(page);
  assert.equal(pickersOpened.count, 0, 'no file picker opens');

  await control.click();
  await noteOn(page).waitFor();
  await noteOn(page).waitFor({ state: 'hidden', timeout: NOTE_LASTS_MS + 1_000 });

  const urlBefore = page.url();
  await dropRealFile({ page, cdp, target: field, filePath });
  await assertNoteShowsThenCloses(page);
  assert.equal(page.url(), urlBefore, 'a dropped file does not open in the browser');
  assert.equal(await fieldValue(), '', 'a dropped file leaves no name in the box');

  await field.click();
  const filePaste = await pasteOn(field, ['text/plain', 'Files']);
  assert.ok(filePaste.types.includes('Files'), 'the paste really carries a file');
  assert.equal(filePaste.wasRefused, true, 'the browser does not write the name of a pasted file');
  await assertNoteShowsThenCloses(page);
  assert.equal(await fieldValue(), '', 'a pasted file leaves no name in the box');

  const textPaste = await pasteOn(field, ['text/plain']);
  assert.equal(textPaste.wasRefused, false, 'pasted text still works');
  assert.equal(await noteOn(page).count(), 0, 'pasted text shows no note');

  assert.equal(countNonGets(page.networkEntries), nonGetsBefore, 'trying to add a file sends nothing');
}

async function assertNoteSitsAboveControl({ page, control, viewportName }) {
  const note = await noteOn(page).locator('span').boundingBox();
  const button = await control.boundingBox();
  const { width } = page.viewportSize();
  assert.ok(note.x >= 0 && note.x + note.width <= width, `the note stays on the ${viewportName} screen: ${JSON.stringify(note)}`);
  const gapPx = button.y - (note.y + note.height);
  assert.ok(gapPx >= 0 && gapPx <= 12, `the note sits just above the control, ${gapPx}px away`);
}

async function pictureInBothThemes({ page, capture, control, label, viewportName, isThemeInMenu }) {
  const chooseTheme = async (name) => {
    if (isThemeInMenu) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    if (isThemeInMenu) await page.getByRole('button', { name: 'Menu' }).click();
  };
  for (const name of ['Light', 'Dark']) {
    await chooseTheme(name);
    await control.click();
    await noteOn(page).waitFor();
    await assertNoteSitsAboveControl({ page, control, viewportName });
    await capture(`${label}-${name.toLowerCase()}`);
    await page.keyboard.press('Escape');
  }
  await chooseTheme('Light');
}

function assertNothingLeft(entries, dataChannelSends) {
  const everything = [...entries.map((entry) => `${entry.url ?? ''} ${entry.body ?? ''}`), ...dataChannelSends];
  for (const secret of [FILE_NAME, FILE_BYTES]) {
    assert.equal(everything.filter((sent) => sent.includes(secret)).length, 0, `no request carries ${secret}`);
  }
  assert.equal(entries.filter(({ contentType }) => contentType?.includes('multipart')).length, 0, 'no request is a file upload');
}

function writeNetworkLog({ viewportName, entries, dataChannelSends, controls }) {
  mkdirSync(NETWORK_LOG_FOLDER, { recursive: true });
  const lines = [...entries, ...dataChannelSends.map((body) => ({ kind: 'data-channel-sent', body }))].map((entry) => JSON.stringify(entry));
  writeFileSync(join(NETWORK_LOG_FOLDER, `coming-soon-${viewportName}-network.jsonl`), `${lines.join('\n')}\n`);
  console.log(`network ${viewportName}: ${entries.length} entries, ${dataChannelSends.length} data channel sends, controls seen: ${controls.join(', ')}`);
}

async function driveHome({ page, cdp, capture, viewportName, filePath, pickersOpened }) {
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  const field = page.getByRole('textbox', { name: 'What do you want to learn next' });
  const control = page.getByRole('button', { name: ATTACH });
  await tryEveryWayIn({ page, cdp, control, field, fieldValue: () => field.inputValue(), filePath, pickersOpened });
  await pictureInBothThemes({ page, capture, control, label: 'home', viewportName, isThemeInMenu: viewportName === 'phone' });
}

async function startSessionWithControlWords({ page, viewportName }) {
  const question = `Why do planes fly, typed on ${viewportName} control-words-home`;
  await page.getByRole('textbox', { name: 'What do you want to learn next' }).fill(question);
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('heading', { level: 1, name: question }).waitFor({ state: 'attached' });
}

async function driveSessionWithoutARoom({ page, cdp, capture, viewportName, filePath, pickersOpened }) {
  await page.getByText(NO_ROOM_NOTE).waitFor();
  const field = page.getByRole('textbox', { name: 'Your reply' });
  const control = page.getByRole('button', { name: ATTACH });
  await tryEveryWayIn({ page, cdp, control, field, fieldValue: () => field.inputValue(), filePath, pickersOpened });
  await pictureInBothThemes({ page, capture, control, label: 'session', viewportName, isThemeInMenu: false });
}

async function driveTheBoard({ page, cdp, capture, viewportName, filePath, pickersOpened }) {
  await pasteOn(page.locator('body'), ['Files']);
  await noteOn(page).waitFor();
  await capture('connecting');
  await page.keyboard.press('Escape');
  const field = page.getByRole('textbox', { name: 'Write on the board' });
  await field.waitFor({ state: 'attached' });
  await page.getByTestId('connecting-saturn').waitFor({ state: 'detached', timeout: TUTOR_ARRIVES_WITHIN_MS });
  const control = page.getByTestId('board-tools').getByRole('button', { name: ATTACH });
  await tryEveryWayIn({ page, cdp, control, field, fieldValue: () => field.inputValue(), filePath, pickersOpened });
  await field.fill('control-words-board');
  await field.press('Enter');
  await pictureInBothThemes({ page, capture, control, label: 'board', viewportName, isThemeInMenu: false });
  const tools = await page.getByTestId('board-tools').evaluate((row) => ({ scrollWidth: row.scrollWidth, clientWidth: row.clientWidth }));
  assert.ok(tools.scrollWidth <= tools.clientWidth, `the board tools fit on ${viewportName}: ${JSON.stringify(tools)}`);
}

export default async function comingSoon({ page, capture, viewportName, signIn }) {
  const filePath = writeFileToAttach();
  const cdp = await page.context().newCDPSession(page);
  const pickersOpened = { count: 0 };
  page.on('filechooser', () => {
    pickersOpened.count += 1;
  });
  page.networkEntries = logTheNetwork(page);
  await logDataChannels(page);

  await signIn();
  await driveHome({ page, cdp, capture, viewportName, filePath, pickersOpened });
  await startSessionWithControlWords({ page, viewportName });
  const drive = hasRoomService ? driveTheBoard : driveSessionWithoutARoom;
  await drive({ page, cdp, capture, viewportName, filePath, pickersOpened });

  const dataChannelSends = await page.evaluate(() => window.dataChannelSends);
  assertNothingLeft(page.networkEntries, dataChannelSends);
  const everything = JSON.stringify([page.networkEntries, dataChannelSends]);
  const controls = ['control-words-home', ...(hasRoomService ? ['control-words-board'] : [])];
  for (const control of controls) assert.ok(everything.includes(control), `the log sees what a student really sends: ${control}`);
  writeNetworkLog({ viewportName, entries: page.networkEntries, dataChannelSends, controls });
}
