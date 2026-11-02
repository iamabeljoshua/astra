import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REPO_ROOT = resolve(SKILL_ROOT, '../../..');
export const JOURNEYS_DIR = join(SKILL_ROOT, 'journeys');

const RUN_DIR = process.env.VERIFY_RUN_DIR ?? join(REPO_ROOT, '.verify');
export const RUN_STATE_PATH = join(RUN_DIR, 'run.json');
export const DEV_LOG_PATH = join(RUN_DIR, 'dev.log');
export const DEFAULT_EVIDENCE_DIR = join(RUN_DIR, 'evidence');

const STRINGS_PATH = join(REPO_ROOT, 'apps/web/src/strings.ts');
const PRODUCT_NAME_PATTERN = /PRODUCT_NAME\s*=\s*'([^']+)'/;

export const TIMEOUTS_MS = {
  appReady: 30_000,
  shutdownGrace: 10_000,
  httpProbe: 2_000,
  pageAction: 10_000,
  pageIdentity: 5_000,
  audioSignal: 3_000,
};

export const POLL_INTERVAL_MS = 150;

export const VIEWPORTS = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};

export function getProductName() {
  const match = readFileSync(STRINGS_PATH, 'utf8').match(PRODUCT_NAME_PATTERN);
  if (!match) throw new Error(`Cannot find PRODUCT_NAME in ${STRINGS_PATH}. Update settings.mjs.`);
  return match[1];
}
