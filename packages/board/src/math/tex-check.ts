import katex from 'katex';

// `trust: false` closes links and raw HTML, the two limits close macro bombs and huge sizes, and `throwOnError` keeps a red error message off the board.
export const KATEX_OPTIONS = { displayMode: false, output: 'htmlAndMathml', throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 4 } as const;

// Inline mode is what lets a long equation wrap at its operators, and this keeps fractions at full size.
export const DISPLAY_STYLE = '\\displaystyle ';

/** Whether KaTeX can set this math. This file loads no stylesheet, so plain Node can import it through `@astra/board/tex-check`. */
export function canRenderTex(tex: string): boolean {
  try {
    katex.renderToString(DISPLAY_STYLE + tex, KATEX_OPTIONS);
    return true;
  } catch {
    return false;
  }
}
