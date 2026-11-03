import { createRequire } from 'node:module';
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHmac, createPrivateKey, sign } from 'node:crypto';
const require = createRequire('/Users/abel/startup/astra-worktrees/m2-9/package.json');
const { chromium } = require('playwright');
export { chromium };
export const OUT = '/path/to/m2-9/out';
export const SHOTS = '/path/to/m2-9/shots';
export const WEB = 'http://127.0.0.1:6040';
export const OTHER = 'http://127.0.0.1:6044';
export const AUTH = 'http://127.0.0.1:6042';
export const CONTROL = 'http://127.0.0.1:6045';
export const INBOX = 'http://127.0.0.1:54424';
export const PASSWORD = 'm2-9-made-up-password';
export const MAYA = { email: 'maya@astra.test', id: '00000000-0000-4000-8000-0000000000a1' };
export const NEWBIE = { email: 'new-student@astra.test', id: '00000000-0000-4000-8000-0000000000a2' };
const { key, secret } = JSON.parse(readFileSync(new URL('./keys.json', import.meta.url), 'utf8'));
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
export function serviceToken() {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const claims = b64({ role: 'service_role', iss: 'lab', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${claims}.${createHmac('sha256', secret).update(`${head}.${claims}`).digest('base64url')}`;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const control = (path, lane, init) => fetch(`${CONTROL}${path}?lane=${encodeURIComponent(lane)}`, init);
export const setLane = async (lane, change) => (await control('/set', lane, { method: 'POST', body: JSON.stringify(change) })).json();
export const resetLane = (lane) => control('/reset', lane);
export const clearEvents = (lane) => control('/clear', lane);
export const getEvents = async (lane) => (await control('/events', lane)).json();
export const realEvents = (events) => events.filter((e) => e.method !== 'OPTIONS' && e.op !== 'jwks');
export function summarize(events, t0 = 0) {
  return realEvents(events).filter((e) => e.kind !== 'doc' || true).map((e) => `${((e.at - t0) / 1000).toFixed(1)}s ${e.kind} ${e.method} ${e.op}${e.query ?? ''} -> ${e.status ?? (e.closedEarly ? 'aborted' : 'pending')}`);
}
export const countOf = (events, kind, prefix) => realEvents(events).filter((e) => e.kind === kind && e.op.startsWith(prefix)).length;
export async function ensureUser({ email, id, password = PASSWORD }) {
  const r = await fetch(`${AUTH}/admin/users`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ email, ...(id ? { id } : {}), password, email_confirm: true }) });
  const answer = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 422) throw new Error(`ensureUser ${email} ${r.status} ${JSON.stringify(answer)}`);
  return answer;
}
export async function passwordSession({ email, password = PASSWORD }) {
  const r = await fetch(`${AUTH}/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`password ${email} ${r.status} ${await r.text()}`);
  return r.json();
}
export async function refreshAtAuth(refreshToken) {
  const r = await fetch(`${AUTH}/token?grant_type=refresh_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }) });
  return { status: r.status, code: (await r.json().catch(() => ({}))).error_code };
}
// A real signature with an exp in the past, which is what the API sees from a token that expired while the device clock ran behind.
export function expiredCopy(accessToken, secondsAgo = 120) {
  const [head, claims] = accessToken.split('.');
  const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
  const exp = Math.floor(Date.now() / 1000) - secondsAgo;
  const signed = `${head}.${b64({ ...payload, exp, iat: exp - 3600 })}`;
  const privateKey = createPrivateKey({ key, format: 'jwk' });
  return `${signed}.${sign('sha256', Buffer.from(signed), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
// behind: the browser trusts the token and the API refuses it. expired: the browser itself sees it as expired.
export function asKind(session, kind) {
  const now = Math.floor(Date.now() / 1000);
  if (kind === 'fresh') return session;
  if (kind === 'behind') return { ...session, access_token: expiredCopy(session.access_token), expires_at: now + 2 * 3600 };
  if (kind === 'expired') return { ...session, access_token: expiredCopy(session.access_token), expires_at: now - 120 };
  throw new Error(kind);
}
export async function launch(extra = {}) {
  return chromium.launch({ channel: 'chromium', headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--use-mock-keychain'], ...extra });
}
export const WATCH = () => {
  const describe = () => {
    const root = document.documentElement;
    const h1 = document.querySelector('h1')?.innerText?.slice(0, 50) ?? null;
    const mark = !!document.querySelector('[aria-busy=true] .product-mark');
    const buttons = [...document.querySelectorAll('button')].map((b) => b.innerText).filter((t) => /Try again|Sign out|Continue with email|Yes, continue/.test(t));
    let session = null;
    try { session = localStorage.getItem('astra-session') !== null; } catch { session = 'blocked'; }
    return { vis: root.style.visibility || 'shown', mark, h1, status: document.querySelector('[role=status]')?.innerText?.slice(0, 40) || null, alert: document.querySelector('[role=alert]')?.innerText?.slice(0, 70) || null, buttons, session, path: location.pathname };
  };
  let last = '';
  const tick = () => { const now = JSON.stringify(describe()); if (now !== last) { last = now; console.log(`LAB ${Date.now()} ${now}`); } };
  setInterval(tick, 80);
  window.addEventListener('pagehide', (e) => console.log(`LABEV ${Date.now()} pagehide persisted=${e.persisted} vis=${document.documentElement.style.visibility}`));
  window.addEventListener('pageshow', (e) => console.log(`LABEV ${Date.now()} pageshow persisted=${e.persisted} vis=${document.documentElement.style.visibility} text=${(document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 80)}`));
};
export function track(page, timeline, onError = []) {
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('LAB ')) { const [, at, ...rest] = t.split(' '); timeline.push({ at: Number(at), ...JSON.parse(rest.join(' ')) }); } else if (t.startsWith('LABEV ')) { const [, at, ...rest] = t.split(' '); timeline.push({ at: Number(at), event: rest.join(' ') }); } else if (m.type() === 'error') onError.push(t.slice(0, 180)); });
  page.on('pageerror', (e) => onError.push(`pageerror ${String(e).slice(0, 180)}`));
}
export const showTimeline = (timeline, t0) => timeline.map(({ at, ...rest }) => `${((at - t0) / 1000).toFixed(1)}s ${JSON.stringify(rest)}`);
export function barewordmarkMs(timeline, endAt = Date.now()) {
  let total = 0; let longest = 0; let since = null;
  for (const item of timeline) {
    if (item.event) continue;
    if (item.mark && since === null) since = item.at;
    if (!item.mark && since !== null) { total += item.at - since; longest = Math.max(longest, item.at - since); since = null; }
  }
  if (since !== null) { total += endAt - since; longest = Math.max(longest, endAt - since); }
  return { total, longest, stillOn: since !== null };
}
export async function readScreen(page) {
  return page.evaluate(() => { let session = null; try { session = localStorage.getItem('astra-session') !== null; } catch { session = 'blocked'; } return { path: location.pathname, vis: document.documentElement.style.visibility || 'shown', h1: document.querySelector('h1')?.innerText ?? null, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200), active: document.activeElement ? `${document.activeElement.tagName}:${(document.activeElement.innerText || document.activeElement.getAttribute('aria-label') || '').slice(0, 40)}` : null, session }; }).catch((e) => ({ error: String(e).slice(0, 120) }));
}
export const refocus = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))).catch(() => {});
export async function reconnect(context) { await context.setOffline(true); await sleep(300); await context.setOffline(false); }
export async function newLane(browser, lane, { session, viewport = { width: 1280, height: 800 }, extra = {} } = {}) {
  await resetLane(lane);
  const storageState = session ? { cookies: [], origins: [{ origin: WEB, localStorage: [{ name: 'astra-session', value: JSON.stringify(session) }] }] } : undefined;
  const context = await browser.newContext({ viewport, extraHTTPHeaders: { 'x-lab': lane }, storageState, ...extra });
  await context.addInitScript(WATCH);
  return context;
}
export function logger(name) {
  mkdirSync(OUT, { recursive: true });
  return (...parts) => { const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '); console.log(line); appendFileSync(`${OUT}/${name}.log`, `${line}\n`); };
}
export const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
export async function emailLink(email, sinceMs, timeoutMs = 15000) {
  const giveUp = Date.now() + timeoutMs;
  while (Date.now() < giveUp) {
    const search = await fetch(`${INBOX}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`).then((r) => r.json());
    const fresh = (search.messages ?? []).filter((m) => new Date(m.Created).getTime() >= sinceMs - 2000);
    if (fresh.length) {
      const message = await fetch(`${INBOX}/api/v1/message/${fresh[0].ID}`).then((r) => r.json());
      const link = /(https?:\/\/[^\s"<>)]+\/verify\?[^\s"<>)]+)/.exec(message.Text ?? message.HTML ?? '')?.[1];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await sleep(200);
  }
  throw new Error(`no link for ${email}`);
}

// A student of one's own for each lane, because sign-out is global and would end every other lane's session.
export async function activeStudent(tag, birthDate = '2004-03-14') {
  const who = { email: `m2-9-${tag.toLowerCase()}-${Date.now()}@astra.test` };
  await ensureUser(who);
  const session = await passwordSession(who);
  const answer = await fetch('http://127.0.0.1:3040/me/birth-date', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ birthDate }) });
  if (!answer.ok) throw new Error(`activeStudent ${answer.status}`);
  return { who, session };
}
