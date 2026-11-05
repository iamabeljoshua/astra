import type { RecipeModels, SceneModels } from '../../providers/anthropic.scenes.ts';
import { getPlanFromText } from './lesson-plan.ts';

const FAKE_USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const WRITE_MS = Number(process.env.LESSON_FAKE_WRITE_MS ?? 2000);

const FAKE_PLAN = JSON.stringify({
  opening: [{ say: 'Think of a car, and the dial that tells you how fast it is going.', note: 'how fast, right now' }, { say: 'That dial reads a rate of change, at one moment.', tex: 'y = x^2' }],
  more: [{ say: 'A rate of change is what the steepness of a curve tells you at one point.' }, { say: 'Steeper means the value is changing faster right there.' }, { say: 'Flatter means it is hardly changing at all.' }],
  setup: 'Watch the line as it touches the curve.',
  narration: '[[curve]] Here is the curve, y equals x squared. [[point]] Pick a point on it. [[line]] Draw the line that just touches it there. [[slope]] Its steepness is the rate of change.',
  plan: 'curve: the parabola\npoint: a dot at x equals one\nline: the tangent at that dot\nslope: a label reading slope equals two',
  close: 'What happens to the steepness at the very bottom?',
});

const FAKE_CODE = `
def f(x):
    return x * x

class Lesson(Lesson2D):
    def construct(self):
        ax = m.Axes(x_range=[-2.5, 2.5, 1], y_range=[-1, 6, 1], x_length=7, y_length=5.5, axis_config={"color": C.ink2})
        self.until('curve')
        curve = self.part('curve', ax.plot(f, x_range=[-2.3, 2.3], color=C.blue))
        self.play(m.Create(ax), m.Create(curve), run_time=T['point'] - T['curve'] - 0.2)
        self.until('point')
        dot = self.part('point', m.Dot(ax.c2p(1, 1), color=C.accent))
        self.play(m.FadeIn(dot), run_time=0.5)
        self.until('line')
        line = self.part('line', m.Line(ax.c2p(0, -1), ax.c2p(2.4, 3.8), color=C.ink, stroke_width=3))
        self.play(m.Create(line), run_time=1.0)
        self.until('slope')
        label = ui('slope ' + num(2), 28).to_corner(m.UL)
        self.play(m.FadeIn(label), run_time=0.5)
        self.finish()
`;

const FAKE_KIT_CODE = `function scene(kit) {
  kit.stage('studio', {});
  const ball = kit.mesh({ id: 'ball', shape: 'sphere', size: 1, material: 'ceramic', color: '#c9b08a' });
  kit.shots([{ at: 0, move: 'cut', target: 'ball', distance: 5 }]);
  return { render(t) { ball.show(kit.env(t, 'curve', null, 1)); ball.scale(1 + kit.p(t, 'point') + kit.p(t, 'line') + kit.p(t, 'slope')); } };
}`;

const FAKE_DRAWING_CODE = `function scene(kit) {
  return { parts: ['sun'], render(t) {
    kit.sky({});
    kit.sun({ x: 640, y: 300, r: 90 * kit.env(t, 'look', null, 0.5) });
    kit.label('Sun', { x: 860, y: 200, to: { x: 700, y: 260 }, alpha: kit.env(t, 'why', null, 0.5) });
  } };
}`;

const getFakeDrawingText = (topic: string) =>
  [
    JSON.stringify({ t: 'fit', in: true, topic }),
    JSON.stringify({ t: 'say', m: 'look', text: 'So here is the sun, sitting up in a clear sky.' }),
    JSON.stringify({ t: 'say', m: 'why', text: 'And that label shows you where the light comes from.' }),
    '```js',
    FAKE_DRAWING_CODE,
    '```',
  ].join('\n');

const getFakeRecipeText = (topic: string) =>
  [
    { t: 'fit', in: true, topic, stage: 'space' },
    { t: 'say', m: 'stand', text: 'So this is a rocket on the pad, with two stages stacked up.' },
    { t: 'say', m: 'climb', text: 'The engines light, and it climbs because the gas goes down.' },
    { t: 'say', m: 'drop', text: 'Then the empty first stage drops away, which means less to carry.' },
    { t: 'part', id: 'rocket', part: 'rocket' },
    { t: 'cam', on: 'stand', look: 'rocket', view: 'front', zoom: 1 },
  ]
    .map((line) => JSON.stringify(line))
    .join('\n');

export function makeFakeSceneModels(): SceneModels & RecipeModels {
  const makeWriter = (name: string): SceneModels['writer'] => ({
    name,
    write: async () => {
      await new Promise((resolve) => setTimeout(resolve, WRITE_MS));
      return { code: FAKE_CODE, ...FAKE_USAGE };
    },
  });
  return {
    writer: makeWriter('fake-writer'),
    fallbackWriter: makeWriter('fake-fallback'),
    reviewer: { review: async () => ({ isPass: true, errors: [], ...FAKE_USAGE }) },
    kitWriter: { name: 'fake-kit-writer', write: async () => ({ code: FAKE_KIT_CODE, ...FAKE_USAGE }) },
    kitFallbackWriter: { name: 'fake-kit-fallback', write: async () => ({ code: FAKE_KIT_CODE, ...FAKE_USAGE }) },
    kitReviewer: { review: async () => ({ isPass: true, errors: [], ...FAKE_USAGE }) },
    fitReader: { find: async () => null },
    router: { route: async (request) => ({ engine: 'manimgx', kind: 'graph', topic: request, ...FAKE_USAGE }) },
    nameReader: { clear: async () => new Set() },
    sceneMatcher: { match: async () => '' },
    recipeWriter: {
      write: async ({ topic }) => {
        await new Promise((resolve) => setTimeout(resolve, WRITE_MS));
        return { text: getFakeRecipeText(topic), ...FAKE_USAGE };
      },
    },
    recipeReviewer: { read: async () => ({ isGood: true, reasons: [], ...FAKE_USAGE }) },
    freshWriter: { write: async ({ topic }) => ({ text: getFakeDrawingText(topic), ...FAKE_USAGE }) },
    freshReviewer: { read: async () => ({ isGood: true, reasons: [], ...FAKE_USAGE }) },
    planner: { plan: async (topic, _signal, hooks) => { const plan = getPlanFromText(FAKE_PLAN); hooks?.onSceneWords?.({ narration: plan.narration, plan: plan.plan }); return { ...plan, opening: [...plan.opening, { say: `And that is what this lesson on ${topic} is about.` }], ...FAKE_USAGE }; } },
  };
}
