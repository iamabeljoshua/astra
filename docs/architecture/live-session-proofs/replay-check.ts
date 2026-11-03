// Run with plain Node: node replay-check.ts.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBeatText, getCues, getPlayedCues, getScriptFromWord, getSpokenWords, parseBeat, parseSessionEvent, type Beat, type ElementId, type SceneCommand, type SessionEvent, type SessionEventBody, type BeatPlayed } from '../../../packages/contracts/src/index.ts';

const ASSUMED_REVEAL_MS = 600;
const FLIGHT_SECONDS = 1.45;
const WORD_MS = 300;

interface Element { kind: string; tex?: string; revealStartMs: number; revealFrozenAtMs?: number }
interface Sim { seconds: number; status: 'paused' | 'running'; gravity: number }
interface Board { elements: Map<string, Element>; sims: Map<string, Sim>; dot: string | null; marks: string[]; ghosts: number }
const emptyBoard = (): Board => ({ elements: new Map(), sims: new Map(), dot: null, marks: [], ghosts: 0 });

function applyCommand(board: Board, command: SceneCommand, atMs: number): void {
  switch (command.kind) {
    case 'clearBoard': board.elements.clear(); board.sims.clear(); board.marks = []; board.ghosts = 0; board.dot = null; return;
    case 'hide': board.elements.delete(command.target); board.sims.delete(command.target); return;
    case 'focus': board.dot = command.target; return;
    case 'highlight': case 'annotate': case 'markValue': board.marks.push(`${command.kind}:${command.target}`); return;
    case 'ghostPath': board.ghosts += 1; return;
    case 'transformMath': { const element = board.elements.get(command.target); if (element) element.tex = command.tex; return; }
    case 'runSimulation': {
      const sim = board.sims.get(command.target);
      if (!sim) return;
      if (command.action === 'play') sim.status = 'running';
      if (command.action === 'pause') sim.status = 'paused';
      if (command.action === 'restart') { sim.seconds = 0; sim.status = 'running'; }
      return;
    }
    case 'simulate': board.sims.set(command.id, { seconds: 0, status: 'paused', gravity: command.simulation.parameters.gravity }); break;
    default: break;
  }
  if ('id' in command) board.elements.set(command.id, { kind: command.kind, tex: 'tex' in command ? command.tex : undefined, revealStartMs: atMs });
}

function advance(board: Board, ms: number): void {
  for (const sim of board.sims.values()) {
    if (sim.status === 'running') sim.seconds = Math.min(FLIGHT_SECONDS, sim.seconds + ms / 1000);
  }
}

function describe(board: Board, atMs: number) {
  const elements = [...board.elements.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, element]) => {
    const end = element.revealFrozenAtMs ?? atMs;
    return `${id}:${element.kind}${element.tex ? `(${element.tex})` : ''}@${Math.min(1, (end - element.revealStartMs) / ASSUMED_REVEAL_MS).toFixed(2)}`;
  });
  const sims = [...board.sims.entries()].map(([id, sim]) => `${id}:${sim.status}@${sim.seconds.toFixed(2)}s g=${sim.gravity}`);
  return { elements, sims, dot: board.dot, marks: [...board.marks].sort(), ghosts: board.ghosts };
}

type Step =
  | { at: number; type: 'cue'; command: SceneCommand }
  | { at: number; type: 'stop' }
  | { at: number; type: 'drag'; simId: string; gravity: number };

function runTruth(steps: Step[], endMs: number): Board {
  const board = emptyBoard();
  const ordered = [...steps].sort((a, b) => a.at - b.at);
  let clock = 0;
  for (const step of ordered) {
    advance(board, step.at - clock);
    clock = step.at;
    if (step.type === 'cue') applyCommand(board, step.command, step.at);
    if (step.type === 'stop') {
      for (const sim of board.sims.values()) sim.status = 'paused';
      for (const element of board.elements.values()) if (element.revealFrozenAtMs === undefined && step.at - element.revealStartMs < ASSUMED_REVEAL_MS) element.revealFrozenAtMs = step.at;
    }
    if (step.type === 'drag') {
      const sim = board.sims.get(step.simId);
      if (sim) { sim.gravity = step.gravity; sim.seconds = 0; sim.status = 'running'; }
    }
  }
  advance(board, endMs - clock);
  return board;
}

