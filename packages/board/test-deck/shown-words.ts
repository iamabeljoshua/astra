import type { BoardElement } from '../src/player/board-state.ts';

const getLabel = (content: { label?: string }) => (content.label ? [content.label] : []);

/** The tutor's own words on an element, with none when a reveal may not have reached them yet. */
export function getShownWords(content: BoardElement['content'], isRevealedInSteps: boolean): string[] {
  if (isRevealedInSteps) return [];
  switch (content.kind) {
    case 'text':
      return [content.text];
    case 'table':
      return [...content.columns, ...content.rows.flat()];
    case 'timeline':
      return content.events.flatMap(({ when, label }) => [when, label]);
    case 'diagram':
      return [...content.nodes.map(({ label }) => label), ...content.edges.flatMap(({ label }) => (label ? [label] : []))];
    case 'code':
      return content.source.split('\n').filter((line) => line.trim() !== '');
    case 'drawing':
      return (content.labels ?? []).map(({ text }) => text);
    case 'plot':
      return [...getLabel(content), ...(content.xLabel ? [content.xLabel] : []), ...(content.yLabel ? [content.yLabel] : [])];
    case 'shadeArea':
    case 'markValue':
    case 'vector':
    case 'trackVector':
    case 'annotate':
      return getLabel(content);
    default:
      return [];
  }
}
