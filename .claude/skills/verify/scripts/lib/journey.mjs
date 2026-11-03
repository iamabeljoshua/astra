import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { setImmediate as getNextEventLoopTurn, setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { getWebUrl } from './app.mjs';
import {
  getIdentityCheck,
  getMainRegionCheck,
  getScreenshotCheck,
  launchBrowser,
  watchContextFailures,
} from './browser.mjs';
import { getProductName, JOURNEYS_DIR, TIMEOUTS_MS, VIEWPORTS } from './settings.mjs';
import { createSignIn } from './sign-in.mjs';

function findJourneyPath(nameOrPath) {
  const givenPath = resolve(nameOrPath);
  const path = existsSync(givenPath) ? givenPath : join(JOURNEYS_DIR, `${nameOrPath}.mjs`);
  if (!existsSync(path)) throw new Error(`No journey "${nameOrPath}". Looked in ${JOURNEYS_DIR}.`);
  return path;
}

function getJourneyName(journeyPath) {
  return basename(journeyPath, '.mjs');
}

async function loadJourney(journeyPath) {
  const { default: drive, deadlineMs = TIMEOUTS_MS.journey } = await import(pathToFileURL(journeyPath));
  if (typeof drive !== 'function') throw new Error(`${journeyPath} needs a default export that is a function.`);
  return { name: getJourneyName(journeyPath), drive, deadlineMs };
}

function assertViewportsAreKnown(viewportNames) {
  const unknown = viewportNames.filter((name) => !(name in VIEWPORTS));
  if (unknown.length > 0) {
    throw new Error(`Unknown viewport ${unknown.join(', ')}. Use ${Object.keys(VIEWPORTS).join(', ')}.`);
  }
}

function clearEarlierImages({ journeyName, viewportNames, evidenceDir }) {
  mkdirSync(evidenceDir, { recursive: true });
  const fileStems = viewportNames.map((viewportName) => `${journeyName}-${viewportName}`);
  const isEarlierImage = (fileName) =>
    fileName.endsWith('.png') &&
    fileStems.some((fileStem) => fileName === `${fileStem}.png` || fileName.startsWith(`${fileStem}-`));
  for (const fileName of readdirSync(evidenceDir).filter(isEarlierImage)) {
    rmSync(join(evidenceDir, fileName));
  }
}

export function clearImagesAndPlanDrive({ journey, viewports, out }) {
  const viewportNames = viewports.split(',');
  clearEarlierImages({ journeyName: getJourneyName(journey), viewportNames, evidenceDir: out });
  assertViewportsAreKnown(viewportNames);
  return { journeyPath: findJourneyPath(journey), viewportNames, evidenceDir: out };
}

export function getSingleLine(playwrightMessage) {
  return stripVTControlCharacters(playwrightMessage).replace(/\s*\n\s*/g, ' ').trim();
}

async function withDeadline({ task, timeoutMs, description }) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${description} did not finish within ${timeoutMs} ms.`)), timeoutMs);
  });
  try {
    return await Promise.race([task, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function getJourneyCheck({ journey, page, capture, viewportName }) {
  try {
    await withDeadline({
      task: journey.drive({ page, capture, viewportName, signIn: createSignIn(page) }),
      timeoutMs: journey.deadlineMs,
      description: 'The journey',
    });
    return { name: 'journey', passed: true, detail: 'finished' };
  } catch (error) {
    return { name: 'journey', passed: false, detail: getSingleLine(error.message) };
  }
}

async function readFinalPage({ browser, page, productName }) {
  await sleep(TIMEOUTS_MS.settle);
  const identityCheck = await getIdentityCheck(page, productName);
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const screenshotCheck = await getScreenshotCheck({ browser, name: 'screenshot', screenshot });
  const mainRegionCheck = await getMainRegionCheck({ browser, page });
  return { finalChecks: [identityCheck, screenshotCheck, mainRegionCheck], screenshot };
}

async function getFinalPage(options) {
  try {
    return await withDeadline({
      task: readFinalPage(options),
      timeoutMs: TIMEOUTS_MS.finalPage,
      description: 'Reading the final page',
    });
  } catch (error) {
    return { finalChecks: [{ name: 'final page', passed: false, detail: getSingleLine(error.message) }] };
  }
}

async function driveViewport({ browser, baseURL, journey, viewportName, evidenceDir, productName }) {
  const context = await browser.newContext({ ...VIEWPORTS[viewportName], baseURL });
  context.setDefaultTimeout(TIMEOUTS_MS.pageAction);
  const contextFailures = watchContextFailures(context);
  const page = await context.newPage();
  const fileStem = `${journey.name}-${viewportName}`;
  const capture = async (label) => {
    const path = join(evidenceDir, `${fileStem}-${label}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    console.log(`saved ${path}`);
  };

  const journeyCheck = await getJourneyCheck({ journey, page, capture, viewportName });
  const { finalChecks, screenshot } = await getFinalPage({ browser, page, productName });
  await context.close();
  const checks = [journeyCheck, ...finalChecks, ...contextFailures];
  return { fileStem, screenshot, checks: checks.map((check) => ({ ...check, name: `${viewportName} ${check.name}` })) };
}

// A call the journey forgot to await rejects as its context closes, and Node reports that on a later turn.
export async function waitForStrayRejections() {
  await getNextEventLoopTurn();
}

export function saveFinalScreenshots({ results, evidenceDir, hasFailureOutsideChecks }) {
  for (const { fileStem, screenshot, checks } of results.filter((result) => result.screenshot)) {
    const passed = !hasFailureOutsideChecks && checks.every((check) => check.passed);
    const path = join(evidenceDir, `${fileStem}${passed ? '' : '-failed'}.png`);
    writeFileSync(path, screenshot);
    console.log(`saved ${path}`);
  }
}

export async function driveJourney({ run, journeyPath, viewportNames, evidenceDir }) {
  const journey = await loadJourney(journeyPath);
  const shared = { journey, evidenceDir, baseURL: getWebUrl(run), productName: getProductName() };
  const browser = await launchBrowser();
  const results = [];
  try {
    for (const viewportName of viewportNames) {
      results.push(await driveViewport({ ...shared, browser, viewportName }));
    }
  } finally {
    await browser.close();
  }
  return results;
}
