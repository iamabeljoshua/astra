import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('what the docs promise about the tutor', () => {
  it('does not call a working tutor a stand-in', () => {
    expect(read('README.md')).not.toMatch(/stand-in until the model arrives/);
  });

  it('says the math check is partial, and that text commands are not checked', () => {
    const doc = read('docs/tests/tutor-model.md');
    expect(doc).not.toContain('**Drawn math is checked.**');
    expect(doc).toMatch(/math inside a `text` command/);
    expect(doc).toContain('`unknown`');
  });

  it('holds the evaluation to what it really fails on', () => {
    const doc = read('docs/architecture/live-session.md');
    expect(doc).not.toMatch(/the evaluation fails any turn over 1 s/);
    expect(doc).not.toMatch(/\| M3\.7 \| B2 has a guard only in the prompt today/);
    expect(read('apps/agent/src/tutor/eval/run-eval.ts')).toMatch(/beatsThatDoNotParse > 0 \|\| summary\.tags > 0 \|\| summary\.silentTurns > 0 \|\| summary\.safetyChecksFailed\.length > 0/);
  });

  it('states what claims give up, and refusals by category', () => {
    const doc = read('docs/tests/tutor-model.md');
    expect(doc).toMatch(/What this design gives up/);
    expect(doc).toMatch(/`bio` 12, `reasoning_extraction` 10, and `cyber` 2/);
    expect(doc).not.toMatch(/No real refusal happened/);
    expect(doc).not.toMatch(/about 2,100 tokens/);
    expect(doc).not.toMatch(/a very fast first turn/);
  });

  it('states the first turn truly in the latency numbers', () => {
    expect(read('docs/tests/tutor-model.md')).toMatch(/With the first turn counted, first real word heard is 6695 ms at p95/);
  });
});
