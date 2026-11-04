import { getTexProblem, MATH_LINE_MAX_CHARACTERS } from '@astra/contracts';
import { useEffect, useRef } from 'react';
import { loadMathField, type MathFieldElement } from './loadMathField';

/** The keyboard lies over the page, so the session leaves room for it and the words and tools stay in sight. */
const KEYS_HEIGHT = '--math-keys-height';

/** MathLive's own left and right, which the rest of the board does not set. */
const toBoardTex = (tex: string) => tex.replaceAll('\\mleft', '\\left').replaceAll('\\mright', '\\right').trim();

export function getKeyedTex(raw: string): string | null {
  const tex = toBoardTex(raw);
  if (tex === '' || tex.length > MATH_LINE_MAX_CHARACTERS || tex.includes('\\placeholder')) return null;
  return getTexProblem(tex) === null ? tex : null;
}

interface MathFieldProps {
  onLine(line: { text: string; tex: string | null }): void;
  onTyping(): void;
}

export function MathField({ onLine, onTyping }: MathFieldProps) {
  const holder = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLine, onTyping });

  useEffect(() => {
    callbacks.current = { onLine, onTyping };
  }, [onLine, onTyping]);

  useEffect(() => {
    let isGone = false;
    let field: MathFieldElement | null = null;
    let stopWatching: (() => void) | undefined;
    const leaveRoom = () => document.documentElement.style.removeProperty(KEYS_HEIGHT);
    void loadMathField().then(({ makeField, showKeys, onKeysMoved }) => {
      if (isGone || !holder.current) return;
      const made = makeField();
      field = made;
      made.addEventListener('input', () => callbacks.current.onTyping());
      // MathLive also says "change" when the field loses focus, and leaving is not sending. Going to another window leaves the field active, so the document's focus says that one.
      made.addEventListener('change', () => {
        if (document.activeElement !== made || !document.hasFocus()) return;
        const text = made.getValue('ascii-math');
        if (text.trim() === '') return;
        callbacks.current.onLine({ text, tex: getKeyedTex(made.getValue('latex')) });
        made.value = '';
      });
      holder.current.append(made);
      made.focus();
      stopWatching = onKeysMoved((height) => document.documentElement.style.setProperty(KEYS_HEIGHT, `${height}px`));
      showKeys();
    });
    return () => {
      isGone = true;
      field?.remove();
      stopWatching?.();
      leaveRoom();
      void loadMathField().then(({ hideKeys }) => hideKeys());
    };
  }, []);

  return <div ref={holder} data-testid="math-field" className="board-math-field" />;
}