// The rebuild flattens every event into timed operations, so a cue inside a beat sorts against a drag inside that beat.
export function rebuildBoard(log: SessionEvent[], atMs: number): Board {
  const operations: { at: number; order: number; run: (board: Board) => void }[] = [];
  let snapshotSourceOrder = 0;
  for (const event of log) {
    if (event.kind === 'beatPlayed') {
      for (const cue of getPlayedCues(event.beat, event.firedCues)) {
        const at = event.atMs + (event.wordStartsMs[cue.atWord] ?? 0);
        operations.push({ at, order: snapshotSourceOrder++, run: (board) => applyCommand(board, cue.command, at) });
      }
      if (event.ending !== 'finished') {
        const at = event.atMs + event.durationMs;
        operations.push({ at, order: snapshotSourceOrder++, run: (board) => {
          for (const element of board.elements.values()) if (element.revealFrozenAtMs === undefined && at - element.revealStartMs < ASSUMED_REVEAL_MS) element.revealFrozenAtMs = at;
          for (const frozen of event.frozen) { const sim = board.sims.get(frozen.target); if (sim) { sim.status = 'paused'; sim.seconds = frozen.simulationSeconds; } }
        } });
      }
    }
    if (event.kind === 'boardFrozen') {
      operations.push({ at: event.atMs, order: snapshotSourceOrder++, run: (board) => {
        for (const frozen of event.frozen) { const sim = board.sims.get(frozen.target); if (sim) { sim.status = 'paused'; sim.seconds = frozen.simulationSeconds; } }
        for (const sim of board.sims.values()) sim.status = 'paused';
      } });
    }
    if (event.kind === 'studentActed' && event.action.action === 'sliderDragged') {
      const { samples, target } = event.action;
      for (const sample of samples) {
        operations.push({ at: event.atMs + sample.afterMs, order: snapshotSourceOrder++, run: (board) => {
          const sim = board.sims.get(target);
          if (sim) { sim.gravity = sample.value; sim.seconds = 0; sim.status = 'running'; }
        } });
      }
    }
  }
  operations.sort((a, b) => a.at - b.at || a.order - b.order);
  const board = emptyBoard();
  let clock = 0;
  for (const operation of operations) {
    if (operation.at > atMs) break;
    advance(board, operation.at - clock);
    clock = operation.at;
    operation.run(board);
  }
  advance(board, atMs - clock);
  return board;
}

function parseLog(bodies: (SessionEventBody & { atMs: number })[]): SessionEvent[] {
  return bodies.map((body, seq) => {
    const parsed = parseSessionEvent(JSON.parse(JSON.stringify({ seq, ...body })));
    if (!parsed.ok) throw new Error(`log refused: ${parsed.problem}`);
    return parsed.value;
  });
}

function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(parsed.problem);
  return parsed.value;
}

const wordCount = (beat: Beat) => getSpokenWords(getBeatText(beat)).length;
const wordStarts = (beat: Beat) => Array.from({ length: wordCount(beat) }, (_, index) => index * WORD_MS);
function cueSteps(beat: Beat, startMs: number): Step[] {
  return getCues(beat).map((cue) => ({ at: startMs + cue.atWord * WORD_MS, type: 'cue' as const, command: cue.command }));
}
function played(beat: Beat, atMs: number, cutAfterMs: number | null, frozen: { target: string; simulationSeconds: number }[] = [], lateCues = 0): BeatPlayed & { atMs: number } {
  const starts = wordStarts(beat);
  const durationMs = cutAfterMs ?? starts.length * WORD_MS;
  const playedWords = cutAfterMs === null ? starts.length : starts.filter((start) => start <= cutAfterMs).length;
  return { kind: 'beatPlayed', atMs, turnId: 't' as never, beat, wordStartsMs: starts.slice(0, Math.max(playedWords, 0)), durationMs, playedWords, firedCues: getCues(beat).filter((cue) => cue.atWord < playedWords).length - lateCues, ending: cutAfterMs === null ? 'finished' : 'interrupted', frozen: frozen as never, reportedBy: 'browser' };
}

