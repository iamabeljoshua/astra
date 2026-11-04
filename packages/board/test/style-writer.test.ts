import { describe, expect, it } from 'vitest';
import { writeStyle } from '../src/style-writer.ts';

function makeElement() {
  const writes: string[] = [];
  const style = new Proxy({} as Record<string, string>, {
    get: (_target, name) => `read back ${String(name)}`,
    set(_target, name, value: string) {
      writes.push(`${String(name)}=${value}`);
      return true;
    },
  });
  return { element: { style } as unknown as HTMLElement, writes };
}

describe('writeStyle', () => {
  it('writes a value once however many frames ask for it', () => {
    const { element, writes } = makeElement();
    for (let frame = 0; frame < 5; frame += 1) writeStyle(element, 'transform', 'scale(1.0000)');
    expect(writes).toEqual(['transform=scale(1.0000)']);
  });

  it('writes again when the value changes, and treats clearing an unset style as nothing to do', () => {
    const { element, writes } = makeElement();
    writeStyle(element, 'opacity', '');
    writeStyle(element, 'opacity', '0.5');
    writeStyle(element, 'opacity', '');
    expect(writes).toEqual(['opacity=0.5', 'opacity=']);
  });

  it('keeps each element and each style apart', () => {
    const first = makeElement();
    const second = makeElement();
    writeStyle(first.element, 'opacity', '1');
    writeStyle(first.element, 'transform', '1');
    writeStyle(second.element, 'opacity', '1');
    expect(first.writes).toHaveLength(2);
    expect(second.writes).toHaveLength(1);
  });
});
