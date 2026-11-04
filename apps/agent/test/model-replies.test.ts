import { describe, expect, it } from 'vitest';
import { getFirstLineFromPartialText, getPlanFromText } from '../src/scenes/lesson/lesson-plan.ts';
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

  it.each(['What does i squared equal?', "Euler's formula with e to the i pi", 'the number 100000', 'i to the fourth power', 'the imaginary unit i', 'what is the square root of negative one, i', '1000000 seconds in days', 'why 65536 is a power of two'])('keeps a scene for math that only looks personal: %s', (topic) => {
    expect(route({ kind: 'math', engine: 'manimgx', topic })).toEqual({ engine: 'manimgx', kind: 'math', topic });
  });

  it.each(['i am 14 and need help with slopes', 'what i did wrong on slopes', 'I got a bad grade on slopes', 'why i cannot do fractions', 'homework me and my friend share', '90210 tutoring on slopes', 'call 5551234567 about slopes', 'the number 5551234567', 'student 8675309 fractions', 'we learned slopes', "i'm stuck on slopes"])('still gives no scene when a topic points at a person: %s', (topic) => {
    expect(route({ kind: 'math', engine: 'manimgx', topic })).toEqual({ engine: 'none', kind: 'math', topic: '' });
  });

  it('gives no scene when no topic comes back', () => {
    expect(route({ kind: 'graph', engine: 'manimgx' }).engine).toBe('none');
  });

  it('throws on a reply with no JSON, which the desk treats as no scene', () => {
    expect(() => getRouteFromText('The capital of Canada is Ottawa.')).toThrow();
  });
});

describe('the reviewer reply', () => {
  it('reads the first whole object when a model adds more after it', () => {
    expect(getVerdictFromText('{"verdict":"pass","errors":[]}\nI also checked the {labels}.\n{"verdict":"fail"}').isPass).toBe(true);
  });

  it('is not fooled by braces inside a string', () => {
    expect(getVerdictFromText('{"verdict":"fail","errors":[{"what":"a label reads {x"}]}').errors).toHaveLength(1);
  });

  it('passes only a clear pass', () => {
    expect(getVerdictFromText('{"verdict":"pass","errors":[]}').isPass).toBe(true);
  });

  it('fails a pass that lists errors', () => {
    expect(getVerdictFromText('{"verdict":"pass","errors":[{"what":"the slope is wrong"}]}').isPass).toBe(false);
  });

  it('fails a clear fail, even one that gives no reasons', () => {
    expect(getVerdictFromText('{"verdict":"fail"}').isPass).toBe(false);
  });

  it('throws on a verdict it cannot read, because an unclear reply is an error and not a verdict', () => {
    expect(() => getVerdictFromText('{"verdict":"looks fine"}')).toThrow();
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

  it.each(['x^2^3', String.raw`\frac{1}`, `${'{'.repeat(40)}x${'}'.repeat(40)}`, `${'x+'.repeat(400)}x`])('drops math that parses but will not set, and keeps the words: %s', (tex) => {
    expect(parse({ opening: [{ say: 'Here it is.', tex }] }).opening[0]).toEqual({ say: 'Here it is.' });
  });

  it('keeps math the board can set', () => {
    expect(parse({ opening: [{ say: 'Here it is.', tex: String.raw`\frac{1}{2} x^2` }] }).opening[0]?.tex).toBe(String.raw`\frac{1}{2} x^2`);
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

describe('the first line of a plan still being written', () => {
  it('waits until the line is whole', () => {
    expect(getFirstLineFromPartialText('{"opening":[{"say":"A deriv')).toBeNull();
    expect(getFirstLineFromPartialText('{"openi')).toBeNull();
  });

  it('reads it as soon as it closes, with math that holds braces', () => {
    expect(getFirstLineFromPartialText(String.raw`{"opening":[{"say":"Here it is.","tex":"x^{2}"},{"say":"And`)).toEqual({ say: 'Here it is.', tex: 'x^{2}' });
  });
});
