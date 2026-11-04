import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectingSaturn } from './ConnectingSaturn';

const painter = vi.hoisted(() => ({ handOver: vi.fn(), stop: vi.fn(), returned: null as null | (() => void), options: null as null | { isReducedMotion: boolean } }));

vi.mock('../ui/dots/gatherPainter', () => ({
  createGatherPainter(options: { isReducedMotion: boolean; onReturned(): void }) {
    painter.returned = options.onReturned;
    painter.options = options;
    return { handOver: painter.handOver, stop: painter.stop };
  },
}));

describe('the dots gathering while the tutor connects', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('shows nothing for a room that is not connecting', () => {
    render(<ConnectingSaturn isConnecting={false} />);
    expect(screen.queryByTestId('connecting-saturn')).toBeNull();
  });

  it('hands over as soon as the tutor is there, then stops its canvas and goes', () => {
    const { rerender } = render(<ConnectingSaturn isConnecting />);
    const shown = screen.getByTestId('connecting-saturn');
    expect(shown.dataset.leaving).toBe('false');
    rerender(<ConnectingSaturn isConnecting={false} />);
    expect(painter.handOver).toHaveBeenCalledOnce();
    expect(shown.dataset.leaving).toBe('true');
    act(() => painter.returned?.());
    expect(screen.queryByTestId('connecting-saturn')).toBeNull();
    expect(painter.stop).toHaveBeenCalled();
  });

  it('comes back for a new room', () => {
    const { rerender } = render(<ConnectingSaturn isConnecting />);
    rerender(<ConnectingSaturn isConnecting={false} />);
    act(() => painter.returned?.());
    rerender(<ConnectingSaturn isConnecting />);
    expect(screen.getByTestId('connecting-saturn').dataset.leaving).toBe('false');
  });
});
