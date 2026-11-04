import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCodeProblems, getPlanProblems } from '../src/scenes/content-check.ts';
import type { LessonPlan } from '../src/scenes/scene-types.ts';

const PLAN: LessonPlan = { opening: [{ say: 'A derivative measures how fast something changes.' }], more: [{ say: 'Think of the speed dial in a car.' }], setup: 'Watch the line.', narration: '[[a]] Here is the derivative. [[b]] It is the slope.', plan: 'a: the curve\nb: the tangent', close: 'What happens at the bottom?' };
const TOPIC = 'What a derivative really measures';

describe('the code check on what a tutor says', () => {
  it('passes a plain lesson', () => {
    expect(getPlanProblems(TOPIC, PLAN)).toEqual([]);
  });

  it.each([
    ['a named person', { opening: [{ say: 'Jane Doe got this wrong on her test.' }] }],
    ['an insult', { close: 'Why is your teacher such an idiot?' }],
    ['an accusation', { more: [{ say: 'And that one is a cheat.' }] }],
    ['an address', { setup: 'Write to ada@example.com.' }],
    ['a link', { plan: 'a: go to https://example.com' }],
    ['a phone number', { opening: [{ say: 'Call 5551234567 for the answer.' }] }],
    ['words from a topic in another alphabet', { narration: '[[a]] джейн доу обманщица. [[b]] Она лжёт.' }],
    ['a whole plan off the topic', { opening: [{ say: 'Soup needs salt.' }], more: [], setup: 'Stir it.', narration: '[[a]] Add water. [[b]] Add salt.', plan: 'a: pot\nb: spoon', close: 'Is it hot?' }],
  ] as [string, Partial<LessonPlan>][])('refuses %s', (_name, fields) => {
    expect(getPlanProblems(TOPIC, { ...PLAN, ...fields }).length).toBeGreaterThan(0);
  });

  it('allows a theorem named for a person, and a planet at the start of a line', () => {
    expect(getPlanProblems('Why Pythagoras was right', { ...PLAN, opening: [{ say: "Pythagoras showed this, and Euler's formula builds on it." }] })).toEqual([]);
    expect(getPlanProblems('How the Moon turns', { ...PLAN, opening: [{ say: 'Watch Earth as the Moon goes around it.' }] })).toEqual([]);
  });

  it.each(readdirSync(resolve(import.meta.dirname, 'fixtures/saved-plans')))('passes a real saved plan: %s', (file) => {
    const { topic, plan } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/saved-plans', file), 'utf8')) as { topic: string; plan: LessonPlan };
    expect(getPlanProblems(topic, plan)).toEqual([]);
  });
});

describe('the code check on what a scene draws', () => {
  it('passes real drawing code', () => {
    expect(getCodeProblems("self.part('curve', ax.plot(f, color=C.blue))\nlabel = ui('slope ' + num(2), 28)\nformula(r'\\alpha + \\pi')\nui('θ → π')")).toEqual([]);
  });

  it.each(["ui('Jane is a cheat')", "ui('what an idiot')", "ui('джейн доу обманщица')", "ui('ada@example.com')", "ui('see https://example.com')"])('refuses %s', (code) => {
    expect(getCodeProblems(code).length).toBeGreaterThan(0);
  });
});
