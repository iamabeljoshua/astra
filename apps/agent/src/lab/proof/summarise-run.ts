import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Beat, BeatId } from '@astra/contracts';
import { AUDIBLE_SAMPLE } from '../../live/first-sound.ts';
import { FAKE_WORD_MS } from '../../providers/fakes.ts';
import { findAudibleStartMs, findFirstLoudMs, findToneBursts, findWordOnsetsAfterSilence, findWordPlaces, getPercentiles, getWordList } from './analyse-run.ts';
import type { RawVoiceMessage, VendorTap } from './vendor-tap.ts';

const GRAPH_RATE = 48000;

export interface PageRecords {
  sampleRate: number;
  baseLatency: number;
  outputLatencyMs: number[];
  fired: { turnId: string; beatId: BeatId; atWord: number; firedAtMs: number; firedEpochMs: number; positionMs: number; wordStartMs: number }[];
  drawn: { id: string; drawnAtMs: number; paintedAtMs: number | null }[];
  agentMessages: { type: string; atMs: number; epochMs: number; firstWord?: number; beatId?: string; count?: number; gapAtMs?: number; gapMs?: number }[];
  browserMessages: { type: string; atMs: number }[];
  stops: { turnId: string; receivedAtMs: number; receivedEpochMs: number; audioFrameAtStop: number }[];
  probe: { kind: string; atMs: number; where: string }[];
  frames: { atMs: number; ms: number }[];
  log: unknown[];
  turnsSent: string[];
  refused: string[];
  caption: string;
}

interface AgentTurn {
  turnId: string;
  startedAtMs: number;
  beats: Beat[];
  firstFrameAtMs: number | null;
  firstWordsAtMs: number | null;
  sampleRate: number;
  words: { atMs: number; words: { text: string; startMs: number }[] }[];
  gaps: { atMs: number; ms?: number; reportedAtMs: number }[];
  stopDecidedAtMs: number | null;
  framesAfterStop: number;
  mismatches: { ours: string; theirs: string }[];
  audioMs: number;
}

interface ReplaySample {
  liveMs: number;
  live: BoardDescription;
  replay: BoardDescription;
  replayAgain: BoardDescription;
}

export interface BoardDescription {
  focus: string | null;
  elements: { id: string; kind: string; tex?: string; drawn: number; sceneSeconds?: number; revealedUpTo?: number }[];
}

const readInt16 = (path: string) => {
  const bytes = readFileSync(path);
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
};

function getVendorWordStarts(tap: VendorTap | null): (number[] | null)[] {
  if (!tap) return [];
  const byContext = new Map<string, RawVoiceMessage[]>();
  for (const message of tap.messages) {
    if (message.contextId) byContext.set(message.contextId, [...(byContext.get(message.contextId) ?? []), message]);
  }
  return [...byContext.values()].map((messages) => {
    const chars = messages.flatMap((message) => message.chars);
    const starts = messages.flatMap((message) => message.startsMs);
    const wordStarts: number[] = [];
    chars.forEach((char, index) => {
      if (!/\s/.test(char) && (index === 0 || /\s/.test(chars[index - 1] as string))) wordStarts.push(starts[index] as number);
    });
    return wordStarts;
  });
}

function getLastAudibleAfter(pcm: Int16Array, { rate, firstFrame, frame, turnEndFrame }: { rate: number; firstFrame: number; frame: number; turnEndFrame: number }): number {
  const toSample = (graphFrame: number) => Math.round(((graphFrame - firstFrame) / GRAPH_RATE) * rate);
  const from = toSample(frame);
  const to = Math.min(pcm.length, toSample(turnEndFrame));
  let last = -1;
  for (let index = from; index < to; index++) if (Math.abs(pcm[index] as number) >= AUDIBLE_SAMPLE) last = index;
  return last < 0 ? 0 : ((last - from) / rate) * 1000;
}

