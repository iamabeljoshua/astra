import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BoardCaption } from './BoardCaption';

describe('the tutor words beside the board', () => {
  it('shows what has been heard, and holds a place for what is coming, unseen', () => {
    render(<BoardCaption heard={['The', 'ball']} coming={['falls.']} />);
    expect(screen.getByTestId('current-word').textContent).toBe('ball ');
    expect(screen.getByText('falls.').className).toContain('board-word-coming');
  });

  it('keeps what was said before, faint, once a new turn starts', () => {
    const { rerender } = render(<BoardCaption heard={['Not', 'quite.']} coming={[]} />);
    rerender(<BoardCaption heard={[]} coming={[]} />);
    rerender(<BoardCaption heard={['Look', 'here.']} coming={[]} />);
    expect(screen.getByText('Not quite.').className).toContain('board-utterance-past');
    expect(screen.getByTestId('current-word').textContent).toBe('here. ');
  });

  it('keeps at most two earlier lines', () => {
    const { rerender } = render(<BoardCaption heard={['one']} coming={[]} />);
    for (const word of ['two', 'three', 'four']) {
      rerender(<BoardCaption heard={[]} coming={[]} />);
      rerender(<BoardCaption heard={[word]} coming={[]} />);
    }
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.getByText('two').className).toContain('board-utterance-past');
  });

  it('shows the first word from code while no turn is running', () => {
    render(<BoardCaption heard={[]} coming={[]} firstWord="Hm." />);
    expect(screen.getByTestId('first-word').textContent).toBe('Hm.');
  });
});