let failures = 0;
const rows: { name: string; agrees: boolean; expected: string }[] = [];
function compare(name: string, truth: Board, rebuilt: Board, atMs: number, expectation: 'match' | 'known-gap' = 'match') {
  const a = JSON.stringify(describe(truth, atMs));
  const b = JSON.stringify(describe(rebuilt, atMs));
  const same = a === b;
  console.log(`${same ? 'MATCH   ' : 'DIFFERS '} ${name}`);
  if (!same) {
    console.log(`   true    ${a}`);
    console.log(`   rebuilt ${b}`);
  } else console.log(`   board   ${a}`);
  if (same !== (expectation === 'match')) failures += 1;
  rows.push({ name, agrees: same, expected: expectation });
  return same;
}

const shotCommand = { kind: 'simulate', id: 'shot', simulation: { model: 'projectile', parameters: { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.81 } } };

{
  const beat = makeBeat('s1', ['Now look at ', { kind: 'drawing', id: 'court', name: 'hoop-side' }, 'the ', { kind: 'writeMath', id: 'eq', tex: 'x^2' }, 'equation and ', { kind: 'plot', id: 'graph', expression: 'x^2', domain: [0, 1] }, 'the graph.']);
  const cut = 4 * WORD_MS + 140;
  const truth = runTruth([...cueSteps(beat, 1000).filter((s) => s.at <= 1000 + cut), { at: 1000 + cut, type: 'stop' }], 4000);
  const log = parseLog([played(beat, 1000, cut)]);
  compare('1. cut mid-word while a drawing and an equation are mid-reveal', truth, rebuildBoard(log, 4000), 4000);
  console.log(`   what the model is told it played: "${getSpokenWords(getBeatText(beat)).slice(0, log[0]!.kind === 'beatPlayed' ? log[0]!.playedWords : 0).join(' ')}"`);
}

{
  const beat = makeBeat('s2', [shotCommand, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'Watch this arrow.']);
  const cut = 710;
  const truth = runTruth([...cueSteps(beat, 0), { at: cut, type: 'stop' }], 3000);
  const log = parseLog([played(beat, 0, cut, [{ target: 'shot', simulationSeconds: 0.71 }])]);
  compare('2. ball frozen by a cut on the last word (the PRD row 4 timing)', truth, rebuildBoard(log, 3000), 3000);
}

{
  const first = makeBeat('s3a', [shotCommand, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'Go.']);
  const second = makeBeat('s3b', ['See how it climbs.']);
  const truth = runTruth([...cueSteps(first, 0), ...cueSteps(second, 400), { at: 400 + 650, type: 'stop' }], 3000);
  const log = parseLog([played(first, 0, null), played(second, 400, 650, [{ target: 'shot', simulationSeconds: 1.05 }])]);
  compare('3. frozen frame belongs to a simulation started a beat earlier', truth, rebuildBoard(log, 3000), 3000);
}

{
  const beat = makeBeat('s4', ['Now ', { kind: 'writeMath', id: 'eq', tex: 'x' }, 'look ', { kind: 'highlight', id: 'mark', target: 'eq' }, 'here.']);
  const truth = runTruth(cueSteps(beat, 0), 3000);
  const log = parseLog([{ kind: 'studentSpoke', atMs: 300, text: 'uh-huh', source: 'voice', isReaction: true, durationMs: 300 }, played(beat, 0, null)]);
  compare('4. "uh-huh" mid-beat, drawings still land', truth, rebuildBoard(log, 3000), 3000);
}

