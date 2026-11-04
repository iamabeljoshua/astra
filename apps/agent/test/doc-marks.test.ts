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

  describe('voice.md', () => {
    const doc = readFileSync(join(REPO_ROOT, 'docs/tests/voice.md'), 'utf8');
    const results = JSON.parse(readFileSync(join(REPO_ROOT, 'docs/tests/voice-results.json'), 'utf8')) as { joinTiming?: unknown; safetyProofs?: unknown };
    const isIn = (raw: unknown, figure: string) => new RegExp(`(?<![\\d.])${figure}(?!\\d)`).test(JSON.stringify(raw) ?? '');

    it('has the raw run behind every figure of the first word table in voice-results.json', () => {
      const table = doc.slice(doc.indexOf('## How long the first word takes'), doc.indexOf('So a student who presses'));
      const figures = table.split('\n').filter((line) => line.startsWith('|')).flatMap((line) => line.match(/(?<![\w.])\d{3,}(?![\w])/g) ?? []);
      expect(figures.length).toBeGreaterThan(50);
      expect(figures.filter((figure) => !isIn(results.joinTiming, figure))).toEqual([]);
    });

    it('has the raw run behind the proofs of a finish, a killed job, and a quiet room', () => {
      expect(['1693', '2841', '19778', '24840', '5270', '5709', '540450', '600342', '5813'].filter((figure) => !isIn(results.safetyProofs, figure))).toEqual([]);
    });
  });
});
