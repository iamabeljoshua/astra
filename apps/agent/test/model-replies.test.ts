import { describe, expect, it } from 'vitest';
import { getPlanFromText } from '../src/scenes/lesson/lesson-plan.ts';
import { getRouteFromText, getVerdictFromText } from '../src/scenes/model-replies.ts';

const route = (fields: object) => getRouteFromText(JSON.stringify(fields));

describe('the router reply', () => {
  it('reads an engine, a kind, and a topic, around any text', () => {
    expect(getRouteFromText('Sure: {"kind":"graph","engine":"manimgx","topic":"what a derivative measures"}')).toEqual({ engine: 'manimgx', kind: 'graph', topic: 'what a derivative measures' });
  });

  it('gives no scene for an engine it does not know', () => {
    expect(route({ kind: 'graph', engine: 'video', topic: 'slopes' }).engine).toBe('none');
  });

  it.each(['why my for loop stops', 'what I got wrong on slopes', 'ada@example.com asks about slopes', 'call 5551234 about slopes', 'see https://example.com'])('gives no scene when the topic points at a person: %s', (topic) => {
    expect(route({ kind: 'graph', engine: 'manimgx', topic })).toEqual({ engine: 'none', kind: 'graph', topic: '' });
  });

  it('gives no scene when no topic comes back', () => {
    expect(route({ kind: 'graph', engine: 'manimgx' }).engine).toBe('none');
  });

  it('throws on a reply with no JSON, which the desk treats as no scene', () => {
    expect(() => getRouteFromText('The capital of Canada is Ottawa.')).toThrow();
  });
});

describe('the reviewer reply', () => {
  it('passes only a clear pass', () => {
    expect(getVerdictFromText('{"verdict":"pass","errors":[]}').isPass).toBe(true);
  });

  it('fails a pass that lists errors', () => {
    expect(getVerdictFromText('{"verdict":"pass","errors":[{"what":"the slope is wrong"}]}').isPass).toBe(false);
  });

  it('fails anything else it can read', () => {
    expect(getVerdictFromText('{"verdict":"looks fine"}').isPass).toBe(false);
  });

  it('throws on no JSON, which the maker treats as a failed review', () => {
    expect(() => getVerdictFromText('Looks good to me.')).toThrow();
  });
});

describe('the lesson plan', () => {
  const PLAN = { opening: [{ say: 'A derivative measures change.', tex: 'y = x^2' }], setup: 'Watch the point.', narration: '[[curve]] Here is the curve. [[point]] Pick a point on it.', plan: 'curve: draw it\npoint: mark it', close: 'What happens next?' };
  const parse = (fields: object) => getPlanFromText(JSON.stringify({ ...PLAN, ...fields }));

  it('reads a good plan', () => {
    expect(parse({}).opening[0]).toEqual({ say: 'A derivative measures change.', tex: 'y = x^2' });
  });

  it('drops math the board would refuse, and keeps the words', () => {
    expect(parse({ opening: [{ say: 'Here it is.', tex: String.raw`\href{x}{y}` }] }).opening[0]).toEqual({ say: 'Here it is.' });
  });

  it('refuses narration with too few marks, a repeated mark, or too many words', () => {
    expect(() => parse({ narration: '[[curve]] Only one mark.' })).toThrow(/too few marks/);
    expect(() => parse({ narration: '[[curve]] One [[curve]] two.' })).toThrow(/repeats a mark/);
    expect(() => parse({ narration: `[[a]] ${'word '.repeat(40)}[[b]] ${'word '.repeat(40)}` })).toThrow(/too long/);
  });

  it('refuses a plan with no opening or no closing question', () => {
    expect(() => parse({ opening: [] })).toThrow(/no opening/);
    expect(() => parse({ close: '' })).toThrow(/closing question/);
  });
});
