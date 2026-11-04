import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_LABELS } from '../strings';
import { NoisePrompt } from './NoisePrompt';

function setTouchScreen(isTouch: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: isTouch && query.includes('coarse') }));
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('the noise prompt', () => {
  it('says nothing in a quiet room', () => {
    setTouchScreen(false);
    render(<NoisePrompt sessionId="a" isRoomNoisy={false} isHolding={false} />);
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
  });

  it('suggests holding Space on a keyboard, in the words Abel asked for', () => {
    setTouchScreen(false);
    render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    expect(screen.getByText('It sounds noisy. Hold Space to talk.')).toBeTruthy();
  });

  it('never says Space on a phone', () => {
    setTouchScreen(true);
    render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    expect(screen.getByText(VOICE_LABELS.noisyHoldTalk).textContent).not.toContain('Space');
  });

  it('goes when dismissed, and comes back neither in this session nor on a reload of it', async () => {
    setTouchScreen(false);
    const user = userEvent.setup();
    const first = render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    await user.click(screen.getByRole('button', { name: VOICE_LABELS.dismissNoisy }));
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
    first.rerender(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
    first.unmount();
    render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
  });

  it('goes for good once the student holds', () => {
    setTouchScreen(false);
    const { rerender } = render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    rerender(<NoisePrompt sessionId="a" isRoomNoisy isHolding />);
    rerender(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />);
    expect(screen.queryByText(VOICE_LABELS.noisyHoldSpace)).toBeNull();
  });

  it('shows again in another session', () => {
    setTouchScreen(false);
    render(<NoisePrompt sessionId="a" isRoomNoisy isHolding={false} />).unmount();
    render(<NoisePrompt sessionId="b" isRoomNoisy isHolding={false} />);
    expect(screen.getByText(VOICE_LABELS.noisyHoldSpace)).toBeTruthy();
  });
});
