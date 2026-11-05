import { SCENE_ENGINE_VERSIONS } from '@astra/contracts';
import { buildKitFramePage, getNeededTextures, type KitFont, type KitFrameCommand, type KitFrameReply, type KitTake, type KitTheme } from '@astra/board/scene3d';
import { fetchAppFile } from '../api/fetchAppFile';

const KIT_BASE = `/scene-kit/${SCENE_ENGINE_VERSIONS.kit}`;
const FONT_WEIGHTS = [400, 500, 600];
const PING_EVERY_MS = 500;
const MOST_MISSED_PINGS = 4;
const FIRST_DRAW_LIMIT_MS = 2000;
const BROKEN_SCENE = /unknown|failed|bad expression|needs points|not loaded|duplicate part/i;

export interface KitFrame {
  hasDrawn(): boolean;
  render(seconds: number): void;
  setTheme(theme: KitTheme): void;
  resize(): void;
  dispose(): void;
}

let sharedFiles: Promise<{ kitBundle: string; fonts: KitFont[] }> | null = null;
const textureFiles = new Map<string, Promise<Blob>>();

const getFonts = (): Promise<KitFont[]> =>
  Promise.all(
    FONT_WEIGHTS.map(async (weight) => {
      const bytes = new Uint8Array(await fetchAppFile(`/fonts/barlow-latin-${weight}-normal.woff2`));
      return { weight, url: `data:font/woff2;base64,${btoa(String.fromCharCode(...bytes))}` };
    }),
  );

async function readSharedFiles(): Promise<{ kitBundle: string; fonts: KitFont[] }> {
  const [kit, fonts] = await Promise.all([fetchAppFile(`${KIT_BASE}/kit.js`), getFonts()]);
  return { kitBundle: new TextDecoder().decode(kit), fonts };
}

function getSharedFiles() {
  sharedFiles ??= readSharedFiles().catch((error: unknown) => {
    sharedFiles = null;
    throw error;
  });
  return sharedFiles;
}

function getTexture(name: string): Promise<Blob> {
  const kept = textureFiles.get(name);
  if (kept) return kept;
  const file = `/scene-kit/textures/${name}.${name.endsWith('alpha') ? 'png' : 'jpg'}`;
  const made = fetchAppFile(file).then((bytes) => new Blob([bytes]));
  textureFiles.set(name, made);
  void made.catch(() => textureFiles.delete(name));
  return made;
}

async function getTextures(code: string): Promise<Record<string, Blob>> {
  const names = getNeededTextures(code);
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await getTexture(name)] as const)));
}

function createFrameElement(page: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('title', 'Scene');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0', display: 'block', pointerEvents: 'none' });
  iframe.srcdoc = page;
  return iframe;
}

export interface OpenKitFrameInput {
  host: HTMLElement;
  take: KitTake;
  theme: KitTheme;
  limitMs: number;
  onLost(): void;
  onFirstDraw(): void;
}

export async function openKitFrame({ host, take, theme, limitMs, onLost, onFirstDraw }: OpenKitFrameInput): Promise<KitFrame> {
  const [{ kitBundle, fonts }, textures] = await Promise.all([getSharedFiles(), getTextures(take.code)]);
  const page = buildKitFramePage({ kitBundle, fonts, code: take.code });
  const iframe = createFrameElement(page);
  let currentTheme = theme;
  let wantSeconds = 0;
  let missedPings = 0;
  let pingId = 0;
  let isGone = false;
  let pinging: ReturnType<typeof setInterval> | undefined;
  let hasDrawn = false;
  let isBuilding = true;
  let buildLimit: ReturnType<typeof setTimeout> | undefined;
  let firstDrawLimit: ReturnType<typeof setTimeout> | null = null;
  let settleOpen: { resolve(frame: KitFrame): void; reject(error: Error): void } | null = null;

  const tell = (command: KitFrameCommand) => iframe.contentWindow?.postMessage(command, '*');

  const dispose = () => {
    if (isGone) return;
    isGone = true;
    clearInterval(pinging);
    clearTimeout(buildLimit);
    if (firstDrawLimit) clearTimeout(firstDrawLimit);
    window.removeEventListener('message', onMessage);
    tell({ type: 'dispose' });
    iframe.remove();
  };

  const fail = (reason: string) => {
    const opening = settleOpen;
    settleOpen = null;
    dispose();
    if (opening) opening.reject(new Error(reason));
    else onLost();
  };

  const waitForNewPage = () => {
    isBuilding = true;
    hasDrawn = false;
    clearInterval(pinging);
    clearTimeout(buildLimit);
    if (firstDrawLimit) clearTimeout(firstDrawLimit);
    firstDrawLimit = null;
    buildLimit = setTimeout(() => fail('the scene took too long to start'), limitMs);
  };

  const startPinging = () => {
    clearInterval(pinging);
    missedPings = 0;
    pinging = setInterval(() => {
      missedPings += 1;
      if (missedPings > MOST_MISSED_PINGS) fail('the scene stopped answering');
      else tell({ type: 'ping', id: (pingId += 1) });
    }, PING_EVERY_MS);
  };

  const waitForFirstDraw = () => {
    if (hasDrawn || isBuilding || firstDrawLimit) return;
    firstDrawLimit = setTimeout(() => {
      firstDrawLimit = null;
      if (hasDrawn) return;
      // A hidden tab draws nothing and has not failed, and its next render starts this wait again.
      if (document.visibilityState === 'visible') fail('the scene drew no frame on screen');
    }, FIRST_DRAW_LIMIT_MS);
  };

  const frame: KitFrame = {
    hasDrawn: () => hasDrawn,
    render(seconds) {
      wantSeconds = seconds;
      waitForFirstDraw();
      tell({ type: 'render', seconds });
    },
    setTheme(next) {
      if (next === currentTheme) return;
      currentTheme = next;
      waitForNewPage();
      iframe.srcdoc = page;
    },
    resize: () => tell({ type: 'resize' }),
    dispose,
  };

  const onReply: { [Type in KitFrameReply['type']]?: (reply: Extract<KitFrameReply, { type: Type }>) => void } = {
    loaded() {
      waitForNewPage();
      tell({ type: 'load', timing: take.timing, textures, theme: currentTheme });
    },
    ready({ issues }) {
      const broken = issues.find((issue) => BROKEN_SCENE.test(issue));
      if (broken) return fail(broken);
      isBuilding = false;
      clearTimeout(buildLimit);
      tell({ type: 'render', seconds: wantSeconds });
      startPinging();
      settleOpen?.resolve(frame);
      settleOpen = null;
    },
    drawn() {
      if (hasDrawn || isBuilding) return;
      hasDrawn = true;
      onFirstDraw();
    },
    pong() {
      missedPings = 0;
    },
    error: ({ message }) => fail(message),
  };

  function onMessage(event: MessageEvent) {
    if (event.source !== iframe.contentWindow) return;
    const reply = event.data as KitFrameReply | null;
    const handler = onReply[reply?.type as KitFrameReply['type']] as ((message: KitFrameReply) => void) | undefined;
    if (reply && handler) handler(reply);
  }

  return new Promise<KitFrame>((resolve, reject) => {
    settleOpen = { resolve, reject };
    waitForNewPage();
    window.addEventListener('message', onMessage);
    host.append(iframe);
  });
}