{
  const setup = makeBeat('s5a', [shotCommand, { kind: 'slider', id: 'g', target: 'shot', parameter: 'gravity', min: 1, max: 20 }, 'Your turn.']);
  const beat = makeBeat('s5b', ['Now keep going and ', { kind: 'runSimulation', target: 'shot', action: 'pause' }, 'stop it.']);
  const steps: Step[] = [...cueSteps(setup, 0), ...cueSteps(beat, 1000), { at: 1500, type: 'drag', simId: 'shot', gravity: 1.6 }];
  const truth = runTruth(steps, 3000);
  const log = parseLog([played(setup, 0, null), { kind: 'studentActed', atMs: 1500, action: { action: 'sliderDragged', target: 'shot' as ElementId, parameter: 'gravity', samples: [{ afterMs: 0, value: 1.6 }] } }, played(beat, 1000, null)]);
  compare('5a. drag mid-beat, flattened by time', truth, rebuildBoard(log, 3000), 3000);
  const naive = emptyBoard();
  let clock = 0;
  for (const event of log) {
    advance(naive, Math.max(0, event.atMs - clock)); clock = Math.max(clock, event.atMs);
    if (event.kind === 'beatPlayed') for (const cue of getPlayedCues(event.beat, event.firedCues)) applyCommand(naive, cue.command, event.atMs + (event.wordStartsMs[cue.atWord] ?? 0));
    if (event.kind === 'studentActed' && event.action.action === 'sliderDragged') { const sim = naive.sims.get(event.action.target); if (sim) { sim.gravity = 1.6; sim.seconds = 0; sim.status = 'running'; } }
  }
  advance(naive, 3000 - clock);
  compare('5b. same log, whole events applied in seq order (trap, expected to differ)', truth, naive, 3000, 'known-gap');
}

{
  const beat = makeBeat('s6', ['Your ', { kind: 'vector', id: 'push', on: 'shot.ball', angleDegrees: 0, length: 'medium' }, 'hand, right up ', { kind: 'runSimulation', target: 'shot', action: 'play' }, 'until it ', { kind: 'hide', target: 'push' }, 'lets go.']);
  const setup = makeBeat('s6a', [shotCommand, 'Set up.']);
  const cut = 2 * WORD_MS + 100;
  const playedEvent = played(beat, 1000, cut);
  const rest = makeBeat('s6r', getScriptFromWord(beat, { fromWord: playedEvent.playedWords, firedCues: playedEvent.firedCues }));
  const steps: Step[] = [...cueSteps(setup, 0), ...cueSteps(beat, 1000).filter((s) => s.at <= 1000 + cut), { at: 1000 + cut, type: 'stop' }, ...cueSteps(rest, 6000)];
  const truth = runTruth(steps, 9000);
  const log = parseLog([played(setup, 0, null), { ...playedEvent, ending: 'disconnected' }, { kind: 'connectionGap', atMs: 1000 + cut, durationMs: 4000 }, played(rest, 6000, null)]);
  compare('6. disconnect mid-word, resume with the rest of the beat', truth, rebuildBoard(log, 9000), 9000);
  const firedBefore = getPlayedCues(beat, playedEvent.firedCues).map((cue) => cue.command.kind);
  const firedAfter = getCues(rest).map((cue) => cue.command.kind);
  console.log(`   cues before ${JSON.stringify(firedBefore)} after ${JSON.stringify(firedAfter)}; words after "${getBeatText(rest)}"`);
  let bad = 0;
  const tricky = makeBeat('s6t', [{ kind: 'clearBoard' }, 'Your ha', { kind: 'focus', target: 'a' }, 'nd,  right', { kind: 'focus', target: 'b' }, ' up ', { kind: 'focus', target: 'c' }, 'until.', { kind: 'focus', target: 'd' }]);
  const words = getSpokenWords(getBeatText(tricky));
  for (let k = 0; k <= words.length; k += 1) {
    const firedCues = getCues(tricky).filter((cue) => cue.atWord < k).length;
    const script = getScriptFromWord(tricky, { fromWord: k, firedCues });
    const fired = getPlayedCues(tricky, firedCues).map((cue) => JSON.stringify(cue.command));
    const remainder = script.filter((part) => typeof part !== 'string').map((part) => JSON.stringify(part));
    const text = getSpokenWords(script.filter((part) => typeof part === 'string').join(''));
    if (JSON.stringify([...fired, ...remainder]) !== JSON.stringify(getCues(tricky).map((cue) => JSON.stringify(cue.command)))) bad += 1;
    if (text.join(' ') !== words.slice(k).join(' ')) bad += 1;
  }
  console.log(`   getScriptFromWord over every cut point of a tricky beat: ${bad} problems`);
  rows.push({ name: 'getScriptFromWord over every cut point: no cue twice, none lost, no word lost', agrees: bad === 0, expected: 'match' });
  if (bad > 0) failures += 1;
}

