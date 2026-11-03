// How long a restored page shows the last student's page before its hidden style reaches the screen, by compositor timestamps.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, newLane, setLane, passwordSession, MAYA, WEB, OTHER, track, sleep, logger, ensureUser } from './lib.mjs';
const PAGES = {
  home: { ready: (p) => p.getByRole('heading', { name: /Welcome back/ }).waitFor({ timeout: 15000 }) },
  confirm: { fresh: true, ready: async (p) => { await p.getByRole('heading', { name: 'When were you born?' }).waitFor({ timeout: 15000 }); await p.getByLabel('Day').fill('14'); await p.getByLabel('Month').fill('03'); await p.getByLabel('Year').fill('2012'); await p.getByRole('button', { name: /Continue/ }).click(); await p.getByRole('heading', { name: 'Is this right?' }).waitFor(); } },
};
const [, , countText = '6', headedText = 'headless', settleText = '1500', initText = '', throttleText = '1', pageName = 'home'] = process.argv;
const log = logger(`bfflash-${headedText}${initText ? `-${initText}` : ''}-x${throttleText}-${pageName}`);
const FRAMES = `/path/to/m2-9/shots/bfflash-${headedText}${initText ? `-${initText}` : ''}-x${throttleText}-${pageName}`;
mkdirSync(FRAMES, { recursive: true });
await ensureUser(MAYA);
const browser = await launch(headedText === 'headed' ? { headless: false } : {});
const helperContext = await browser.newContext();
const helper = await helperContext.newPage();
await helper.goto(OTHER);
async function frameInk(data) {
  return helper.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
    const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0, 160, 100);
    const { data: px } = c.getImageData(0, 0, 160, 100); const counts = new Map();
    for (let i = 0; i < px.length; i += 4) { const key = `${px[i] >> 3},${px[i + 1] >> 3},${px[i + 2] >> 3}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
    return +(1 - [...counts.values()].sort((a, b) => b - a)[0] / (160 * 100)).toFixed(3);
  }, data);
}
async function closeness(data, referenceBase64) {
  return helper.evaluate(async ([a, b]) => {
    const pixels = async (base64) => { const image = new Image(); image.src = `data:image/jpeg;base64,${base64}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100; const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0, 160, 100); return c.getImageData(0, 0, 160, 100).data; };
    const [one, two] = [await pixels(a), await pixels(b)]; let same = 0;
    for (let i = 0; i < one.length; i += 4) if (Math.abs(one[i] - two[i]) + Math.abs(one[i + 1] - two[i + 1]) + Math.abs(one[i + 2] - two[i + 2]) < 24) same += 1;
    return +(same / (160 * 100)).toFixed(3);
  }, [data, referenceBase64]);
}
const totals = { runs: 0, kept: 0, freshShow: 0, studentFrames: 0 };
for (let run = 0; run < Number(countText); run += 1) {
  const lane = `flash-${headedText}-${initText}-${throttleText}-${pageName}-${run}`;
  const spec = PAGES[pageName];
  const who = spec.fresh ? { email: `m2-9-flash-${Date.now()}-${run}@astra.test` } : MAYA;
  if (spec.fresh) await ensureUser(who);
  const context = await newLane(browser, lane, { session: await passwordSession(who) });
  if (initText === 'nopost') await context.addInitScript(() => { const post = BroadcastChannel.prototype.postMessage; BroadcastChannel.prototype.postMessage = function (message) { if (message?.event !== 'ASTRA_DROP_KEPT_PAGE') post.call(this, message); }; });
  const A = await context.newPage(); const timeline = []; track(A, timeline);
  await A.goto(`${OTHER}/`);
  await A.goto(`${WEB}/`);
  await spec.ready(A);
  await sleep(Number(settleText));
  const reference = (await A.screenshot({ type: 'jpeg', quality: 60 })).toString('base64');
  const B = await context.newPage();
  await B.goto(`${WEB}/`);
  await B.getByRole("button", { name: "Sign out" }).first().waitFor({ timeout: 15000 });
  await A.goto(`${OTHER}/`);
  await sleep(400);
  if (initText === 'broadcast') await B.evaluate(() => new BroadcastChannel('astra-session').postMessage({ event: 'LAB' }));

  await B.getByRole('button', { name: 'Sign out' }).first().click();
  await B.getByRole('button', { name: 'Continue with email' }).waitFor({ timeout: 15000 });
  await B.close();
  await setLane(lane, { docDelayMs: 1500 });
  await A.bringToFront();
  const cdp = await context.newCDPSession(A);
  const frames = [];
  cdp.on('Page.screencastFrame', async (event) => { frames.push({ wall: Date.now(), ts: event.metadata.timestamp, data: event.data }); await cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttleText) });
  await sleep(300);
  const preFrames = frames.length;
  timeline.length = 0;
  const t0 = Date.now();
  await A.evaluate(() => history.back()).catch(() => {});
  await sleep(1400);
  await cdp.send('Page.stopScreencast').catch(() => {});
  const rows = [];
  const restored = timeline.some((item) => item.event?.startsWith('pageshow persisted=true'));
  for (const [index, frame] of frames.entries()) {
    const ink = await frameInk(frame.data);
    rows.push({ index, tMs: Math.round(frame.wall - t0), tsMs: frame.ts ? Math.round(frame.ts * 1000) : null, ink, pre: index < preFrames });
    if (index < 8) writeFileSync(`${FRAMES}/run${run}-${index}.jpg`, Buffer.from(frame.data, 'base64'));
  }
  for (const [index, frame] of frames.entries()) rows[index].same = await closeness(frame.data, reference);
  const after = rows.filter((row) => !row.pre);
  const studentFrames = after.filter((row) => row.same >= 0.97).map((row) => `${row.index}@${row.tMs}ms same=${row.same}`);
  const shown = timeline.filter((item) => item.event?.startsWith('pageshow'));
  totals.runs += 1; if (restored) totals.kept += 1; if (shown.some((item) => item.event.startsWith('pageshow persisted=false'))) totals.freshShow += 1; if (studentFrames.length) totals.studentFrames += 1;
  log({ run, restored, pageshow: shown.map((item) => item.event.slice(0, 90)), studentFrames, mostAlike: Math.max(...after.map((row) => row.same)), frames: after.length });
  await context.close();
}
await browser.close();
log(`TOTAL ${headedText} x${throttleText} ${pageName} ${initText || 'built'}`, totals);
