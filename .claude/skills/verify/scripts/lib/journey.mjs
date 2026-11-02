import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { getWebUrl } from './app.mjs';
import { getIdentityCheck, launchBrowser, watchPageFailures } from './browser.mjs';
import { getProductName, JOURNEYS_DIR, TIMEOUTS_MS, VIEWPORTS } from './settings.mjs';

async function loadJourney(nameOrPath) {
  const givenPath = resolve(nameOrPath);
  const path = existsSync(givenPath) ? givenPath : join(JOURNEYS_DIR, `${nameOrPath}.mjs`);
  if (!existsSync(path)) throw new Error(`No journey "${nameOrPath}". Looked in ${JOURNEYS_DIR}.`);
  const { default: drive } = await import(pathToFileURL(path));
  return { name: basename(path, '.mjs'), drive };
}

export function parseViewportNames(commaSeparatedNames) {
  const names = commaSeparatedNames.split(',');
  const unknown = names.filter((name) => !(name in VIEWPORTS));
  if (unknown.length > 0) {
    throw new Error(`Unknown viewport ${unknown.join(', ')}. Use ${Object.keys(VIEWPORTS).join(', ')}.`);
  }
  return names;
}

async function saveScreenshot({ page, evidenceDir, fileStem }) {
  const path = join(evidenceDir, `${fileStem}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  console.log(`saved ${path}`);
}

function getSingleLine(playwrightMessage) {
  return stripVTControlCharacters(playwrightMessage).replace(/\s*\n\s*/g, ' ').trim();
}

async function getJourneyCheck(run) {
  try {
    await run();
    return { name: 'journey', passed: true, detail: 'finished' };
  } catch (error) {
    return { name: 'journey', passed: false, detail: getSingleLine(error.message) };
  }
}

async function driveViewport({ browser, baseURL, journey, viewportName, evidenceDir, productName }) {
  const context = await browser.newContext({ ...VIEWPORTS[viewportName], baseURL });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUTS_MS.pageAction);
  const pageFailures = watchPageFailures(page);
  const fileStem = `${journey.name}-${viewportName}`;
  const capture = (label) =>
    saveScreenshot({ page, evidenceDir, fileStem: `${fileStem}-${label}` });

  const journeyCheck = await getJourneyCheck(() =>
    journey.drive({ page, capture, viewportName, productName }),
  );
  const identityCheck = await getIdentityCheck(page, productName);
  const checks = [journeyCheck, identityCheck, ...pageFailures];
  const passed = checks.every((check) => check.passed);
  await saveScreenshot({ page, evidenceDir, fileStem: passed ? fileStem : `${fileStem}-failed` });
  await context.close();
  return checks.map((check) => ({ ...check, name: `${viewportName} ${check.name}` }));
}

export async function driveJourney({ run, journeyName, viewportNames, evidenceDir }) {
  const journey = await loadJourney(journeyName);
  mkdirSync(evidenceDir, { recursive: true });
  const shared = { journey, evidenceDir, baseURL: getWebUrl(run), productName: getProductName() };
  const browser = await launchBrowser();
  try {
    const checks = [];
    for (const viewportName of viewportNames) {
      checks.push(...(await driveViewport({ ...shared, browser, viewportName })));
    }
    return checks;
  } finally {
    await browser.close();
  }
}
