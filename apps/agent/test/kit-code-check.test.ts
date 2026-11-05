import { describe, expect, it } from 'vitest';
import { getKitCodeProblems } from '../src/scenes/kit-code-check.ts';

const MOMENTS = { 'moon-in': 1, 'moon-out': 3 };
const scene = (body = '') => `function scene(kit) {
  kit.stage('space', {});
  const moon = kit.planet({ id: 'moon', preset: 'moon', radius: 1 });
  kit.shots([{ at: 0, move: 'cut', target: 'moon', distance: 6 }]);
  ${body}
  return { render(t) { moon.show(kit.env(t, 'moon-in', 'moon-out')); for (let i = 0; i < 3; i += 1) moon.spinTo(i); } };
}`;
const problemsOf = (code: string, topic = 'a moon') => getKitCodeProblems({ code, topic, moments: MOMENTS });

describe('the kit code check', () => {
  it('passes a scene that keeps to the kit', () => {
    expect(problemsOf(scene())).toEqual([]);
  });

  it('allows arrays and Math, which every scene uses', () => {
    expect(problemsOf(scene('const list = [1, 2]; const first = list[0]; const n = Math.sin(first) + Math.PI;'))).toEqual([]);
  });

  it('allows a stage colour called top and a local called parent, which reach nothing', () => {
    expect(problemsOf(scene("kit.stage('studio', { top: '#141b2b' }); const parent = kit.group({ id: 'g' }); parent.add(moon); moon.object.parent;"))).toEqual([]);
  });

  it.each(['top.location;', 'self.fetch;'])('still refuses a global with a plain name when nothing declares it: %s', (body) => {
    expect(problemsOf(scene(body)).join(' ')).toMatch(/not allowed/);
  });

  it('refuses code that does not parse, and names the line', () => {
    expect(problemsOf('function scene(kit) {\n  return {;\n}')[0]).toMatch(/does not parse.*line 2/);
  });

  it.each([
    ['no scene function', 'const a = 1;'],
    ['a second top level statement', `${scene()}\nfetch('x');`],
    ['a scene that takes no kit', 'function scene() { return {}; }'],
  ])('refuses %s', (_name, code) => {
    expect(problemsOf(code).join(' ')).toMatch(/exactly one function scene\(kit\)/);
  });

  it.each([
    ['fetch', "fetch('/x');"],
    ['an image', 'const image = new Image();'],
    ['a socket', "new WebSocket('ws://x');"],
    ['the page', 'document.title;'],
    ['the window', 'window.name;'],
    ['the parent', 'parent.postMessage(1);'],
    ['this frame moving', "location.href = 'x';"],
    ['storage', 'localStorage.clear();'],
    ['eval', "eval('1');"],
    ['a new function', "new Function('return 1');"],
    ['the constructor way to eval', "(() => {}).constructor('return 1')();"],
    ['the constructor by a string', "(() => {})['constructor']('return 1')();"],
    ['a dynamic import', "import('x');"],
    ['a timer', 'setTimeout(() => {}, 1);'],
    ['the wall clock', 'Date.now();'],
    ['a texture from a link', 'new kit.THREE.TextureLoader();'],
    ['its own renderer', 'new kit.THREE.WebGLRenderer();'],
    ['a global by name', 'globalThis.fetch;'],
  ])('refuses %s, which a scene has no need of', (_name, body) => {
    const problems = problemsOf(scene(body));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toMatch(/not allowed/);
  });

  it.each(['evil.com', 'see evil.com/x', 'data:text/html,x', 'javascript:alert(1)', '//evil.net/a', 'ma.rk@x.co'])('refuses an address in a string: %s', (text) => {
    expect(problemsOf(scene(`kit.label(${JSON.stringify(text)}, { at: 'moon' });`)).join(' ')).toMatch(/address/);
  });

  it('allows a label with a number and a unit, which is no address', () => {
    expect(problemsOf(scene("kit.label('Moon', { at: 'moon', sub: '384,400 km' }); kit.label('3.8 cm a year', { at: 'moon' });"))).toEqual([]);
  });

  it('refuses a moment the scene never uses, since each must change what the student sees', () => {
    expect(problemsOf(scene().replace("'moon-out'", 'null'))).toContain('it never uses the moment moon-out');
  });

  it('lets a scene open on its first moment with no word for it, since a scene starts there anyway', () => {
    expect(getKitCodeProblems({ code: scene().replace("'moon-in'", 'null'), topic: 'a moon', moments: { 'moon-in': 0, 'moon-out': 3 } })).toEqual([]);
  });

  it('holds the Moon to the kit\'s own orbit on a question about its phases, since hand-written geometry is where the truth broke', () => {
    expect(problemsOf(scene(), 'why does the moon have phases').join(' ')).toMatch(/kit\.astro\.moonOrbit/);
    expect(problemsOf(scene("kit.astro.moonOrbit({ earth: 'e', moon: 'moon' });"), 'why does the moon have phases').join(' ')).not.toMatch(/moonOrbit/);
  });

  it('holds the seasons to the kit\'s own tilt', () => {
    expect(problemsOf(scene(), 'what causes the seasons').join(' ')).toMatch(/kit\.astro\.seasons/);
  });

  it('runs the same word rules as every other scene', () => {
    expect(problemsOf(scene("kit.label('Tom Smith', { at: 'moon' });")).join(' ')).toMatch(/names a person/);
    expect(problemsOf(scene("kit.label('月', { at: 'moon' });")).join(' ')).toMatch(/alphabet/);
  });
});
