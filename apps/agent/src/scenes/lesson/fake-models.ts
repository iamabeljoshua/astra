import type { SceneModels } from '../../providers/anthropic.scenes.ts';
import { getPlanFromText } from './lesson-plan.ts';

const FAKE_USAGE = { model: 'fake', ms: 1, costUsd: 0 };
const WRITE_MS = 2000;

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

// A whole lesson with no model behind it and the real container, so the path can be run first for free.
export function makeFakeSceneModels(): SceneModels {
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
    router: { route: async (request) => ({ engine: 'manimgx', kind: 'graph', topic: request, ...FAKE_USAGE }) },
    planner: { plan: async () => ({ ...getPlanFromText(FAKE_PLAN), ...FAKE_USAGE }) },
  };
}
