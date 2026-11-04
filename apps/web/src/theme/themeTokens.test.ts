import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '../../../..');
const THEME_CSS_PATH = 'packages/theme/src/theme.css';
const SOURCE_PATTERNS = ['apps/web/index.html', 'apps/web/src/**/*.{ts,tsx,css}', THEME_CSS_PATH];
const TOKEN_DEFINITION = /^\s*(--[a-z0-9-]+):/gm;
const UTILITY_PREFIX_BY_NAMESPACE: Record<string, string> = {
  '--text-': 'text-',
  '--leading-': 'leading-',
  '--spacing-': '[a-z:\\[-]+-',
  '--container-': '[a-z:\\[-]+-',
  '--grid-template-columns-': 'grid-cols-',
  '--animate-': 'animate-',
};

function readSources() {
  return globSync(SOURCE_PATTERNS, { cwd: REPO_ROOT })
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
    .map((path) => readFileSync(join(REPO_ROOT, path), 'utf8'))
    .join('\n');
}

function isTokenUsed(token: string, namespace: string, sources: string) {
  const name = token.slice(namespace.length);
  return new RegExp(`var\\(${token}\\b|(?<![\\w-])${UTILITY_PREFIX_BY_NAMESPACE[namespace]}${name}(?![\\w-])`).test(sources);
}

function getUnusedTokens() {
  const themeCss = readFileSync(join(REPO_ROOT, THEME_CSS_PATH), 'utf8');
  const sourcesWithoutDefinitions = readSources().replace(/^\s*--[a-z0-9-]+:\s*.*$/gm, (line) => line.slice(line.indexOf(':')));
  const tokens = [...themeCss.matchAll(TOKEN_DEFINITION)].map(([, token]) => token ?? '').filter((token) => !token.includes('--line-height'));
  return tokens.filter((token) => {
    const namespace = Object.keys(UTILITY_PREFIX_BY_NAMESPACE).find((prefix) => token.startsWith(prefix));
    return namespace && !isTokenUsed(token, namespace, sourcesWithoutDefinitions);
  });
}

describe('the theme', () => {
  it('has a use for every size token', () => {
    expect(getUnusedTokens()).toEqual([]);
  });
});
