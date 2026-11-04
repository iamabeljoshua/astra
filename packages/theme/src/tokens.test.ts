import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const themeCss = readRepoFile('packages/theme/src/theme.css');
const designDoc = readRepoFile('docs/DESIGN.md');

const designTokens = [
  ...designDoc.matchAll(/^\| `([a-z0-9-]+)` \|[^|]+\| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|$/gm),
].map(([, name, light, dark]) => ({ name, light, dark }));

function getColorsInBlock(blockStart: string) {
  const block = themeCss.slice(themeCss.indexOf(blockStart));
  const colors = block.slice(0, block.indexOf('}')).matchAll(/--color-([a-z0-9-]+): (#[0-9A-F]{6});/g);
  return Object.fromEntries([...colors].map(([, name, value]) => [name, value]));
}

describe('theme tokens', () => {
  it('finds every token in the design doc table', () => {
    expect(designTokens.map((token) => token.name)).toEqual(['paper', 'panel', 'ink', 'ink-2', 'line', 'accent', 'pen']);
  });

  it('matches the design doc in light', () => {
    const expected = Object.fromEntries(designTokens.map((token) => [token.name, token.light]));
    expect(getColorsInBlock('@theme static')).toEqual(expected);
  });

  it('matches the design doc in dark', () => {
    const expected = Object.fromEntries(designTokens.map((token) => [token.name, token.dark]));
    expect(getColorsInBlock(":root[data-theme='dark']")).toEqual(expected);
  });

  it('draws the favicon dot in the ink color of each theme', () => {
    const favicon = readRepoFile('apps/web/public/favicon.svg');
    const inkToken = designTokens.find((token) => token.name === 'ink');

    expect(favicon).toContain(`fill: ${inkToken?.light}`);
    expect(favicon).toContain(`fill: ${inkToken?.dark}`);
  });
});
