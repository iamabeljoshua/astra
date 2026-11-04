import { describe, expect, it } from 'vitest';
import { getFirstLineFromPartialText, getPlanFromText, getSceneWordsFromPartialText } from '../src/scenes/lesson/lesson-plan.ts';
import { PlanRefused } from '../src/scenes/scene-types.ts';
import { getClearedNames, getRouteFromText, getVerdictFromText } from '../src/scenes/model-replies.ts';

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
    expect(() => parse({ narration: `[[a]] ${'word '.repeat(60)}. [[b]] ${'word '.repeat(60)}.` })).toThrow(/too long/);
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

describe('a plan that runs long', () => {
  const WHOLE = { opening: [{ say: 'A line.' }], setup: 'Look.', narration: '[[a]] One. [[b]] Two.', plan: 'a: x\nb: y', close: 'Why?' };
  const parse = (fields: object) => getPlanFromText(JSON.stringify({ ...WHOLE, ...fields }));

  it('keeps a long take to whole sentences rather than throwing, as Van Gogh and perspective did', () => {
    const narration = `[[a]] ${'word '.repeat(40).trim()}. [[b]] ${'word '.repeat(40).trim()}. [[c]] ${'word '.repeat(40).trim()}.`;
    const plan = parse({ narration, plan: 'a: one\nb: two\nc: three' });
    expect(plan.narration).toContain('[[b]]');
    expect(plan.narration).not.toContain('[[c]]');
    expect(plan.plan).toBe('a: one\nb: two');
  });

  it('takes a line of any length, because the lesson splits it into breaths when it speaks', () => {
    expect(parse({ opening: [{ say: 'word '.repeat(60).trim() }] }).opening).toHaveLength(1);
  });

  it('reads a planner that says a tutor should not teach this', () => {
    expect(() => getPlanFromText('{"refused":true}')).toThrow(PlanRefused);
    expect(() => getPlanFromText('{"refused":"dangerous"}')).toThrow(expect.objectContaining({ wantsHelp: false }));
    expect(() => getPlanFromText('{"refused":"help"}')).toThrow(expect.objectContaining({ wantsHelp: true }));
  });

  it('reads a first line that comes before the scene words, and joins it to the rest of the opening', () => {
    expect(getFirstLineFromPartialText('{"first":{"say":"The first line."},"setup":"Lo')).toEqual({ say: 'The first line.' });
    const plan = getPlanFromText(JSON.stringify({ first: { say: 'The first line.' }, setup: 'Look.', narration: '[[a]] One. [[b]] Two.', plan: 'a: x\nb: y', opening: [{ say: 'The second line.' }], close: 'Why?' }));
    expect(plan.opening).toEqual([{ say: 'The first line.' }, { say: 'The second line.' }]);
  });

  it('hands over the scene words as soon as they are whole, before the rest of the plan', () => {
    expect(getSceneWordsFromPartialText('{"opening":[{"say":"Hi."}],"setup":"Look.","narration":"[[a]] One. [[b]] Two.","pl')).toBeNull();
    expect(getSceneWordsFromPartialText('{"opening":[{"say":"Hi."}],"setup":"Look.","narration":"[[a]] One. [[b]] Two.","plan":"a: x\\nb: y","mo')).toEqual({ narration: '[[a]] One. [[b]] Two.', plan: 'a: x\nb: y' });
  });

  it('does not mistake quoted words in a line for the plan', () => {
    expect(getSceneWordsFromPartialText('{"opening":[{"say":"The word \\"plan\\": see it."}],"narration":"[[a]] One. [[b]] Two."')).toBeNull();
  });
});

describe('a review that cleared its own finding', () => {
  it('passes when the only finding worked out to be fine, as "So the direction is correct" did on quadratics', () => {
    expect(getVerdictFromText(JSON.stringify({ verdict: 'fail', errors: [{ moment: 'a', what: 'So the direction is correct.', truth: 'It is right.', confidence: 'medium', stillWrong: false }] })).isPass).toBe(true);
  });

  it('still fails on a finding that stands beside one that cleared itself', () => {
    const verdict = getVerdictFromText(JSON.stringify({ verdict: 'fail', errors: [{ moment: 'a', what: 'Fine after all.', truth: '', confidence: 'medium', stillWrong: false }, { moment: 'b', what: 'The label says 3 and it is 2.', truth: '2', confidence: 'high', stillWrong: true }] }));
    expect(verdict.isPass).toBe(false);
    expect(verdict.errors.map(({ what }) => what)).toEqual(['The label says 3 and it is 2.']);
  });

  it('still fails a fail with no findings, because that verdict cannot be read as a pass', () => {
    expect(getVerdictFromText(JSON.stringify({ verdict: 'fail', errors: [] })).isPass).toBe(false);
  });
});

describe('a reader reply about names', () => {
  it('clears places, events, things, and figures, and nothing else', () => {
    const names = ['Pacific Ocean', 'Cold War', 'Great Wall', 'Marie Curie', 'Sam Okoro', 'Lincoln High'];
    const kinds = ['place', 'event', 'thing', 'figure', 'person', 'private'];
    expect([...getClearedNames(names, JSON.stringify({ names: names.map((name, index) => ({ name, kind: kinds[index] })) }))]).toEqual(['Pacific Ocean', 'Cold War', 'Great Wall', 'Marie Curie']);
  });

  it('clears no name it was not asked about', () => {
    expect([...getClearedNames(['Sam Okoro'], JSON.stringify({ names: [{ name: 'Sam Okoro Junior', kind: 'place' }] }))]).toEqual([]);
  });

  it('reads a reply it cannot parse as clearing nothing', () => {
    expect([...getClearedNames(['Pacific Ocean'], 'sure, that is an ocean')]).toEqual([]);
  });
});

describe('a router reply about a request a tutor should not teach', () => {
  it('reads the dangerous kind, with no engine and no topic, whatever else it holds', () => {
    expect(getRouteFromText(JSON.stringify({ kind: 'dangerous', engine: 'manimgx', topic: 'making thermite' }))).toEqual({ engine: 'none', kind: 'dangerous', topic: '' });
  });

  it('reads the safety kind, with no engine and no topic, whatever else it holds', () => {
    expect(getRouteFromText(JSON.stringify({ kind: 'safety', engine: 'manimgx', topic: 'pill doses' }))).toEqual({ engine: 'none', kind: 'safety', topic: '' });
  });
});
