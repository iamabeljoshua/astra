const SVG_NS = 'http://www.w3.org/2000/svg';
const OVERLAY_ID = 0;
const FONT_FAMILY = 'Barlow, system-ui, sans-serif';
const HTML_TAGS = new Set(['div']);
const SVG_TAGS = new Set(['svg', 'line', 'circle', 'text', 'path', 'polyline']);

const TEXT_STYLES = {
  'lbl-main': { weight: 500, size: 12, spacing: 0.14, isUpper: true, height: 1.25, gap: 0 },
  'lbl-sub': { weight: 400, size: 13, spacing: 0, isUpper: false, height: 1.3, gap: 2 },
  'ttl-main': { weight: 600, size: 24, spacing: -0.005, isUpper: false, height: 1.15, gap: 0 },
  'ttl-sub': { weight: 400, size: 14, spacing: 0, isUpper: false, height: 1.3, gap: 4 },
  k: { weight: 500, size: 11, spacing: 0.14, isUpper: true, height: 1.2, gap: 0 },
  v: { weight: 600, size: 18, spacing: 0, isUpper: false, height: 1.25, gap: 0 },
};
const BOX_EDGES = { lbl: { x: 19, y: 11 }, ttl: { x: 16, y: 8 }, hud: { x: 22, y: 15 } };
const TITLE_MOST_WIDTH_SHARE = 0.62;
const TITLE_LEFT_PX = 28;

export function createOverlayDom({ getOverlayWidth }) {
  let nextId = OVERLAY_ID + 1;
  let ops = [];
  const pen = new OffscreenCanvas(1, 1).getContext('2d');

  const getLineWidth = (text, style) => {
    pen.font = `${style.weight} ${style.size}px ${FONT_FAMILY}`;
    pen.letterSpacing = `${style.spacing * style.size}px`;
    return pen.measureText(style.isUpper ? text.toUpperCase() : text).width;
  };

  const getWrappedLines = (text, style, mostWidth) => {
    let lines = 1;
    let line = '';
    for (const word of text.split(/\s+/)) {
      const longer = line ? `${line} ${word}` : word;
      if (line && getLineWidth(longer, style) > mostWidth) {
        lines += 1;
        line = word;
      } else line = longer;
    }
    return lines;
  };

  const getTextStyle = (child, box) => {
    const style = TEXT_STYLES[child.className];
    if (child.className === 'lbl-main' && box.className.includes('big')) return { ...style, size: 15 };
    if (child.className === 'ttl-main' && box.className.includes('corner')) return { ...style, weight: 500, size: 11, spacing: 0.14, isUpper: true };
    return style;
  };

  const measureBox = (box) => {
    const edges = BOX_EDGES[box.className.split(' ')[0]] ?? { x: 0, y: 0 };
    const isWrapped = box.className.startsWith('ttl') && !box.className.includes('corner');
    const mostWidth = isWrapped ? Math.min(getOverlayWidth() * TITLE_MOST_WIDTH_SHARE, getOverlayWidth() - TITLE_LEFT_PX - edges.x) : Infinity;
    let width = 0;
    let height = 0;
    for (const child of box.children) {
      const style = getTextStyle(child, box);
      if (!style) continue;
      const lines = isWrapped ? getWrappedLines(child.textContent, style, mostWidth) : 1;
      width = Math.max(width, lines > 1 ? mostWidth : getLineWidth(child.textContent, style));
      height += style.gap + lines * style.size * style.height;
    }
    return { width: Math.round(width + edges.x), height: Math.round(height + edges.y) };
  };

  class StandInElement {
    id = nextId++;
    children = [];
    text = '';
    name = '';
    style = new Proxy({}, {
      set: (held, property, value) => {
        const next = String(value);
        if (held[property] !== next) {
          held[property] = next;
          ops.push(['style', this.id, property, next]);
        }
        return true;
      },
    });

    constructor(tag, isSvg) {
      if (!(isSvg ? SVG_TAGS : HTML_TAGS).has(tag)) throw new TypeError(`A scene has no ${tag} element.`);
      ops.push(['create', this.id, tag, isSvg]);
    }

    get className() { return this.name; }
    set className(value) { this.name = String(value); ops.push(['attr', this.id, 'class', this.name]); }
    get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this.text; }
    set textContent(value) { this.text = String(value); ops.push(['text', this.id, this.text]); }
    get offsetWidth() { return measureBox(this).width; }
    get offsetHeight() { return measureBox(this).height; }
    setAttribute(name, value) {
      if (name === 'class') this.name = String(value);
      ops.push(['attr', this.id, name, String(value)]);
    }
    appendChild(child) {
      this.children.push(child);
      ops.push(['append', child.id, this.id]);
      return child;
    }
  }

  const document = {
    createElement: (tag) => (tag === 'canvas' ? new OffscreenCanvas(300, 150) : new StandInElement(tag, false)),
    createElementNS: (namespace, tag) => new StandInElement(tag, namespace === SVG_NS),
    documentElement: {
      dataset: new Proxy({}, {
        set: (_held, name, value) => {
          ops.push(['root', name, String(value)]);
          return true;
        },
      }),
    },
  };

  const overlay = {
    id: OVERLAY_ID,
    appendChild(child) {
      ops.push(['append', child.id, OVERLAY_ID]);
      return child;
    },
  };

  return {
    document,
    overlay,
    takeOps() {
      const taken = ops;
      ops = [];
      return taken;
    },
  };
}
