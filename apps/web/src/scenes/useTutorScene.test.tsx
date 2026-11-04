import type { BoardState } from '@astra/board';
import type { SceneAgentMessage, SceneBrowserMessage } from '@astra/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveVoice } from '../voice/liveVoice';
import { hasDrawableScene, useTutorScene } from './useTutorScene';

const engine = vi.hoisted(() => ({ canPlay: true, load: vi.fn(async () => true), free: vi.fn(), createStage: vi.fn(), askedForDevice: vi.fn() }));

vi.mock('./sceneEngine', () => ({
  getCanPlayScenes: async () => {
    engine.askedForDevice();
    return engine.canPlay;
  },
}));
vi.mock('./sceneStage', () => ({
  createSceneStage: (container: HTMLElement) => {
    engine.createStage(container);
    return { load: engine.load, free: engine.free, draw: () => {}, canDraw: () => true };
  },
}));

function makeVoice() {
  const sent: SceneBrowserMessage[] = [];
  const listeners = new Set<(message: SceneAgentMessage) => void>();
  const voice = {
    sendScene: (message: SceneBrowserMessage) => void sent.push(message),
    onSceneMessage(listener: (message: SceneAgentMessage) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as LiveVoice;
  return { voice, sent, tell: (message: SceneAgentMessage) => listeners.forEach((listener) => listener(message)), getListenerCount: () => listeners.size };
}

beforeEach(() => {
  engine.canPlay = true;
  engine.load.mockReset();
  engine.load.mockResolvedValue(true);
  engine.free.mockReset();
  engine.createStage.mockReset();
  engine.askedForDevice.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('with scenes off', () => {
  it('asks nothing of the graphics card, makes no stage, and listens to nothing', async () => {
    const { voice, sent, getListenerCount } = makeVoice();
    const { result } = renderHook(() => useTutorScene(voice, false));
    await act(async () => {});
    expect(result.current.stage).toBeNull();
    expect(engine.createStage).not.toHaveBeenCalled();
    expect(engine.askedForDevice).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(getListenerCount()).toBe(0);
    expect(document.body.children.length).toBeLessThan(2);
  });
});

describe('with scenes on', () => {
  it('says what the page can play, so nothing is written for a page that cannot', async () => {
    engine.canPlay = false;
    const { voice, sent } = makeVoice();
    renderHook(() => useTutorScene(voice, true));
    await waitFor(() => expect(sent).toEqual([{ type: 'sceneDevice', canPlay: false }]));
  });

  it('loads what the tutor sends and says when it can draw', async () => {
    const { voice, sent, tell } = makeVoice();
    renderHook(() => useTutorScene(voice, true));
    await waitFor(() => expect(sent).toHaveLength(1));
    act(() => tell({ type: 'loadScene', sceneId: 'slope-1', durationSeconds: 5 }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ type: 'sceneLoaded', sceneId: 'slope-1' }));
    expect(engine.load).toHaveBeenCalledWith('slope-1', 5);
  });

  it('refuses a damaged take, and the session goes on with no word', async () => {
    engine.load.mockResolvedValue(false);
    const { voice, sent, tell } = makeVoice();
    renderHook(() => useTutorScene(voice, true));
    await waitFor(() => expect(sent).toHaveLength(1));
    act(() => tell({ type: 'loadScene', sceneId: 'slope-1', durationSeconds: 5 }));
    await waitFor(() => expect(sent.at(-1)).toEqual({ type: 'sceneRefused', sceneId: 'slope-1' }));
  });

  it('keeps the canvas off screen until it lands, moves it in, and parks it again', async () => {
    const { voice } = makeVoice();
    const { result, unmount } = renderHook(() => useTutorScene(voice, true));
    await waitFor(() => expect(result.current.stage).not.toBeNull());
    const host = engine.createStage.mock.calls[0]?.[0] as HTMLElement;
    const parking = host.parentElement as HTMLElement;
    expect(parking.style.left).toBe('-200vw');
    const slot = document.createElement('div');
    result.current.onContainer(slot);
    expect(host.parentElement).toBe(slot);
    result.current.onContainer(null);
    expect(host.parentElement).toBe(parking);
    unmount();
    expect(parking.isConnected).toBe(false);
    expect(engine.free).toHaveBeenCalled();
  });
});

describe('whether a scene takes the visual', () => {
  const scene = { id: 'scene-1', content: { kind: 'richScene', sceneId: 'slope-1' } };
  const boardWith = (...elements: { id: string; content: object }[]) => ({ elements: new Map(elements.map((element) => [element.id, element])) }) as unknown as BoardState;
  const stage = (canDraw: boolean) => ({ load: async () => true, draw: () => {}, free: () => {}, canDraw: () => canDraw });

  it('does once its take can draw', () => {
    expect(hasDrawableScene(boardWith(scene), stage(true))).toBe(true);
  });

  it('does not before, so a student never sees an empty box', () => {
    expect(hasDrawableScene(boardWith(scene), stage(false))).toBe(false);
    expect(hasDrawableScene(boardWith(), stage(true))).toBe(false);
    expect(hasDrawableScene(boardWith(scene), null)).toBe(false);
  });
});
