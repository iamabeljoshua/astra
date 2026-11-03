#!/usr/bin/env node
import { parseArgs, stripVTControlCharacters } from 'node:util';
import {
  getApiUrl,
  getAppChecks,
  getHealthyRun,
  getWebUrl,
  requireRun,
  startApp,
  stopApp,
} from './lib/app.mjs';
import { getPageChecks } from './lib/browser.mjs';
import {
  clearImagesAndPlanDrive,
  driveJourney,
  getSingleLine,
  saveFinalScreenshots,
  waitForStrayRejections,
} from './lib/journey.mjs';
import { DEFAULT_EVIDENCE_DIR, getProductName, VIEWPORTS } from './lib/settings.mjs';

const USAGE = `Usage: [WEB_PORT=<port>] [API_PORT=<port>] [DATABASE_URL=<url>] pnpm verify <command>
  start    Migrate the database, start Astra, and wait until the web app and the API both answer.
  doctor   Check the running instance, its ports, the page identity, WebGL, and audio.
  drive    Drive a journey and save screenshots. Needs a running instance.
           --journey <name or path>   Default: home
           --viewports <names>        Default: ${Object.keys(VIEWPORTS).join(',')}
           --out <dir>                Default: ${DEFAULT_EVIDENCE_DIR}
  run      start, then drive, then stop. Takes the drive options.
  stop     Stop what start started. Safe to run twice.`;

const INTERRUPT_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const CLI_OPTIONS = {
  journey: { type: 'string', default: 'home' },
  viewports: { type: 'string', default: Object.keys(VIEWPORTS).join(',') },
  out: { type: 'string', default: DEFAULT_EVIDENCE_DIR },
};

const failuresOutsideChecks = [];

function addFailureOutsideChecks(detail) {
  failuresOutsideChecks.push(detail);
  console.log(`FAIL ${detail}`);
}

function addStrayError(reason) {
  const message = getSingleLine(reason?.message ?? String(reason));
  addFailureOutsideChecks(`stray error, usually a missing await in the journey: ${message}`);
}

function reportChecks(checks) {
  for (const { name, passed, detail } of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  }
  const failedCount = checks.filter((check) => !check.passed).length + failuresOutsideChecks.length;
  const totalCount = checks.length + failuresOutsideChecks.length;
  console.log(failedCount === 0 ? 'PASSED' : `FAILED ${failedCount} of ${totalCount} checks`);
  return failedCount === 0;
}

async function start() {
  const run = await startApp();
  console.log(`Astra is running.\nweb ${getWebUrl(run)}\napi ${getApiUrl(run)}\nlog ${run.logPath}`);
  return true;
}

async function doctor() {
  const run = requireRun();
  const appChecks = await getAppChecks(run);
  if (!appChecks.every((check) => check.passed)) return reportChecks(appChecks);
  const pageChecks = await getPageChecks({ baseURL: getWebUrl(run), productName: getProductName() });
  return reportChecks([...appChecks, ...pageChecks]);
}

async function drivePlan(plan) {
  const run = await getHealthyRun();
  const results = await driveJourney({ ...plan, run });
  await waitForStrayRejections();
  const { evidenceDir } = plan;
  saveFinalScreenshots({ results, evidenceDir, hasFailureOutsideChecks: failuresOutsideChecks.length > 0 });
  return reportChecks(results.flatMap((result) => result.checks));
}

async function drive(options) {
  return drivePlan(clearImagesAndPlanDrive(options));
}

async function runOnce(options) {
  const plan = clearImagesAndPlanDrive(options);
  await start();
  try {
    return await drivePlan(plan);
  } finally {
    await stop();
  }
}

async function stop() {
  const stopped = await stopApp();
  console.log(stopped ? 'Astra is stopped. Nothing is left running.' : 'Nothing to stop.');
  return true;
}

const COMMANDS = { start, doctor, drive, run: runOnce, stop };

function watchFailuresOutsideChecks(command) {
  // Node raises an unhandled rejection as an uncaught exception, so this one listener sees both.
  process.on('uncaughtException', addStrayError);
  const cleanUp = command === runOnce ? stopApp : async () => {};
  let isInterrupted = false;
  // pnpm forwards the terminal's Ctrl-C, so one key press arrives twice, and a signal with no listener kills the cleanup.
  const handleInterrupt = (signal) => {
    if (isInterrupted) return;
    isInterrupted = true;
    addFailureOutsideChecks(`interrupted by ${signal}`);
    cleanUp()
      .catch((error) => console.error(stripVTControlCharacters(error.message)))
      .finally(() => process.exit(1));
  };
  for (const signal of INTERRUPT_SIGNALS) process.on(signal, handleInterrupt);
}

async function main() {
  const { positionals, values } = parseArgs({ options: CLI_OPTIONS, allowPositionals: true });
  const command = COMMANDS[positionals[0]];
  if (!command) throw new Error(USAGE);
  watchFailuresOutsideChecks(command);
  return command(values);
}

// An explicit exit, because a journey's leftover timer must not hold the process open.
main()
  .catch((error) => {
    console.error(stripVTControlCharacters(error.message));
    return false;
  })
  .then((passed) => process.exit(passed && failuresOutsideChecks.length === 0 ? 0 : 1));
