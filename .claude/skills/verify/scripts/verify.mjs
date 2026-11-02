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
import { driveJourney, parseViewportNames } from './lib/journey.mjs';
import { DEFAULT_EVIDENCE_DIR, getProductName, VIEWPORTS } from './lib/settings.mjs';

const USAGE = `Usage: [WEB_PORT=<port>] [API_PORT=<port>] pnpm verify <command>
  start    Start Astra and wait until the web app and the API both answer.
  doctor   Check the running instance, its ports, the page identity, WebGL, and audio.
  drive    Drive a journey and save screenshots. Needs a running instance.
           --journey <name or path>   Default: home
           --viewports <names>        Default: ${Object.keys(VIEWPORTS).join(',')}
           --out <dir>                Default: ${DEFAULT_EVIDENCE_DIR}
  run      start, then drive, then stop. Takes the drive options.
  stop     Stop what start started. Safe to run twice.`;

const CLI_OPTIONS = {
  journey: { type: 'string', default: 'home' },
  viewports: { type: 'string', default: Object.keys(VIEWPORTS).join(',') },
  out: { type: 'string', default: DEFAULT_EVIDENCE_DIR },
};

function reportChecks(checks) {
  for (const { name, passed, detail } of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  }
  const failedCount = checks.filter((check) => !check.passed).length;
  console.log(failedCount === 0 ? 'PASSED' : `FAILED ${failedCount} of ${checks.length} checks`);
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

async function drive({ journey, viewports, out }) {
  const run = await getHealthyRun();
  const viewportNames = parseViewportNames(viewports);
  return reportChecks(
    await driveJourney({ run, journeyName: journey, viewportNames, evidenceDir: out }),
  );
}

async function runOnce(options) {
  await start();
  try {
    return await drive(options);
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

async function main() {
  const { positionals, values } = parseArgs({ options: CLI_OPTIONS, allowPositionals: true });
  const command = COMMANDS[positionals[0]];
  if (!command) throw new Error(USAGE);
  process.exitCode = (await command(values)) ? 0 : 1;
}

main().catch((error) => {
  console.error(stripVTControlCharacters(error.message));
  process.exitCode = 1;
});
