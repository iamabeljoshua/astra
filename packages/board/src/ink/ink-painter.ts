/// <reference lib="dom" />
import { getStrokePath, getStrokeProgress, type InkStroke } from './ink-stroke.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface InkPainter {
  /** Draws up to `progress` of the whole, from 0 to 1. Touches only strokes that changed, so a finished drawing writes nothing to the page. */
  paint(progress: number): void;
  remove(): void;
}

function setDrawn(path: SVGPathElement, drawn: number): void {
  path.style.visibility = drawn === 0 ? 'hidden' : '';
  path.style.strokeDashoffset = drawn < 1 ? String(1 - drawn) : '';
  path.style.strokeDasharray = drawn < 1 ? '1' : '';
}

// `pathLength` makes every stroke one unit long, so how far it has drawn is one number.
export function createInkPainter(parent: SVGElement, strokes: readonly InkStroke[]): InkPainter {
  const paths = strokes.map((stroke) => {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', getStrokePath(stroke));
    path.setAttribute('pathLength', '1');
    setDrawn(path, 0);
    parent.append(path);
    return path;
  });
  const lastDrawn = strokes.map(() => 0);
  return {
    paint(progress) {
      getStrokeProgress(strokes, progress).forEach((drawn, index) => {
        if (drawn !== lastDrawn[index]) setDrawn(paths[index] as SVGPathElement, drawn);
        lastDrawn[index] = drawn;
      });
    },
    remove() {
      for (const path of paths) path.remove();
    },
  };
}
