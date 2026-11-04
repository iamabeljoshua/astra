const DOT_HOLD_MS = 320;
const FADE_MS = 300;
const DOT_RADIUS_PX = 4;
const GAP_AFTER_TEXT_PX = 1;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MIRRORED_STYLES = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'textTransform',
  'wordSpacing',
] as const;

interface Point {
  x: number;
  y: number;
}

function createMirror(textBox: HTMLTextAreaElement) {
  const styles = getComputedStyle(textBox);
  const box = textBox.getBoundingClientRect();
  const mirror = document.createElement('div');
  for (const name of MIRRORED_STYLES) mirror.style[name] = styles[name];
  Object.assign(mirror.style, {
    position: 'fixed',
    left: `${box.left + textBox.clientLeft}px`,
    top: `${box.top + textBox.clientTop - textBox.scrollTop}px`,
    width: `${textBox.clientWidth}px`,
    boxSizing: 'border-box',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  return mirror;
}

// A text box does not report where its text wraps, so a hidden copy lays the text out, and an empty mark rests on its last baseline.
export function getFullStopPoint(textBox: HTMLTextAreaElement): Point {
  const mirror = createMirror(textBox);
  const endOfText = document.createElement('span');
  endOfText.style.display = 'inline-block';
  mirror.append(textBox.value.trimEnd(), endOfText);
  document.body.append(mirror);
  const { left, bottom: baseline } = endOfText.getBoundingClientRect();
  mirror.remove();
  const { top, bottom } = textBox.getBoundingClientRect();
  return {
    x: left + GAP_AFTER_TEXT_PX + DOT_RADIUS_PX,
    y: Math.min(Math.max(baseline - DOT_RADIUS_PX, top), bottom),
  };
}

export function landDot({ x, y }: Point, pageGone: AbortSignal): () => void {
  const dot = document.createElement('i');
  dot.className = 'stop-dot';
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  document.body.append(dot);
  const removeDot = () => dot.remove();
  pageGone.addEventListener('abort', removeDot, { once: true });
  return removeDot;
}

function wait(durationMs: number) {
  const isStill = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  return new Promise<void>((resolve) => setTimeout(resolve, isStill ? 0 : durationMs));
}

export function holdDot(): Promise<void> {
  return wait(DOT_HOLD_MS);
}

// The app shell can outlive the page inside it, so the fade comes off the moment that page goes.
export function fadeOutPage(pageGone: AbortSignal): Promise<void> {
  const page = document.querySelector<HTMLElement>('[data-page]');
  if (page) {
    page.style.transition = `opacity ${FADE_MS}ms linear`;
    page.style.opacity = '0';
    pageGone.addEventListener(
      'abort',
      () => {
        page.style.removeProperty('transition');
        page.style.removeProperty('opacity');
      },
      { once: true },
    );
  }
  return wait(FADE_MS);
}