function getStopRows({ turns, records, arriving, output, tapRate, firstFrames }: { turns: AgentTurn[]; records: PageRecords; arriving: Int16Array | null; output: Int16Array | null; tapRate: number; firstFrames: { arriving: number; output: number } }) {
  return records.stops.map((stop) => {
    const turn = turns.find((candidate) => candidate.turnId === stop.turnId);
    const nextTurn = records.agentMessages.find((message) => message.type === 'turnStarted' && message.atMs > stop.receivedAtMs);
    const endFrame = ((nextTurn?.atMs ?? stop.receivedAtMs + 1200) / 1000) * GRAPH_RATE;
    const firedAfterStop = records.fired.filter((cue) => cue.turnId === stop.turnId && cue.firedAtMs > stop.receivedAtMs).length;
    return {
      turnId: stop.turnId,
      decisionToFrozenMs: turn?.stopDecidedAtMs ? Math.round(stop.receivedEpochMs - turn.stopDecidedAtMs) : null,
      audioAfterGainMs: output ? Math.round(getLastAudibleAfter(output, { rate: tapRate, firstFrame: firstFrames.output, frame: stop.audioFrameAtStop, turnEndFrame: endFrame })) : null,
      audioStillArrivingMs: arriving ? Math.round(getLastAudibleAfter(arriving, { rate: tapRate, firstFrame: firstFrames.arriving, frame: stop.audioFrameAtStop, turnEndFrame: endFrame })) : null,
      framesCapturedAfterStop: turn?.framesAfterStop ?? null,
      firedAfterStop,
    };
  });
}

// `close_context` does not cancel, so this counts what the vendor still sent for a turn after its stop.
function getVendorMessagesAfterStop(agent: { turns: AgentTurn[]; tap: VendorTap | null }) {
  if (!agent.tap) return [];
  const contexts = [...new Set(agent.tap.messages.flatMap((message) => (message.contextId ? [message.contextId] : [])))];
  return agent.turns.flatMap((turn, index) => {
    if (turn.stopDecidedAtMs === null) return [];
    const after = (agent.tap as VendorTap).messages.filter((message) => message.contextId === contexts[index] && message.atMs > (turn.stopDecidedAtMs as number));
    const audioMs = after.reduce((sum, message) => sum + (message.audioBytes / 2 / turn.sampleRate) * 1000, 0);
    return [{ turnId: turn.turnId, messages: after.length, audioMs: Math.round(audioMs) }];
  });
}

function getFirstDrawingDelays(turns: readonly AgentTurn[], records: PageRecords): { turnId: string; ms: number }[] {
  return turns.flatMap((turn, index) => {
    const started = records.agentMessages.filter((message) => message.type === 'turnStarted')[index];
    const onset = started && records.probe.find((event) => event.where === 'arriving' && event.kind === 'onset' && event.atMs >= started.atMs - 300);
    const firstCue = records.fired.find((cue) => cue.turnId === turn.turnId);
    return onset && firstCue ? [{ turnId: turn.turnId, ms: Math.round(firstCue.firedAtMs - onset.atMs) }] : [];
  });
}

function compareReplay(samples: ReplaySample[]) {
  const differingSamples = samples.filter(({ live, replay }) => JSON.stringify(live) !== JSON.stringify(replay)).map((sample) => sample.liveMs);
  const differentTwice = samples.filter(({ replay, replayAgain }) => JSON.stringify(replay) !== JSON.stringify(replayAgain)).length;
  return { samples: samples.length, differingSamples, differentTwice, elementsAtEnd: samples.at(-1)?.live.elements.map((element) => element.id) ?? [] };
}

// A real stall moves every later word by its length, so this checks each report against the sound and not the agent.
function checkGapReports(turn: AgentTurn, rows: readonly WordRow[]) {
  const closed = turn.gaps.filter((gap) => gap.ms !== undefined);
  return closed.flatMap((gap) => {
    const placed = rows.filter((row) => row.heardAtMs !== null && row.turnId === turn.turnId);
    const before = placed.filter((row) => row.planMs < gap.atMs).at(-1);
    const after = placed.find((row) => row.planMs >= gap.atMs);
    if (!before || !after) return [];
    const heardSpanMs = (after.heardAtMs as number) - (before.heardAtMs as number);
    return [{ atMs: gap.atMs, reportedMs: gap.ms as number, heardShiftMs: Math.round(heardSpanMs - (after.planMs - before.planMs)) }];
  });
}

