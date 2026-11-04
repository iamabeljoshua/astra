import { describe, expect, it } from 'vitest';
import { buildKitFramePage, getNeededTextures, guardLoops } from '../src/scene3d/index.ts';

const GUARD = '__guardTest';

describe('guarding loops', () => {
  it('puts a time check in every kind of loop', () => {
    const guarded = guardLoops('for(;;){a()} while(b){c()} do{d()}while(e); for(const f of g){h()} for(const i in j){k()}', GUARD);
    expect(guarded.split(`${GUARD}();`)).toHaveLength(6);
  });

  it('wraps a loop with a single statement body and keeps what it does', () => {
    const guarded = guardLoops('let total = 0; for (let index = 0; index < 3; index += 1) total += index; total;', GUARD);
    expect(new Function(GUARD, `return (function(){ ${guarded.replace('total;', 'return total;')} })()`)(() => {})).toBe(3);
  });

  it('guards a loop inside a function inside a function', () => {
    expect(guardLoops('function scene(kit) { return { render() { while (true) {} } }; }', GUARD)).toContain(`while (true) {${GUARD}();}`);
  });

  it('refuses code that will not parse', () => {
    expect(() => guardLoops('function scene( {', GUARD)).toThrow();
  });

  it('leaves a string that only looks like a loop alone', () => {
    expect(guardLoops("const text = 'while (true) {}';", GUARD)).toBe("const text = 'while (true) {}';");
  });
});

describe('the sandbox page', () => {
  const page = (code: string) => buildKitFramePage({ kitBundle: 'window.kit = 1;', code });

  it('forbids the network, and every place a script could come from but its own text', () => {
    const scene = page('function scene(kit) {}');
    for (const rule of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "form-action 'none'", "worker-src 'none'"]) expect(scene).toContain(rule);
    expect(scene).not.toContain('unsafe-eval');
  });

  it('holds its guard under a name a scene cannot know', () => {
    const [firstName, secondName] = [page('while(1){}'), page('while(1){}')].map((text) => text.match(/__guard[0-9a-f]{32}/)?.[0]);
    expect(firstName).toBeDefined();
    expect(firstName).not.toBe(secondName);
  });

  it('cannot be closed early by a scene that writes the end of a script tag', () => {
    const scene = page("const text = '</script><img src=x>';");
    expect(scene).not.toContain('</script><img');
  });
});

describe('textures', () => {
  it('sends only the maps a scene names, and always the sky', () => {
    expect(getNeededTextures("kit.planet({ preset: 'moon' })")).toEqual(['2k_stars_milky_way', '2k_moon']);
    expect(getNeededTextures("kit.stage('studio')")).toEqual(['2k_stars_milky_way']);
  });
});
