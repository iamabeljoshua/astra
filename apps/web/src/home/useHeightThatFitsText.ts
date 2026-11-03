import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

function isHidden(element: HTMLElement) {
  return element.offsetWidth === 0;
}

// The height depends on the text, the placeholder, the box's width, and the font, so a change to any of them fits it again.
export function useHeightThatFitsText(text: string, placeholder: string) {
  const textBox = useRef<HTMLTextAreaElement>(null);
  const placeholderHeightPx = useRef(0);

  const fitHeight = useCallback(() => {
    const box = textBox.current;
    if (!box || isHidden(box)) return;
    box.style.height = 'auto';
    if (box.value === '') placeholderHeightPx.current = box.scrollHeight;
    box.style.height = `${Math.max(box.scrollHeight, placeholderHeightPx.current)}px`;
  }, []);

  useLayoutEffect(() => {
    fitHeight();
    // A late web font changes how the text wraps, and WebKit fires no loadingdone event, so this waits on the promise.
    if (document.fonts.status === 'loading') document.fonts.ready.then(fitHeight);
  }, [text, placeholder, fitHeight]);

  useEffect(() => {
    // A fit inside the observer's own notice would trip the browser's resize loop error.
    const widthAndVisibility = new ResizeObserver(() => requestAnimationFrame(fitHeight));
    if (textBox.current) widthAndVisibility.observe(textBox.current);
    return () => widthAndVisibility.disconnect();
  }, [fitHeight]);

  return textBox;
}
