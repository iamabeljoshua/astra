import { describe, expect, it } from 'vitest';
import { buildKitFramePage, getNeededTextures } from '../src/scene3d/index.ts';

describe('the sandbox page', () => {
  const page = (code: string) => buildKitFramePage({ kitBundle: 'self.kit = 1;', code });

  it('forbids the network and every place a script could come from', () => {
    const scene = page('function scene(kit) {}');
    for (const rule of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "form-action 'none'", "img-src 'none'", 'worker-src blob:']) expect(scene).toContain(rule);
    expect(scene).not.toContain('unsafe-eval');
    expect(scene).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('allows only its own script, under a nonce a scene cannot know', () => {
    const [firstNonce, secondNonce] = [page(''), page('')].map((text) => text.match(/nonce="([0-9a-f]{32})"/)?.[1]);
    expect(firstNonce).toBeDefined();
    expect(firstNonce).not.toBe(secondNonce);
  });

  it('keeps scene code out of the page as anything but data', () => {
    const scene = page("const text = '</script><img src=x>'; <!-- ");
    expect(scene).not.toContain('</script><img');
    expect(scene).not.toContain("<!-- ");
    const [data] = scene.match(/<script type="application\/json" id="frame-data">.*?<\/script>/s) ?? [''];
    expect(JSON.parse(data.replace(/<[^>]*>/g, '')).source).toContain("const text = '</script><img src=x>'");
  });
});

describe('textures', () => {
  it('sends only the maps a scene names, and always the sky', () => {
    expect(getNeededTextures("kit.planet({ preset: 'moon' })")).toEqual(['2k_stars_milky_way', '2k_moon']);
    expect(getNeededTextures("kit.stage('studio')")).toEqual(['2k_stars_milky_way']);
  });
});
