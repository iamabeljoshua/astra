import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const prelude = readFileSync(resolve(REPO_ROOT, 'apps/scene-worker/worker/prelude.py'), 'utf8');
const themeCss = readFileSync(resolve(REPO_ROOT, 'packages/theme/src/theme.css'), 'utf8');

const TOKENS = { paper: '--color-paper', panel: '--color-panel', ink: '--color-ink', ink2: '--color-ink-2', line: '--color-line', accent: '--color-accent' };

const getCssColor = (css: string, name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
const getSceneColor = (theme: string, token: string) => prelude.match(new RegExp(`"${theme}": dict\\([^)]*\\b${token}="(#[0-9A-Fa-f]{6})"`))?.[1];

describe('the colors a take is drawn in', () => {
  const darkCss = themeCss.slice(themeCss.indexOf(":root[data-theme='dark']"));

  it.each(Object.entries(TOKENS))('match the app for %s in both themes', (token, cssName) => {
    expect(getSceneColor('light', token)).toBe(getCssColor(themeCss, cssName));
    expect(getSceneColor('dark', token)).toBe(getCssColor(darkCss, cssName));
  });
});
