import { describe, expect, it } from 'vitest';
import { MATH_CLAIMS, parseSceneCommand } from '../src/index.ts';

describe('what a line of math says it is', () => {
  it.each(MATH_CLAIMS)('takes %s on a written line and on a rewrite', (claim) => {
    expect(parseSceneCommand({ kind: 'writeMath', id: 'a', tex: 'x', claim })).toEqual({ ok: true, value: { kind: 'writeMath', id: 'a', tex: 'x', claim } });
    expect(parseSceneCommand({ kind: 'transformMath', target: 'a', tex: 'x', claim })).toEqual({ ok: true, value: { kind: 'transformMath', target: 'a', tex: 'x', claim } });
  });

  it('needs no claim', () => {
    expect(parseSceneCommand({ kind: 'writeMath', id: 'a', tex: 'x' }).ok).toBe(true);
  });

  it('refuses a word outside the closed set, and a claim on anything else', () => {
    expect(parseSceneCommand({ kind: 'writeMath', id: 'a', tex: 'x', claim: 'derivative' }).ok).toBe(false);
    expect(parseSceneCommand({ kind: 'hide', target: 'a', claim: 'step' }).ok).toBe(false);
  });
});