interface WordRow {
  turnId: string;
  beatId: BeatId;
  wordInBeat: number;
  text: string;
  planMs: number;
  heardAtMs: number | null;
  audibleAtMs: number | null;
  arrivedAtMs: number | null;
}

function getTurnWords({ turn, turnIndex, records, vendorWordStarts, folder, arriving, tapRate, firstFrame }: { turn: AgentTurn; turnIndex: number; records: PageRecords; vendorWordStarts: (number[] | null)[]; folder: string; arriving: Int16Array; tapRate: number; firstFrame: number }): { rows: WordRow[]; firstLoudMs: number } {
  const voiceWords = turn.words.flatMap((chunk) => chunk.words);
  const list = getWordList(turn.beats);
  const sentPcm = readInt16(join(folder, `${turn.turnId}.pcm`));
  const firstLoudMs = findFirstLoudMs(sentPcm, turn.sampleRate);
  const planMs = voiceWords.map((word) => word.startMs);
  const vendorStarts = vendorWordStarts[turnIndex];
  const turnStarted = records.agentMessages.filter((message) => message.type === 'turnStarted')[turnIndex];
  const firstSoundGraphMs = records.probe.find((event) => event.where === 'arriving' && event.kind === 'onset' && event.atMs >= (turnStarted?.atMs ?? 0) - 300)?.atMs ?? 0;
  const heardStartGraphMs = (firstFrame / GRAPH_RATE) * 1000;
  const places = findWordPlaces({ sentPcm, sentRate: turn.sampleRate, heardPcm: arriving, heardRate: tapRate, heardStartGraphMs, firstSoundGraphMs }, planMs.map((ms, index) => vendorStarts?.[index] ?? ms + firstLoudMs));
  const wordMessages = records.agentMessages.filter((message) => message.type === 'words');
  const rows = planMs.map((ms, index) => {
    const word = list[index];
    const message = wordMessages.find((candidate) => candidate.beatId === word?.beatId && (candidate.firstWord ?? 0) <= (word?.wordInBeat ?? 0) && (candidate.firstWord ?? 0) + (candidate.count ?? 0) > (word?.wordInBeat ?? 0) && candidate.atMs >= (turnStarted?.atMs ?? 0));
    const heardAtMs = places[index]?.heardAtMs ?? null;
    const audibleAtMs = heardAtMs === null ? null : findAudibleStartMs({ heardPcm: arriving, heardRate: tapRate, heardStartGraphMs, placedAtMs: heardAtMs });
    return { turnId: turn.turnId, beatId: word?.beatId as BeatId, wordInBeat: word?.wordInBeat ?? -1, text: word?.text ?? '', planMs: ms, heardAtMs, audibleAtMs, arrivedAtMs: message?.atMs ?? null };
  });
  return { rows, firstLoudMs };
}

// On the fake voice the n-th loud burst of a turn is its n-th word.
function getDriftOnFakeBursts({ records, arriving, tapRate, firstFrame, earMs }: { records: PageRecords; arriving: Int16Array; tapRate: number; firstFrame: number; earMs: number }): number[] {
  const startMs = (firstFrame / GRAPH_RATE) * 1000;
  const bursts = findToneBursts(arriving, tapRate).map((atMs) => startMs + atMs);
  const turnStarts = records.agentMessages.filter((message) => message.type === 'turnStarted').map((message) => message.atMs);
  const turnIds = [...new Set(records.fired.map((cue) => cue.turnId))];
  return records.fired.flatMap((cue) => {
    const turnIndex = turnIds.indexOf(cue.turnId);
    const inTurn = bursts.filter((atMs) => atMs >= (turnStarts[turnIndex] ?? 0) - 300 && atMs < (turnStarts[turnIndex + 1] ?? Number.POSITIVE_INFINITY) - 300);
    const wordAtMs = inTurn[Math.round(cue.wordStartMs / FAKE_WORD_MS)];
    return wordAtMs === undefined ? [] : [cue.firedAtMs - (wordAtMs + earMs)];
  });
}

