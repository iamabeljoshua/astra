import type { KitFont, KitFrameCommand, KitFrameReply, KitWorkerMessage } from './protocol.ts';

export function selfContainedFrameHost(): void {
  const BEAT_EVERY_MS = 250;
  const MOST_MISSED_BEATS_BUILDING = 32;
  const MOST_MISSED_BEATS_PLAYING = 10;
  const MOST_MISSED_BEATS_ANSWERING = 480;
  const MOST_ERRORS = 4;
  const MOST_ERROR_CHARS = 1000;
  const MOST_READY_CHARS = 1_000_000;
  const MOST_OPS = 20_000;
  const MOST_NODES = 20_000;
  const MOST_TEXT_CHARS = 1000;
  const MOST_VALUE_CHARS = 20_000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const HTML_TAGS = new Set(['div']);
  const SVG_TAGS = new Set(['svg', 'line', 'circle', 'text', 'path', 'polyline']);
  const ATTRIBUTES = new Set(['class', 'viewBox', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'd', 'points', 'transform', 'text-anchor', 'fill', 'stroke', 'stroke-width', 'opacity']);
  const STYLES = new Set(['opacity', 'transform', 'width', 'height', 'left', 'top']);
  const ROOT_NAMES = new Set(['theme', 'canvas']);
  const ROOT_VALUES = new Set(['light', 'dark']);
  const SAFE_VALUE = /^[\w\s.,#%()+-]*$/;
  const REPLIES_TO_ASKS = new Set(['gate', 'snapshot', 'audit', 'flash', 'picture']);

  const { source, fonts } = JSON.parse((document.getElementById('frame-data') as HTMLElement).textContent as string) as { source: string; fonts: KitFont[] };
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const overlay = document.getElementById('o') as HTMLElement;
  const nodes = new Map<number, Element>([[0, overlay]]);
  const openAsks = new Map<string, number>();
  const tellPage = (reply: KitFrameReply) => parent.postMessage(reply, '*');

  const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  let beatId = 0;
  let answeredBeat = 0;
  let missedBeats = 0;
  let isReady = false;
  let isStopped = false;
  let hasOpenRender = false;
  let errorsTold = 0;

  const tellError = ({ phase, message, stack, line, col, seconds }: Extract<KitFrameReply, { type: 'error' }>) => {
    errorsTold += 1;
    if (errorsTold > MOST_ERRORS) return;
    tellPage({ type: 'error', phase, message: String(message).slice(0, MOST_ERROR_CHARS), stack: String(stack ?? '').slice(0, MOST_ERROR_CHARS), line: Number(line), col: Number(col), seconds: Number(seconds) });
  };

  const stop = (message: string) => {
    if (isStopped) return;
    isStopped = true;
    worker.terminate();
    tellError({ type: 'error', phase: 'render', message });
  };

  const beating = setInterval(() => {
    const hasOpenAsk = [...openAsks.values()].some((count) => count > 0);
    const mostMissed = hasOpenAsk ? MOST_MISSED_BEATS_ANSWERING : isReady ? MOST_MISSED_BEATS_PLAYING : MOST_MISSED_BEATS_BUILDING;
    missedBeats = answeredBeat === beatId ? 0 : missedBeats + 1;
    if (missedBeats > mostMissed) {
      clearInterval(beating);
      stop('the scene stopped answering');
      return;
    }
    if (!isStopped) worker.postMessage({ type: 'beat', id: (beatId += 1) });
  }, BEAT_EVERY_MS);

  const makeNode = (id: number, tag: string, isSvg: boolean) => {
    if (typeof id !== 'number' || nodes.has(id) || nodes.size >= MOST_NODES) return false;
    if (!(isSvg ? SVG_TAGS : HTML_TAGS).has(tag)) return false;
    nodes.set(id, isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag));
    return true;
  };

  const applyOp = ([kind, id, first, second]: unknown[]) => {
    if (kind === 'create') return makeNode(id as number, first as string, second === true);
    if (kind === 'root') {
      if (!ROOT_NAMES.has(id as string) || !ROOT_VALUES.has(first as string)) return false;
      document.documentElement.dataset[id as string] = first as string;
      return true;
    }
    const node = nodes.get(id as number);
    if (!node) return false;
    if (kind === 'append') {
      const parentNode = nodes.get(first as number);
      if (!parentNode || node === overlay) return false;
      parentNode.appendChild(node);
      return true;
    }
    if (kind === 'text') {
      if (typeof first !== 'string' || first.length > MOST_TEXT_CHARS) return false;
      node.textContent = first;
      return true;
    }
    if (typeof second !== 'string' || second.length > MOST_VALUE_CHARS || !SAFE_VALUE.test(second) || /url\s*\(/i.test(second)) return false;
    if (kind === 'attr') {
      if (!ATTRIBUTES.has(first as string)) return false;
      node.setAttribute(first as string, second);
      return true;
    }
    if (kind === 'style') {
      if (!STYLES.has(first as string)) return false;
      (node as HTMLElement).style.setProperty(first as string, second);
      return true;
    }
    return false;
  };

  const canApplyOp = (op: unknown[]) => {
    try {
      return applyOp(op);
    } catch {
      return false;
    }
  };

  const applyOps = (ops: unknown) => {
    if (Array.isArray(ops) && ops.length <= MOST_OPS && (ops as unknown[][]).every(canApplyOp)) return;
    stop('the scene asked for something it may not do');
  };

  worker.onerror = (event) => {
    event.preventDefault();
    tellError({ type: 'error', phase: 'script', message: event.message, line: event.lineno, col: event.colno });
  };

  const passOnWorkerMessage = (data: KitWorkerMessage) => {
    const type = (data as { type?: unknown } | null)?.type;
    if (type === 'beat') {
      answeredBeat = Number((data as { id?: unknown }).id);
      return;
    }
    if (type === 'overlay') {
      applyOps((data as { ops?: unknown }).ops);
      return;
    }
    if (type === 'loaded') {
      tellPage({ type: 'loaded' });
      return;
    }
    if (type === 'error') {
      tellError(data as Extract<KitFrameReply, { type: 'error' }>);
      return;
    }
    if (type === 'drawn') {
      if (!hasOpenRender) return;
      hasOpenRender = false;
      const { seconds, costMs } = data as Extract<KitFrameReply, { type: 'drawn' }>;
      tellPage({ type: 'drawn', seconds: Number(seconds), costMs: Number(costMs) });
      return;
    }
    if (type === 'ready') {
      if (isReady) return;
      if (JSON.stringify(data).length > MOST_READY_CHARS) {
        stop('the scene said too much');
        return;
      }
      isReady = true;
      missedBeats = 0;
      tellPage(data as KitFrameReply);
      return;
    }
    if (typeof type === 'string' && REPLIES_TO_ASKS.has(type) && (openAsks.get(type) ?? 0) > 0) {
      openAsks.set(type, (openAsks.get(type) as number) - 1);
      missedBeats = 0;
      tellPage(data as KitFrameReply);
    }
  };

  worker.onmessage = ({ data }: MessageEvent<KitWorkerMessage>) => {
    if (isStopped) return;
    try {
      passOnWorkerMessage(data);
    } catch {
      stop('the scene said something the frame cannot read');
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== parent || isStopped) return;
    const command = event.data as KitFrameCommand;
    if (command?.type === 'ping') {
      tellPage({ type: 'pong', id: command.id });
      return;
    }
    if (command?.type === 'dispose') {
      isStopped = true;
      clearInterval(beating);
      worker.terminate();
      return;
    }
    if (command?.type === 'resize') {
      worker.postMessage({ type: 'resize', width: canvas.clientWidth, height: canvas.clientHeight });
      return;
    }
    if (command?.type === 'render') hasOpenRender = true;
    if (REPLIES_TO_ASKS.has(command?.type)) {
      openAsks.set(command.type, (openAsks.get(command.type) ?? 0) + 1);
      missedBeats = 0;
    }
    if (command?.type === 'load') missedBeats = 0;
    worker.postMessage(command);
  });

  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: 'start', canvas: offscreen, width: canvas.clientWidth, height: canvas.clientHeight, pixelRatio: window.devicePixelRatio, fonts }, [offscreen]);
}
