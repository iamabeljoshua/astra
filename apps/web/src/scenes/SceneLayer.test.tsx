import { getBoardAt } from '@astra/board';
import type { ElementId, RichScene } from '@astra/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SceneLayer } from './SceneLayer';
import type { SceneStage } from './sceneStage';

const SCENE = { kind: 'richScene', id: 'slope' as ElementId, engine: 'manimgx', sceneId: 'slope-1a2b', moments: { secant: 4 }, parts: [], durationSeconds: 20 } satisfies RichScene;
const BOARD = getBoardAt([{ kind: 'command', atMs: 0, command: SCENE, overMs: null }, { kind: 'command', atMs: 0, command: { kind: 'runSimulation', target: 'slope' as ElementId, action: 'play', until: 'secant' }, overMs: 2000 }], 1000);

const makeStage = (canDraw: boolean): SceneStage => ({ load: vi.fn(), draw: vi.fn(), canDraw: () => canDraw, free: vi.fn() });
const EMPTY = { elements: new Map(), focus: null };

describe('the scene layer', () => {
  it('draws the second the board asks for, and fades in over the plain board', () => {
    const stage = makeStage(true);
    render(<SceneLayer board={BOARD} atMs={1000} stage={stage} onContainer={() => {}} />);
    expect(stage.draw).toHaveBeenCalledWith('slope-1a2b', 2);
    expect(screen.getByTestId('scene-layer').style.opacity).toBe('1');
  });

  it('stays out of sight when the take could not be drawn, so the plain board shows', () => {
    const stage = makeStage(false);
    render(<SceneLayer board={BOARD} atMs={1000} stage={stage} onContainer={() => {}} />);
    expect(stage.draw).not.toHaveBeenCalled();
    expect(screen.getByTestId('scene-layer').style.opacity).toBe('0');
  });

  it('stays out of sight with no scene on the board', () => {
    render(<SceneLayer board={EMPTY} atMs={0} stage={makeStage(true)} onContainer={() => {}} />);
    expect(screen.getByTestId('scene-layer').style.opacity).toBe('0');
  });
});