// Compares what the browser did with where each word really landed in the audio it received.
export function summariseRun(folder: string, settings: { name: string; network: object | null; throttle: number; phone: boolean }) {
  const page = JSON.parse(readFileSync(join(folder, 'page.json'), 'utf8')) as { records: PageRecords; replayCheck: { samples: ReplaySample[]; log: unknown[] } };
  const agent = JSON.parse(readFileSync(join(folder, 'agent.json'), 'utf8')) as { turns: AgentTurn[]; tap: VendorTap | null; voice: string; model: string; refused: string[] };
  const taps = JSON.parse(readFileSync(join(folder, 'taps.json'), 'utf8')) as { rate: number; arrivingFirstFrame: number; outputFirstFrame: number };
  const { records } = page;
  const arriving = readInt16(join(folder, 'arriving.pcm'));
  const output = readInt16(join(folder, 'output.pcm'));
  const vendorWordStarts = getVendorWordStarts(agent.tap);
  const perTurn = agent.turns.map((turn, turnIndex) => getTurnWords({ turn, turnIndex, records, vendorWordStarts, folder, arriving, tapRate: taps.rate, firstFrame: taps.arrivingFirstFrame }));
  const words = perTurn.flatMap((turn) => turn.rows);
  const findWord = (cue: PageRecords['fired'][number]) => words.find((word) => word.turnId === cue.turnId && word.beatId === cue.beatId && word.wordInBeat === cue.atWord);
  const earMs = records.outputLatencyMs.at(-1) ?? 0;
  const cueErrors = records.fired.flatMap((cue) => {
    const word = findWord(cue);
    return word?.audibleAtMs && word.heardAtMs ? [{ error: cue.firedAtMs - (word.audibleAtMs + earMs), toPlacedWord: cue.firedAtMs - (word.heardAtMs + earMs), gateMs: word.audibleAtMs - word.heardAtMs, cue, word: word.text }] : [];
  });
  const firedMs = cueErrors.map((row) => row.error);
  const leads = words.flatMap((word) => (word.heardAtMs !== null && word.arrivedAtMs !== null ? [word.heardAtMs - word.arrivedAtMs] : []));
  const drawnErrors = records.drawn.flatMap((entry, index) => {
    const row = cueErrors.find(({ cue }) => Math.abs(cue.firedAtMs - entry.drawnAtMs) < 200 && index >= 0);
    return row && entry.paintedAtMs !== null ? [row.error + (entry.paintedAtMs - row.cue.firedAtMs)] : [];
  });
  const frameGaps = records.frames.slice(1).map((frame, index) => frame.ms - (records.frames[index]?.ms ?? frame.ms));
  const firstSoundFromStart = agent.turns.flatMap((turn) => {
    const started = records.agentMessages.filter((message) => message.type === 'turnStarted').find((message) => message.epochMs >= turn.startedAtMs);
    const onset = started && records.probe.find((event) => event.where === 'arriving' && event.kind === 'onset' && event.atMs >= started.atMs - 300);
    return started && onset ? [started.epochMs + (onset.atMs - started.atMs) - turn.startedAtMs] : [];
  });
  const stops = getStopRows({ turns: agent.turns, records, arriving, output, tapRate: taps.rate, firstFrames: { arriving: taps.arrivingFirstFrame, output: taps.outputFirstFrame } });
  const replay = compareReplay(page.replayCheck.samples);
  const gaps = agent.turns.flatMap((turn) => turn.gaps.filter((gap) => gap.ms !== undefined).map((gap) => ({ turnId: turn.turnId, atMs: gap.atMs, ms: gap.ms })));
  const gapChecks = agent.turns.flatMap((turn) => checkGapReports(turn, words));
  const wordTimeBeforeSoundMs = agent.turns.flatMap((turn, turnIndex) => {
    const vendorStarts = vendorWordStarts[turnIndex];
    if (!vendorStarts) return [];
    return findWordOnsetsAfterSilence(readInt16(join(folder, `${turn.turnId}.pcm`)), turn.sampleRate, vendorStarts).map((onset) => onset.onsetMs - (vendorStarts[onset.wordIndex] as number));
  });
  const messagesAfterStop = getVendorMessagesAfterStop(agent);
  const expectedCues = agent.turns.reduce((sum, turn) => sum + turn.beats.flatMap((beat) => beat.script.filter((part) => typeof part !== 'string')).length, 0);
  const driftOnFakeBursts = agent.voice === 'fake' ? getDriftOnFakeBursts({ records, arriving, tapRate: taps.rate, firstFrame: taps.arrivingFirstFrame, earMs }) : [];
  const brief = {
    driftOnFakeBursts: { ...getPercentiles(driftOnFakeBursts.map(Math.abs)), signedWorst: driftOnFakeBursts.at(-1) === undefined ? null : Math.round(Math.min(...driftOnFakeBursts)) },
    voice: `${agent.voice} ${agent.model}`,
    cuesFired: records.fired.length,
    cuesPlanned: expectedCues,
    wordsMatched: words.filter((word) => word.heardAtMs !== null).length,
    words: words.length,
    drift: getPercentiles(firedMs.map(Math.abs)),
    driftSigned: getPercentiles(firedMs),
    driftToPlacedWord: getPercentiles(cueErrors.map((row) => row.toPlacedWord)),
    earlyOver40: firedMs.filter((error) => error < -40).length,
    lateOver100: firedMs.filter((error) => error > 100).length,
    paintedDrift: getPercentiles(drawnErrors.map(Math.abs)),
    wordsLeadAudio: getPercentiles(leads),
    wordsLate: leads.filter((lead) => lead < 0).length,
    stopFrozen: getPercentiles(stops.flatMap((stop) => (stop.decisionToFrozenMs === null ? [] : [stop.decisionToFrozenMs]))),
    stopAudioAfterGain: getPercentiles(stops.flatMap((stop) => (stop.audioAfterGainMs === null ? [] : [stop.audioAfterGainMs]))),
    stopStillArriving: getPercentiles(stops.flatMap((stop) => (stop.audioStillArrivingMs === null ? [] : [stop.audioStillArrivingMs]))),
    replay,
    frameMs: getPercentiles(frameGaps),
    firstSoundFromTextMs: getPercentiles(firstSoundFromStart),
    firstDrawingAfterFirstSoundMs: getFirstDrawingDelays(agent.turns, records),
    firstFrameFromTextMs: getPercentiles(agent.turns.flatMap((turn) => (turn.firstFrameAtMs ? [turn.firstFrameAtMs - turn.startedAtMs] : []))),
    gapsClosed: gaps.length,
    wordMismatches: agent.turns.flatMap((turn) => turn.mismatches),
    refused: [...records.refused, ...agent.refused],
    outputLatencyMs: records.outputLatencyMs.at(-1) ?? null,
  };
  return { settings, brief, leadingSilenceMs: perTurn.map((turn) => Math.round(turn.firstLoudMs)), wordTimeBeforeSoundMs, gapChecks, messagesAfterStop, stops, gaps, cues: cueErrors.map(({ error, toPlacedWord, gateMs, cue, word }) => ({ turnId: cue.turnId, beatId: cue.beatId, atWord: cue.atWord, word, errorMs: Math.round(error), toPlacedWordMs: Math.round(toPlacedWord), wordTimeBeforeSoundMs: Math.round(gateMs) })) };
}
