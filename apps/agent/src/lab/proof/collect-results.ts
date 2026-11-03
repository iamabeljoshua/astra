import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPercentiles, type Percentiles } from './analyse-run.ts';

interface RunSummary {
  settings: { name: string; network: object | null; throttle: number; phone: boolean };
  brief: {
    voice: string;
    cuesFired: number;
    cuesPlanned: number;
    wordsLate: number;
    replay: { samples: number; differingSamples: number[]; differentTwice: number };
    frameMs: Percentiles;
    firstSoundFromTextMs: Percentiles;
    firstFrameFromTextMs: Percentiles;
    gapsClosed: number;
    wordMismatches: unknown[];
    refused: unknown[];
    wordsLeadAudio: Percentiles;
    outputLatencyMs: number | null;
  };
  leadingSilenceMs: number[];
  stops: { decisionToFrozenMs: number | null; audioAfterGainMs: number | null; audioStillArrivingMs: number | null; framesCapturedAfterStop: number | null; firedAfterStop: number }[];
  gaps: { ms?: number }[];
  gapChecks: { atMs: number; reportedMs: number; heardShiftMs: number }[];
  wordTimeBeforeSoundMs: number[];
  messagesAfterStop: { messages: number; audioMs: number }[];
  cues: { errorMs: number; toPlacedWordMs: number; wordTimeBeforeSoundMs: number }[];
}

const [runsFolder, outputPath] = process.argv.slice(2);
if (!runsFolder) throw new Error('Name the folder of runs');


const groups = new Map<string, RunSummary[]>();
for (const folder of readdirSync(runsFolder)) {
  const path = join(runsFolder, folder, 'summary.json');
  if (!existsSync(path)) continue;
  const summary = JSON.parse(readFileSync(path, 'utf8')) as RunSummary;
  const key = `${folder.replace(/-\d+$/, '')}|${summary.brief.voice}`;
  groups.set(key, [...(groups.get(key) ?? []), summary]);
}

const rows = [...groups.entries()].map(([key, group]) => {
  const [scenario, voice] = key.split('|') as [string, string];
  const cues = group.flatMap((run) => run.cues);
  const errors = cues.map((cue) => cue.errorMs);
  const stops = group.flatMap((run) => run.stops);
  return {
    scenario,
    voice,
    runs: group.length,
    cuesFired: group.reduce((sum, run) => sum + run.brief.cuesFired, 0),
    cuesMeasured: cues.length,
    driftToSoundAbs: getPercentiles(errors.map(Math.abs)),
    driftToSoundSigned: getPercentiles(errors),
    driftToVendorWordTimeSigned: getPercentiles(cues.map((cue) => cue.toPlacedWordMs)),
    over100: errors.filter((error) => Math.abs(error) > 100).length,
    earlyOver40: errors.filter((error) => error < -40).length,
    stopFrozen: getPercentiles(stops.flatMap((stop) => (stop.decisionToFrozenMs === null ? [] : [stop.decisionToFrozenMs]))),
    stopAudioAfterGain: getPercentiles(stops.flatMap((stop) => (stop.audioAfterGainMs === null ? [] : [stop.audioAfterGainMs]))),
    stopStillArriving: getPercentiles(stops.flatMap((stop) => (stop.audioStillArrivingMs === null ? [] : [stop.audioStillArrivingMs]))),
    stopsCount: stops.length,
    framesAfterStop: stops.reduce((sum, stop) => sum + (stop.framesCapturedAfterStop ?? 0), 0),
    cuesAfterStop: stops.reduce((sum, stop) => sum + stop.firedAfterStop, 0),
    replaySamples: group.reduce((sum, run) => sum + run.brief.replay.samples, 0),
    replayDiffering: group.reduce((sum, run) => sum + run.brief.replay.differingSamples.length, 0),
    realGapsMs: group.flatMap((run) => run.gaps.flatMap((gap) => (gap.ms === undefined ? [] : [gap.ms]))),
    gapReportError: getPercentiles(group.flatMap((run) => run.gapChecks.map((check) => Math.abs(check.reportedMs - check.heardShiftMs)))),
    gapChecks: group.flatMap((run) => run.gapChecks),
    vendorWordTimeBeforeSound: getPercentiles(group.flatMap((run) => run.wordTimeBeforeSoundMs)),
    vendorWordTimeAbsolute: getPercentiles(group.flatMap((run) => run.wordTimeBeforeSoundMs.map(Math.abs))),
    vendorAudioAfterStopMs: getPercentiles(group.flatMap((run) => run.messagesAfterStop.map((row) => row.audioMs))),
    wordsLate: group.reduce((sum, run) => sum + run.brief.wordsLate, 0),
    worstWordLead: Math.min(...group.map((run) => run.brief.wordsLeadAudio.best ?? 0)),
    firstFrameFromText: getPercentiles(group.flatMap((run) => (run.brief.firstFrameFromTextMs.p50 === null ? [] : [run.brief.firstFrameFromTextMs.p50]))),
    frameP95: Math.max(...group.map((run) => run.brief.frameMs.p95 ?? 0)),
    frameWorst: Math.max(...group.map((run) => run.brief.frameMs.worst ?? 0)),
    leadingSilenceMs: getPercentiles(group.flatMap((run) => run.leadingSilenceMs)),
    wordMismatches: group.reduce((sum, run) => sum + run.brief.wordMismatches.length, 0),
    refused: group.reduce((sum, run) => sum + run.brief.refused.length, 0),
  };
});

const result = { measuredOn: 'this Mac, under load from other agents, over a West African network to ElevenLabs europe-west4, local LiveKit server', rows };
if (outputPath) writeFileSync(outputPath, `${JSON.stringify(result, null, 1)}\n`);
for (const row of rows) {
  console.log(`${row.scenario.padEnd(16)} ${row.voice} runs ${row.runs} cues ${row.cuesMeasured}/${row.cuesFired} p50 ${row.driftToSoundAbs.p50} p95 ${row.driftToSoundAbs.p95} worst ${row.driftToSoundAbs.worst} over100 ${row.over100} early40 ${row.earlyOver40} | stops ${row.stopsCount} frozen p95 ${row.stopFrozen.p95} gain ${row.stopAudioAfterGain.worst} arriving p95 ${row.stopStillArriving.p95} afterStop ${row.framesAfterStop}/${row.cuesAfterStop} | replay ${row.replayDiffering}/${row.replaySamples} | gaps ${row.realGapsMs.join(',')} read err p50 ${row.gapReportError.p50} worst ${row.gapReportError.worst} | vendor after stop p50 ${row.vendorAudioAfterStopMs.p50} | word time noise abs p50 ${row.vendorWordTimeAbsolute.p50} p95 ${row.vendorWordTimeAbsolute.p95} signed p50 ${row.vendorWordTimeBeforeSound.p50} n ${row.vendorWordTimeBeforeSound.count} | late ${row.wordsLate} lead ${row.worstWordLead} | F ${row.firstFrameFromText.p50} | frame p95 ${row.frameP95} worst ${row.frameWorst} | lead silence ${row.leadingSilenceMs.best}-${row.leadingSilenceMs.worst} | mismatch ${row.wordMismatches} refused ${row.refused}`);
}
