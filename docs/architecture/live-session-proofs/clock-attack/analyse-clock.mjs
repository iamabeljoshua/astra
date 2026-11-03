// For one clock-run output file: every method's error over all words, then only for the first word after each stall, and when each report landed.
import { readFileSync } from 'node:fs';
const BETWEEN = 1.4;
const file = process.argv[2];
const methodsWanted = process.argv[3]?.split(',');
const { summary, records } = JSON.parse(readFileSync(file, 'utf8'));
const segments = records.data.filter((m) => m.type === 'segment');
const onsets = records.worklet.filter((e) => e.kind === 'onset');
const ends = records.worklet.filter((e) => e.kind === 'end');
const turnOnsets = onsets.filter((o) => { const le = ends.filter((e) => e.contextSeconds < o.contextSeconds).at(-1); return !le || o.contextSeconds - le.contextSeconds >= BETWEEN; });
const firstOnsets = segments.map((s) => turnOnsets.filter((o) => o.contextSeconds <= s.contextSeconds + BETWEEN).at(-1));
const SHORTEST_WORD_SOUND_SECONDS = 0.15;
function getSoundedSecondsBetween(first, second) {
  const silences = ends.filter((end) => end.contextSeconds >= first.contextSeconds && end.contextSeconds < second.contextSeconds).map((end) => (onsets.find((onset) => onset.contextSeconds > end.contextSeconds)?.contextSeconds ?? second.contextSeconds) - end.contextSeconds);
  return second.contextSeconds - first.contextSeconds - silences.reduce((sum, seconds) => sum + seconds, 0);
}
const pct = (list, f) => { const s = [...list].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(f * s.length))]) : null; };
const stats = (v) => ({ n: v.length, p50: pct(v, 0.5), p95abs: pct(v.map(Math.abs), 0.95), maxAbs: v.length ? Math.round(Math.max(...v.map(Math.abs))) : null, min: v.length ? Math.round(Math.min(...v)) : null, max: v.length ? Math.round(Math.max(...v)) : null, early40: v.filter((x) => x < -40).length, late100: v.filter((x) => x > 100).length });
const all = {}, afterStall = {}, unfired = {}, heardByMethod = {};
const reports = [];
segments.forEach((segment, index) => {
  const onset = firstOnsets[index];
  if (!onset) return;
  const limit = firstOnsets[index + 1]?.contextSeconds ?? Infinity;
  const rawBursts = records.worklet.filter((e) => e.kind === 'burst' && e.contextSeconds >= onset.contextSeconds - 0.02 && e.contextSeconds < limit - 0.02);
  // A stall inside a word's loud burst splits it in two. Words are at least 180 ms of sound apart, so a burst closer than that to the last word is the tail of that word.
  const bursts = [];
  for (const burst of rawBursts) {
    const last = bursts.at(-1);
    if (!last || getSoundedSecondsBetween(last, burst) >= SHORTEST_WORD_SOUND_SECONDS) bursts.push(burst);
  }
  // Bursts in order are the words in order when none were lost, which needs no assumption about how long a stall really was.
  const useOrder = bursts.length === segment.wordStartsMs.length;
  const stallWords = new Set((segment.stalls ?? []).map((s) => segment.wordStartsMs.findIndex((w) => w >= s.atMs)).filter((i) => i >= 0));
  const heard = [];
  segment.wordStartsMs.forEach((startMs, wordIndex) => {
    let burst;
    if (useOrder) burst = bursts[wordIndex];
    else {
      const stallMs = (segment.stalls ?? []).filter((s) => s.atMs <= startMs).reduce((sum, s) => sum + s.ms, 0);
      const expected = onset.contextSeconds + (startMs + stallMs) / 1000;
      const near = bursts.reduce((b, x) => (!b || Math.abs(x.contextSeconds - expected) < Math.abs(b.contextSeconds - expected) ? x : b), null);
      if (near && Math.abs(near.contextSeconds - expected) * 1000 <= 150) burst = near;
    }
    if (!burst) return;
    heard.push(wordIndex);
    const firings = records.fired.filter((f) => f.segmentId === segment.segmentId && f.wordIndex === wordIndex);
    for (const f of firings) {
      const err = (f.contextSeconds - burst.contextSeconds) * 1000;
      (all[f.method] ??= []).push(err);
      if (stallWords.has(wordIndex)) (afterStall[f.method] ??= []).push(err);
    }
  });
  for (const name of new Set(records.fired.map((f) => f.method))) {
    const fired = new Set(records.fired.filter((f) => f.method === name && f.segmentId === segment.segmentId).map((f) => f.wordIndex));
    unfired[name] = (unfired[name] ?? 0) + heard.filter((w) => !fired.has(w)).length;
    heardByMethod[name] = (heardByMethod[name] ?? 0) + heard.length;
  }
  const gapMessages = records.data.filter((m) => m.type === 'audioGap' && m.segmentId === segment.segmentId);
  const firstBy = new Map();
  for (const m of gapMessages) {
    const key = `${m.atMs}/${m.ms === undefined ? 'open' : 'close'}`;
    if (!firstBy.has(key)) firstBy.set(key, m);
  }
  for (const m of firstBy.values()) {
    const countAtArrivalMs = (m.contextSeconds - onset.contextSeconds) * 1000;
    reports.push({ segmentId: segment.segmentId, atMs: m.atMs, ms: m.ms, kind: m.ms === undefined ? 'open' : 'close', countAtArrivalMs: Math.round(countAtArrivalMs), aheadOfCountMs: Math.round(m.atMs - countAtArrivalMs), via: m.via });
  }
});
const picked = methodsWanted ?? Object.keys(all);
const out = { scenario: summary.scenario, load: summary.machineLoadAtEnd, wordsSent: summary.wordsSent, wordsHeard: summary.wordsHeard };
out.methods = Object.fromEntries(picked.filter((m) => all[m]).map((m) => [m, { all: stats(all[m]), firstWordAfterStall: afterStall[m] ? stats(afterStall[m]) : null, unfired: unfired[m] ?? 0, heard: heardByMethod[m] ?? 0 }]));
const opens = reports.filter((r) => r.kind === 'open');
const closes = reports.filter((r) => r.kind === 'close');
const openKeys = new Set(opens.map((o) => `${o.segmentId}/${o.atMs}`));
const closeKeys = new Set(closes.map((c) => `${c.segmentId}/${c.atMs}`));
out.reports = {
  opens: opens.length, closes: closes.length,
  opensWithNoClose: opens.filter((o) => !closeKeys.has(`${o.segmentId}/${o.atMs}`)).map((o) => ({ segmentId: o.segmentId, atMs: o.atMs })),
  closesWithNoOpen: closes.filter((c) => !openKeys.has(`${c.segmentId}/${c.atMs}`)).length,
  openAheadOfCountMs: stats(opens.map((o) => o.aheadOfCountMs)),
  opensBehindCount: opens.filter((o) => o.aheadOfCountMs < 0).length,
  closeMs: stats(closes.map((c) => c.ms)),
};
console.log(JSON.stringify(out, null, 1));