{
  const first = makeBeat('s7a', ['First ', { kind: 'writeMath', id: 'one', tex: '1' }, 'one.']);
  const second = makeBeat('s7b', ['Then ', { kind: 'writeMath', id: 'two', tex: '2' }, 'two.']);
  const log = parseLog([played(first, 0, null), played(second, 1000, null), { kind: 'studentActed', atMs: 2000, action: { action: 'rewound', toBeat: 's7b' as never } }, played(second, 2100, null)]);
  const rewindIndex = log.findIndex((event) => event.kind === 'studentActed');
  const beatToRewind = log.slice(0, rewindIndex).filter((event) => event.kind === 'beatPlayed').at(-1)!;
  const kept = [...log.slice(0, log.indexOf(beatToRewind)), ...log.slice(rewindIndex + 1)];
  const truth = runTruth([...cueSteps(first, 0), ...cueSteps(second, 2100)], 4000);
  compare('7. rewound, with the rule "drop the toBeat play and everything after it"', truth, rebuildBoard(kept, 4000), 4000);
  const reused = parseLog([played(makeBeat('b1', ['One.']), 0, null), played(makeBeat('b1', ['Other.']), 1000, null), { kind: 'studentActed', atMs: 1500, action: { action: 'rewound', toBeat: 'b1' as never } }]);
  console.log(`   two turns can reuse beat id "b1" and the rewind cannot name which: every event still parses (${reused.length} events). rewound has no turnId.`);
}

{
  const beat = makeBeat('s8', [shotCommand, { kind: 'runSimulation', target: 'shot', action: 'play' }, 'Watch this arrow.']);
  const stopAt = 3 * WORD_MS + 200;
  const truth = runTruth([...cueSteps(beat, 0), { at: stopAt, type: 'stop' }], 3000);
  const log = parseLog([played(beat, 0, null), { kind: 'boardFrozen', atMs: stopAt, turnId: 't' as never, frozen: [{ target: 'shot' as ElementId, simulationSeconds: 1.1 }] }]);
  compare('8. stop 200 ms after the last word, ball still flying, freeze in the log', truth, rebuildBoard(log, 3000), 3000);
}

{
  const beat = makeBeat('s9', ['Look at ', { kind: 'plot', id: 'graph', expression: 'x', domain: [0, 1] }, 'this graph now.']);
  const cut = 2 * WORD_MS + 300;
  const steps: Step[] = [{ at: cut, type: 'stop' }];
  const truth = runTruth(steps, 3000);
  const log = parseLog([played(beat, 0, cut, [], 1)]);
  compare('9. cue message late, student stops first: the log says it never fired', truth, rebuildBoard(log, 3000), 3000);
}

{
  const beat = makeBeat('s10', [{ kind: 'writeMath', id: 'never', tex: 'x' }, 'Hello there.']);
  const zero = parseLog([{ ...played(beat, 0, 0), wordStartsMs: [], playedWords: 0, firedCues: 0 }]);
  compare('10. stopped before word 0: no cue fires', runTruth([{ at: 0, type: 'stop' }], 1000), rebuildBoard(zero, 1000), 1000);
}

{
  const beat = makeBeat('s11', ['Your ', { kind: 'vector', id: 'push', on: 'shot.ball', angleDegrees: 0, length: 'medium' }, 'hand, right up until it ', { kind: 'hide', target: 'push' }, 'lets go.']);
  const cut = 4 * WORD_MS;
  const truth = runTruth([...cueSteps(beat, 0).filter((s) => s.at <= cut), { at: cut, type: 'stop' }], 3000);
  compare('11. hide cue never played: arrow stays on the board in both', truth, rebuildBoard(parseLog([played(beat, 0, cut)]), 3000), 3000);
}

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'results', 'replay.json'), `${JSON.stringify({ unexpected: failures, rows }, null, 1)}\n`);
console.log(`\nunexpected results: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
