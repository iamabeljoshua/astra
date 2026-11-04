import { vi } from 'vitest';

function createFakeContext() {
  const context: Record<string | symbol, unknown> = {
    fill: vi.fn(),
    clearRect: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 1 }),
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  };
  return new Proxy(context, {
    get: (target, key) => (target[key] ??= vi.fn()),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

// Every canvas gets a context that records its calls, in the order the page asked for them.
export function stubCanvas() {
  const contexts: CanvasRenderingContext2D[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    const context = createFakeContext();
    contexts.push(context);
    return context as never;
  });
  return contexts;
}

export function readDrawnLabels(context: CanvasRenderingContext2D) {
  return vi.mocked(context.fillText).mock.calls.map(([label]) => label);
}
