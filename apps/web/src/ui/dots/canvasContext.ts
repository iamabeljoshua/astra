// A browser can refuse a canvas by throwing as well as by answering null, and the page works without its dots.
export function getCanvasContext(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings) {
  try {
    return canvas.getContext('2d', settings);
  } catch {
    return null;
  }
}
