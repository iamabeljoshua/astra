import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETURN_MS } from '../ui/dots/gatherDots';
import { ConnectingSaturn } from './ConnectingSaturn';

const painter = vi.hoisted(() => ({ handOver: vi.fn(), stop: vi.fn() }));

vi.mock('../ui/dots/gatherPainter', () => ({ createGatherPainter: () => painter }));

describe('the dots gathering while the tutor connects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

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
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.queryByTestId('connecting-saturn')).toBeNull();
    expect(painter.stop).toHaveBeenCalled();
  });

  it('comes back for a new room', () => {
    const { rerender } = render(<ConnectingSaturn isConnecting />);
    rerender(<ConnectingSaturn isConnecting={false} />);
    act(() => vi.advanceTimersByTime(RETURN_MS));
    rerender(<ConnectingSaturn isConnecting />);
    expect(screen.getByTestId('connecting-saturn').dataset.leaving).toBe('false');
  });

  it('comes back if the room starts connecting again as it leaves', () => {
    const { rerender } = render(<ConnectingSaturn isConnecting />);
    rerender(<ConnectingSaturn isConnecting={false} />);
    rerender(<ConnectingSaturn isConnecting />);
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByTestId('connecting-saturn').dataset.leaving).toBe('false');
  });
});
