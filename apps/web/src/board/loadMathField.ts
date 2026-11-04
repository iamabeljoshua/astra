import type { MathfieldElement as MathLiveField } from 'mathlive';

export type MathFieldElement = MathLiveField;

interface LoadedMathField {
  makeField(): MathFieldElement;
  showKeys(): void;
  hideKeys(): void;
  onKeysMoved(listener: (height: number) => void): () => void;
}

let loading: Promise<LoadedMathField> | null = null;

// The board's KaTeX fonts are the same faces MathLive sets, so it fetches none of its own, and it makes no sounds.
export function loadMathField(): Promise<LoadedMathField> {
  loading ??= import('mathlive').then(({ MathfieldElement }) => {
    MathfieldElement.fontsDirectory = null;
    MathfieldElement.soundsDirectory = null;
    return {
      makeField() {
        const field = new MathfieldElement();
        field.mathVirtualKeyboardPolicy = 'manual';
        return field;
      },
      showKeys: () => window.mathVirtualKeyboard.show(),
      hideKeys: () => window.mathVirtualKeyboard.hide(),
      onKeysMoved(listener) {
        const keyboard = window.mathVirtualKeyboard;
        const tell = () => listener(keyboard.boundingRect.height);
        keyboard.addEventListener('geometrychange', tell);
        return () => keyboard.removeEventListener('geometrychange', tell);
      },
    };
  });
  return loading;
}
