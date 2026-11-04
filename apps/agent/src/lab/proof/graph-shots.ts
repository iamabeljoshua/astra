/// <reference lib="dom" />
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { LESSONS, type LessonName } from '../lesson.ts';
import { openLabPage, type Theme, type ViewportName } from './lab-page.ts';
import { delay, REPO_ROOT, startLabStack } from './lab-stack.ts';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: '/tmp/m3-4-shots' }, lessons: { type: 'string', default: 'shot,graphs,number-line,triangle,free-body,launch,figure-hostile' }, viewport: { type: 'string', default: 'laptop' }, theme: { type: 'string', default: 'light' }, every: { type: 'string', default: '1500' } } });

const CHECKS_PATH = `/@fs${REPO_ROOT}/apps/agent/src/lab/proof/math-page-checks.ts`;

mkdirSync(args.out as string, { recursive: true });
const stack = await startLabStack();
const browser = await chromium.launch({ channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-mock-keychain', '--mute-audio'] });
try {
  for (const lesson of (args.lessons as string).split(',')) {
    const name = `${lesson}-${args.viewport}-${args.theme}`;
    const lab = await openLabPage({ browser, name, lesson: lesson as LessonName, viewport: args.viewport as ViewportName, theme: args.theme as Theme, outFolder: args.out as string, checksPath: CHECKS_PATH });
    await lab.page.addStyleTag({ content: '.tsqd-parent-container { display: none !important; }' });
    await lab.command({ type: 'play', lesson });
    const beats = LESSONS[lesson as LessonName][0]?.length ?? 0;
    let shot = 0;
    const isDone = () => lab.page.evaluate((count) => (window.sceneLab?.records.browserMessages.filter((message) => message.type === 'played').length ?? 0) >= count, beats);
    while (!(await isDone())) {
      await delay(Number(args.every));
      await lab.page.screenshot({ path: join(lab.folder, `s${String(shot).padStart(2, '0')}.png`) });
      shot += 1;
    }
    await delay(1500);
    await lab.page.screenshot({ path: join(lab.folder, 'final.png') });
    console.log(name, 'shots', shot, 'refused', await lab.page.evaluate(() => window.sceneLab?.records.refused ?? []));
    await lab.finish();
  }
} finally {
  await browser.close();
  stack.stop();
}
process.exit(0);
