import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_IMPORT = /^(?:import|export)\s+(?!type\b)(?:[^'"\n]*?\sfrom\s+)?'([^']+)'/gm;
const ROOT = resolve(import.meta.dirname, '.');

const resolveFile = (from: string, specifier: string) => ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((ending) => resolve(dirname(from), `${specifier}${ending}`)).find((path) => existsSync(path) && /\.tsx?$/.test(path));

function getLoadedAtSignIn(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const waiting = [entry];
  while (waiting.length > 0) {
    const file = waiting.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      if (!specifier?.startsWith('.')) packages.add(specifier as string);
      else {
        const next = resolveFile(file, specifier);
        if (next) waiting.push(next);
      }
    }
  }
  return packages;
}

describe('what the sign-in page downloads', () => {
  it('leaves the pen and the board to the session, so signing in stays light', () => {
    const packages = getLoadedAtSignIn(resolve(ROOT, 'main.tsx'));
    expect(packages).toContain('react');
    expect(packages).not.toContain('perfect-freehand');
    expect(packages).not.toContain('@astra/board/drawing');
  });
});
