import { describe, expect, it } from 'vitest';
import { CHECK_HEIGHT, CHECK_WIDTH, getCheckTimes, getFrameProblems, getLostPointers } from '../src/scene2d/frame-check.js';

const PAPER = [244, 239, 230];
const INK = [30, 30, 30];

function makeFrame({ boxes = [], labels = [] }: { boxes?: { x: number; y: number; width: number; height: number }[]; labels?: { text: string; to?: { x: number; y: number }; alpha?: number; width?: number }[] }) {
  const cells = new Uint8ClampedArray(CHECK_WIDTH * CHECK_HEIGHT * 4);
  for (let index = 0; index < CHECK_WIDTH * CHECK_HEIGHT; index += 1) {
    const x = (index % CHECK_WIDTH) * 4;
    const y = Math.floor(index / CHECK_WIDTH) * 4;
    const isInked = boxes.some((box) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height);
    cells.set([...(isInked ? INK : PAPER), 255], index * 4);
  }
  return { seconds: 1, cells, width: CHECK_WIDTH, height: CHECK_HEIGHT, labels: labels.map((label) => ({ alpha: 1, width: 100, ...label })), clippedTexts: [] as string[], brokenTexts: [] as string[], brokenNumbers: [] as string[] };
}

const BODY = { x: 400, y: 200, width: 300, height: 200 };

describe('the frame check', () => {
  it('passes a frame with something drawn in it', () => {
    expect(getFrameProblems([makeFrame({ boxes: [BODY] })])).toEqual([]);
  });

  it('refuses an empty frame', () => {
    expect(getFrameProblems([makeFrame({})])).toEqual(['it is blank at 1 s']);
  });

  it('refuses text that shows a broken number', () => {
    expect(getFrameProblems([makeFrame({ boxes: [BODY], labels: [{ text: 'Speed NaN' }] })])[0]).toContain('broken number');
    expect(getFrameProblems([{ ...makeFrame({ boxes: [BODY] }), brokenTexts: ['12.3456789 km'] }])[0]).toContain('broken number');
  });

  it('refuses text cut by the frame and a number a canvas cannot draw', () => {
    expect(getFrameProblems([{ ...makeFrame({ boxes: [BODY] }), clippedTexts: ['Rotor'] }])).toEqual(['the text "Rotor" is cut by the frame']);
    expect(getFrameProblems([{ ...makeFrame({ boxes: [BODY] }), brokenNumbers: ['arc'] }])).toEqual(['arc was given a number that cannot be drawn']);
  });

  it('refuses a label wider than the frame', () => {
    expect(getFrameProblems([makeFrame({ boxes: [BODY], labels: [{ text: 'long', width: 1270 }] })])).toEqual(['the label "long" is wider than the frame']);
  });

  it('finds a pointer on nothing or off the frame, and leaves one on a thing', () => {
    const frame = makeFrame({ boxes: [BODY], labels: [{ text: 'on it', to: { x: 500, y: 300 } }, { text: 'at its edge', to: { x: 400, y: 300 } }, { text: 'on nothing', to: { x: 1000, y: 600 } }, { text: 'off', to: { x: 1400, y: 300 } }, { text: 'not a number', to: { x: Number.NaN, y: 10 } }, { text: 'still fading in', to: { x: 1000, y: 600 }, alpha: 0.2 }] });
    expect(getLostPointers([frame])).toEqual(['on nothing', 'off', 'not a number']);
  });

  it('looks at each line twice, within the scene', () => {
    expect(getCheckTimes({ moments: { first: 0, second: 4 }, duration: 8 })).toEqual([1.3, 3.4, 5.3, 7.4]);
    expect(Math.max(...getCheckTimes({ moments: { first: 0 }, duration: 1 }))).toBeLessThanOrEqual(0.95);
  });
});
