#!/usr/bin/env node
// Usage: node mutation-checks.mjs <repo-dir>. Breaks one thing at a time, confirms the named gate fails for that reason, and restores the file.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2];
const web = (file) => ['pnpm', ['--filter', '@astra/web', 'exec', 'vitest', 'run', file]];
const theme = (file) => ['pnpm', ['--filter', '@astra/theme', 'exec', 'vitest', 'run', file]];
const lint = ['pnpm', ['lint']];
const sidebar = 'apps/web/src/shell/Sidebar.tsx';
const shell = 'apps/web/src/shell/AppShell.tsx';
const home = 'apps/web/src/shell/EmptyHomePage.tsx';
const css = 'packages/theme/src/theme.css';

const MUTATIONS = [
  ['pre-paint script reads another key', 'apps/web/index.html', "getItem('theme')", "getItem('color-theme')", web('src/theme/theme.test.ts'), 'applies a saved dark choice'],
  ['pre-paint script moved below the stylesheet', 'apps/web/index.html', '<script>\n      // Runs', '<link rel="stylesheet" href="/x.css" /><script>\n      // Runs', web('src/theme/theme.test.ts'), 'sits in the head'],
  ['toggle stops saving', 'apps/web/src/theme/theme.ts', 'localStorage.setItem(THEME_STORAGE_KEY, theme);', '', web('src/theme/theme.test.ts'), 'keeps the choice for the next load'],
  ['toggle stops applying', 'apps/web/src/theme/theme.ts', 'document.documentElement.dataset.theme = theme;', '', web('src/theme/theme.test.ts'), 'switches the page'],
  ['blocked storage breaks the toggle', 'apps/web/src/theme/theme.ts', '} catch {\n    // Blocked storage only loses the saved choice.\n  }', '} finally {\n  }', web('src/theme/theme.test.ts'), 'still switches the page'],
  ['sidebar ignores new MENU entries', sidebar, 'MENU.map((item)', 'MENU.slice(0, 2).map((item)', web('src/shell/Sidebar.test.tsx'), 'renders a row and a page'],
  ['routes ignore new MENU entries', shell, 'MENU.map(({ path, Page })', 'MENU.slice(0, 2).map(({ path, Page })', web('src/shell/Sidebar.test.tsx'), 'renders a row and a page'],
  ['unknown address shows nothing', shell, '<Route path="*" element={<Navigate to="/" replace />} />', '', web('src/shell/Sidebar.test.tsx'), 'opens Home for an address'],
  ['choosing a row leaves the menu open', sidebar, 'onClick={onChoosePage}', '', web('src/shell/Sidebar.test.tsx'), 'closes and returns focus to the Menu button when a row'],
  ['Escape does nothing', shell, "if (event.key === 'Escape') closeMenu();", '', web('src/shell/Sidebar.test.tsx'), 'on Escape'],
  ['closing moves focus even with the menu closed', shell, 'if (!isMenuOpen) return;', '', web('src/shell/Sidebar.test.tsx'), 'leaves focus alone'],
  ['recent section missing', sidebar, '<RecentSessions />', '', web('src/shell/Sidebar.test.tsx'), 'an empty Recent section'],
  ['literal text in the sidebar', sidebar, '{SIDEBAR_LABELS.recent}', 'Recent', web('src/strings.test.ts'), 'supplies all the text'],
  ['literal aria-label in the sidebar', sidebar, 'aria-label={SIDEBAR_LABELS.menu}', 'aria-label="Menu"', web('src/strings.test.ts'), 'supplies all the text'],
  ['literal browser tab title', shell, '<title>{PRODUCT_NAME}</title>', '<title>Astra</title>', web('src/strings.test.ts'), 'changes the product name'],
  ['product name written into the page source', 'apps/web/index.html', '<head>', '<head><title>Astra</title>', web('src/strings.test.ts'), 'only place in the page source'],
  ['API line dropped from Home', home, '{API_CONNECTION_LABELS[apiConnection]}', '', web('src/App.test.tsx'), 'says the API is connected'],
  ['light token drifts from the design doc', css, '--color-paper: #F6F1E6;', '--color-paper: #F6F1E7;', theme('src/tokens.test.ts'), 'matches the design doc in light'],
  ['dark token drifts from the design doc', css, '--color-accent: #FFCC94;', '--color-accent: #FFCC95;', theme('src/tokens.test.ts'), 'matches the design doc in dark'],
  ['favicon stops matching ink', 'apps/web/public/favicon.svg', 'fill: #FFFBF5', 'fill: #FFFFFF', theme('src/tokens.test.ts'), 'favicon dot'],
  ['lint rule switched off for components', 'eslint.config.mjs', "rules: { 'theme/no-literal-colors': 'error' },\n  },\n  {\n    files: ['apps/web/src/**/*.css']", "rules: { 'theme/no-literal-colors': 'off' },\n  },\n  {\n    files: ['apps/web/src/**/*.css']", theme('eslint/no-literal-colors.test.ts'), 'rejects'],
  ['hex color in a component fails pnpm lint', sidebar, 'font-medium text-ink-2 hover:text-ink', 'font-medium text-[#5F574C] hover:text-ink', lint, 'no-literal-colors'],
  ['named color in a component fails pnpm lint', 'apps/web/src/shell/EmptySessionsPage.tsx', '<h1 className="text-title font-semibold">', '<h1 style={{ color: \'tomato\' }}>', lint, 'no-literal-colors'],
  ['hex color in app CSS fails pnpm lint', 'apps/web/src/theme/app.css', "@import 'tailwindcss';", "@import 'tailwindcss';\n.example { color: #ff0000; }", lint, 'no-literal-colors'],
  ['literal text in a component fails pnpm lint', sidebar, '{SIDEBAR_LABELS.recent}', 'Recent', lint, 'strings.ts'],
  ['literal aria-label fails pnpm lint', sidebar, 'aria-label={SIDEBAR_LABELS.menu}', 'aria-label="Menu"', lint, 'strings.ts'],
];

let failures = 0;
for (const [name, file, from, to, [command, args], expected] of MUTATIONS) {
  const path = join(repo, file);
  const original = readFileSync(path, 'utf8');
  if (!original.includes(from)) {
    failures += 1;
    console.log(`NOT APPLIED  ${name}: text not found in ${file}`);
    continue;
  }
  writeFileSync(path, original.replace(from, to));
  const run = spawnSync(command, args, { cwd: repo, encoding: 'utf8' });
  writeFileSync(path, original);
  const output = `${run.stdout}\n${run.stderr}`;
  const failLine = output.split('\n').find((line) => (/FAIL|×|error/.test(line)) && line.includes(expected));
  const caught = run.status !== 0 && Boolean(failLine);
  if (!caught) failures += 1;
  console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${name}\n        ${(failLine ?? output.slice(-400)).trim().slice(0, 180)}`);
}
console.log(`\n${failures === 0 ? `ALL ${MUTATIONS.length} CAUGHT` : `${failures} NOT CAUGHT`}`);
process.exit(failures === 0 ? 0 : 1);
