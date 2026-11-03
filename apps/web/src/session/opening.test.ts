import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFullStopPoint, holdDot, landDot } from './opening';

const BOX = { left: 100, top: 500, width: 320, height: 200 };
const PADDING = { left: 16, right: 16, top: 14 };
const LINE_HEIGHT_PX = 24;
const LETTER_WIDTH_PX = 10;
const BASELINE_FROM_LINE_TOP_PX = 18;
const DOT_RADIUS_PX = 4;
const GAP_AFTER_TEXT_PX = 1;
const DOT_HOLD_MS = 320;
const ONE_LINE = 'Why is the sky dark?';
const WRAPPED_LINES = 'Why is the sky dark at night when there are so many stars?';

function wrapWords(text: string, lineWidth: number) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const candidate = lines.at(-1) === '' ? word : `${lines.at(-1)} ${word}`;
    if (candidate.length * LETTER_WIDTH_PX <= lineWidth) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines;
}

// jsdom has no layout, so this lays a mirror's text out from the width and the text the mirror was given.
function fakeRectOf(element: Element): Partial<DOMRect> {
  if (element.tagName === 'TEXTAREA') return { ...BOX, right: BOX.left + BOX.width, bottom: BOX.top + BOX.height };
  const mirror = element.parentElement as HTMLElement;
  const lines = wrapWords(mirror.textContent ?? '', parseFloat(mirror.style.width) - parseFloat(mirror.style.paddingLeft) - parseFloat(mirror.style.paddingRight));
  return {
    left: parseFloat(mirror.style.left) + parseFloat(mirror.style.paddingLeft) + lines.at(-1)!.length * LETTER_WIDTH_PX,
    bottom: parseFloat(mirror.style.top) + parseFloat(mirror.style.paddingTop) + (lines.length - 1) * LINE_HEIGHT_PX + BASELINE_FROM_LINE_TOP_PX,
  };
}

function renderTextBox(text: string, { scrollTop = 0 } = {}) {
  const textBox = document.createElement('textarea');
  textBox.value = text;
  textBox.style.paddingLeft = `${PADDING.left}px`;
  textBox.style.paddingRight = `${PADDING.right}px`;
  textBox.style.paddingTop = `${PADDING.top}px`;
  Object.defineProperty(textBox, 'clientWidth', { value: BOX.width });
  Object.defineProperty(textBox, 'scrollTop', { value: scrollTop });
  document.body.append(textBox);
  return textBox;
}

function stubLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return fakeRectOf(this) as DOMRect;
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('getFullStopPoint', () => {
  it('lands just after the last letter, on the baseline, on one line', () => {
    stubLayout();

    const point = getFullStopPoint(renderTextBox(ONE_LINE));

    expect(point).toEqual({
      x: BOX.left + PADDING.left + ONE_LINE.length * LETTER_WIDTH_PX + GAP_AFTER_TEXT_PX + DOT_RADIUS_PX,
      y: BOX.top + PADDING.top + BASELINE_FROM_LINE_TOP_PX - DOT_RADIUS_PX,
    });
  });

  it('lands after the last letter of the last line when the text wraps at a word', () => {
    stubLayout();
    const lastLine = 'stars?';

    const point = getFullStopPoint(renderTextBox(WRAPPED_LINES));

    expect(point).toEqual({
      x: BOX.left + PADDING.left + lastLine.length * LETTER_WIDTH_PX + GAP_AFTER_TEXT_PX + DOT_RADIUS_PX,
      y: BOX.top + PADDING.top + 2 * LINE_HEIGHT_PX + BASELINE_FROM_LINE_TOP_PX - DOT_RADIUS_PX,
    });
  });

  it('ignores spaces after the last word', () => {
    stubLayout();

    expect(getFullStopPoint(renderTextBox(`${ONE_LINE}   `))).toEqual(getFullStopPoint(renderTextBox(ONE_LINE)));
  });

  it('follows the text when the box has scrolled', () => {
    stubLayout();
    const scrollTop = LINE_HEIGHT_PX;

    const unscrolled = getFullStopPoint(renderTextBox(WRAPPED_LINES));
    const scrolled = getFullStopPoint(renderTextBox(WRAPPED_LINES, { scrollTop }));

    expect(scrolled.y).toBe(unscrolled.y - scrollTop);
  });

  it('stays in the box when the last line has scrolled out of it', () => {
    stubLayout();

    expect(getFullStopPoint(renderTextBox(WRAPPED_LINES, { scrollTop: 10_000 })).y).toBe(BOX.top);
  });

  it('leaves no copy of the text on the page', () => {
    stubLayout();
    const textBox = renderTextBox(ONE_LINE);

    getFullStopPoint(textBox);

    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(textBox);
  });
});

describe('landDot', () => {
  it('puts the dot at the point, and takes it away again', () => {
    const removeDot = landDot({ x: 12, y: 34 });

    const dot = document.querySelector<HTMLElement>('.stop-dot');
    expect(dot?.style.left).toBe('12px');
    expect(dot?.style.top).toBe('34px');

    removeDot();
    expect(document.querySelector('.stop-dot')).toBeNull();
  });
});

describe('holding the dot', () => {
  async function isDoneAfter(durationMs: number) {
    vi.useFakeTimers();
    let isDone = false;
    void holdDot().then(() => (isDone = true));
    await vi.advanceTimersByTimeAsync(durationMs);
    return isDone;
  }

  it('lasts a moment by default', async () => {
    expect(await isDoneAfter(0)).toBe(false);
    expect(await isDoneAfter(DOT_HOLD_MS)).toBe(true);
  });

  it('takes no time when the student asks for less motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    expect(await isDoneAfter(0)).toBe(true);
  });
});
