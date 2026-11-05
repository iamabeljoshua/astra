import type { KitFrameReply } from '@astra/board/scene3d';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type KitFrame, openKitFrame } from './kitFrame';

vi.mock('../api/fetchAppFile', () => ({ fetchAppFile: async () => new ArrayBuffer(8) }));

const LOAD_LIMIT_MS = 15_000;
const FIRST_DRAW_LIMIT_MS = 2000;
const SLOW_REBUILD_MS = 5000;
const FRAME_MS = 100;
const READY: KitFrameReply = { type: 'ready', issues: [], unusedMoments: [], parts: [], params: {}, sinceStartMs: 0, buildMs: 0, buffer: [1, 1, 1] };

async function openReadyFrame() {
  const host = document.createElement('div');
  document.body.append(host);
  const onLost = vi.fn();
  const onFirstDraw = vi.fn();
  const opening = openKitFrame({ host, take: { code: 'function scene(kit) {}', timing: { moments: {}, duration: 20 } }, theme: 'light', limitMs: LOAD_LIMIT_MS, onLost, onFirstDraw });
  await vi.advanceTimersByTimeAsync(0);
  const iframe = host.querySelector('iframe') as HTMLIFrameElement;
  const say = (reply: KitFrameReply) => window.dispatchEvent(new MessageEvent('message', { data: reply, source: iframe.contentWindow }));
  say({ type: 'loaded' });
  say(READY);
  const frame: KitFrame = await opening;
  return { frame, say, onLost };
}

const playFor = async (frame: KitFrame, ms: number) => {
  for (let at = 0; at < ms; at += FRAME_MS) {
    frame.render(at / 1000);
    await vi.advanceTimersByTimeAsync(FRAME_MS);
  }
};

describe('a change of theme, which builds the scene again in a new page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('does not take a last frame from the old page for a frame from the new one', async () => {
    const { frame, say } = await openReadyFrame();
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    expect(frame.hasDrawn()).toBe(true);
    frame.setTheme('dark');
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    expect(frame.hasDrawn()).toBe(false);
    say({ type: 'loaded' });
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    expect(frame.hasDrawn()).toBe(false);
    say(READY);
    expect(frame.hasDrawn()).toBe(false);
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    expect(frame.hasDrawn()).toBe(true);
  });

  it('keeps the kit through a build slower than the limits on a page that is playing', async () => {
    const { frame, say, onLost } = await openReadyFrame();
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    frame.setTheme('dark');
    await playFor(frame, SLOW_REBUILD_MS);
    expect(onLost).not.toHaveBeenCalled();
    say({ type: 'loaded' });
    await playFor(frame, SLOW_REBUILD_MS);
    expect(onLost).not.toHaveBeenCalled();
    say(READY);
    say({ type: 'drawn', seconds: 1, costMs: 1 });
    await playFor(frame, SLOW_REBUILD_MS / 4);
    expect(frame.hasDrawn()).toBe(true);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('drops a build that never finishes, at the limit a first build has', async () => {
    const { frame, onLost } = await openReadyFrame();
    frame.setTheme('dark');
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS - 1);
    expect(onLost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onLost).toHaveBeenCalledOnce();
  });

  it('still drops a new page that is ready and draws nothing', async () => {
    const { frame, say, onLost } = await openReadyFrame();
    frame.setTheme('dark');
    say({ type: 'loaded' });
    say(READY);
    frame.render(1);
    await vi.advanceTimersByTimeAsync(FIRST_DRAW_LIMIT_MS);
    expect(onLost).toHaveBeenCalledOnce();
  });
});
