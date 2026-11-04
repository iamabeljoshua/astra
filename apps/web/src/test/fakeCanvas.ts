import { vi } from 'vitest';

type CanvasRead = () => { data: Uint8ClampedArray };

function createFakeContext(getImageData: CanvasRead) {
  const context: Record<string | symbol, unknown> = {
    fill: vi.fn(),
    clearRect: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 1 }),
    getImageData,
  };
  return new Proxy(context, {
    get: (target, key) => (target[key] ??= vi.fn()),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export function stubCanvas(getImageData: CanvasRead = () => ({ data: new Uint8ClampedArray(0) })) {
  const contexts: CanvasRenderingContext2D[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = createFakeContext(getImageData);
    contexts.push(context);
    return context as never;
  });
  return contexts;
}

export function readDrawnLabels(context: CanvasRenderingContext2D) {
  return vi.mocked(context.fillText).mock.calls.map(([label]) => label);
}
