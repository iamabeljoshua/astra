import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlayoutTracker, createWordClock, LONGEST_HOLD_MS } from './clock-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAME_MS = 20;
const FRAMES = 500;
const TOLERANCE_MS = 20;

function getReportedMs(getFrameAtMs) {
  const tracker = createPlayoutTracker({ onRanDry: () => {} });
  let reportedMs = 0;
  for (let frame = 0; frame < FRAMES; frame++) reportedMs += tracker.onFrame(getFrameAtMs(frame), FRAME_MS)?.ms ?? 0;
  tracker.close();
  return reportedMs;
}

function getFrameInTheDryTimersTick() {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const tracker = createPlayoutTracker({
      onRanDry: ({ atMs }) => {
        const closing = tracker.onFrame(startMs + FRAME_MS + 19, FRAME_MS);
        tracker.close();
        resolve({ openedAtMs: atMs, closing });
      },
    });
    tracker.onFrame(startMs, FRAME_MS);
  });
}

function getPositions(gaps, times) {
  const clock = createWordClock();
  clock.onFirstSound(0);
  gaps.forEach((gap) => clock.addGap(gap));
  return times.map((atMs) => clock.getPositionMs(atMs));
}

const slowVoiceMs = getReportedMs((frame) => frame * 22);
const tinyStallsMs = getReportedMs((frame) => frame * FRAME_MS + Math.floor(frame / 10) * 15);
const onTimeMs = getReportedMs((frame) => frame * FRAME_MS);
const jitteryMs = getReportedMs((frame) => frame * FRAME_MS + [3, -3, 2, -2][frame % 4]);
const BURST_FRAMES = 50;
const AFTER_BURST_STALL_MS = 60;
const burstThenStallMs = getReportedMs((frame) => (frame < BURST_FRAMES ? 0 : BURST_FRAMES * FRAME_MS + AFTER_BURST_STALL_MS + (frame - BURST_FRAMES) * FRAME_MS));
const dryTick = await getFrameInTheDryTimersTick();
const heldAt = 2000;
const afterBound = heldAt + LONGEST_HOLD_MS + 1000;
const [held, heldLast, released, later] = getPositions([{ atMs: heldAt }], [heldAt + 100, heldAt + LONGEST_HOLD_MS - 1, heldAt + LONGEST_HOLD_MS, afterBound]);
const [lateClose] = getPositions([{ atMs: heldAt }, { atMs: heldAt, ms: 300 }], [afterBound]);
const [longStall] = getPositions([{ atMs: heldAt, ms: LONGEST_HOLD_MS + 500 }], [afterBound + 500]);

const CHECKS = [
  ['a voice at 91% speed reports all its lateness, though no frame is 20 ms late', Math.abs(slowVoiceMs - (FRAMES - 1) * 2) <= TOLERANCE_MS, { slowVoiceMs }],
  ['a 15 ms stall every 10 frames reports all of them', Math.abs(tinyStallsMs - 49 * 15) <= TOLERANCE_MS, { tinyStallsMs }],
  ['a voice on time reports nothing', onTimeMs === 0, { onTimeMs }],
  ['frames that jitter around their time report nothing', jitteryMs === 0, { jitteryMs }],
  ['a burst banks no credit, so a stall after it is still reported in full', burstThenStallMs === AFTER_BURST_STALL_MS, { burstThenStallMs }],
  ['a frame in the same tick as the dry timer, 19 ms late, closes the gap it opened', dryTick.closing?.atMs === dryTick.openedAtMs && dryTick.closing?.ms === 19, dryTick],
  ['an open gap holds the count just short of it', held === heldAt - 1 && heldLast === heldAt - 1, { held, heldLast }],
  ['a closing report that never comes stops holding at the bound', released === heldAt + LONGEST_HOLD_MS && later === afterBound, { released, later }],
  ['a closing report that lands after the bound still corrects the count', lateClose === afterBound - 300, { lateClose }],
  ['a closed gap longer than the bound skips all of its length', longStall === afterBound - LONGEST_HOLD_MS, { longStall }],
];

const rows = CHECKS.map(([check, passed, seen]) => ({ check, passed, seen }));
const failed = rows.filter((row) => !row.passed);
writeFileSync(join(HERE, 'results', 'clock-rule.json'), `${JSON.stringify({ checks: rows.length, passed: rows.length - failed.length, rows }, null, 1)}\n`);
console.log(`${rows.length - failed.length} of ${rows.length} checks pass.`);
if (failed.length > 0) {
  console.log(JSON.stringify(failed, null, 1));
  process.exit(1);
}
