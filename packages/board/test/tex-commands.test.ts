import { ALLOWED_TEX_COMMANDS } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { canRenderTex } from '../src/math/tex-check.ts';

const NEEDS_ITS_OWN_SHAPE: Readonly<Record<string, string>> = {
  '\\left': String.raw`\left( x \right)`,
  '\\right': String.raw`\left( x \right)`,
  '\\begin': String.raw`\begin{matrix} x \end{matrix}`,
  '\\end': String.raw`\begin{matrix} x \end{matrix}`,
  '\\limits': String.raw`\sum\limits_{a}^{b}`,
  '\\nolimits': String.raw`\sum\nolimits_{a}^{b}`,
  '\\not': String.raw`x \not= y`,
  '\\big': String.raw`\big( x \big)`,
  '\\Big': String.raw`\Big( x \Big)`,
  '\\bigg': String.raw`\bigg( x \bigg)`,
  '\\Bigg': String.raw`\Bigg( x \Bigg)`,
  '\\bigl': String.raw`\bigl( x \bigr)`,
  '\\bigr': String.raw`\bigl( x \bigr)`,
  '\\Bigl': String.raw`\Bigl( x \Bigr)`,
  '\\Bigr': String.raw`\Bigl( x \Bigr)`,
  '\\biggl': String.raw`\biggl( x \biggr)`,
  '\\biggr': String.raw`\biggl( x \biggr)`,
  '\\Biggl': String.raw`\Biggl( x \Biggr)`,
  '\\Biggr': String.raw`\Biggl( x \Biggr)`,
  '\\substack': String.raw`\sum_{\substack{a \\ b}} x`,
};

function getSample(command: string): string {
  return NEEDS_ITS_OWN_SHAPE[command] ?? `${command}{a}{b}`;
}

describe('the commands the scene language lets through', () => {
  it.each([...ALLOWED_TEX_COMMANDS])('%s is one KaTeX can set, so a dead name cannot reach a student as a refusal', (command) => {
    expect(canRenderTex(getSample(command))).toBe(true);
  });
});
