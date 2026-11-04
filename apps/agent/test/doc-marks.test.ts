import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const UNFILLED_MARK = /@@[A-Z][A-Z0-9_]*@@/g;

function getMarkdownFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return getMarkdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

describe('the docs', () => {
  it('ship with no number still waiting to be filled in, like @@THIS_MARK@@', () => {
    const files = [...getMarkdownFiles(join(REPO_ROOT, 'docs')), join(REPO_ROOT, 'README.md')];
    const marks = files.flatMap((file) => (readFileSync(file, 'utf8').match(UNFILLED_MARK) ?? []).map((mark) => `${relative(REPO_ROOT, file)}: ${mark}`));
    expect(files.length).toBeGreaterThan(10);
    expect(marks).toEqual([]);
  });
});
