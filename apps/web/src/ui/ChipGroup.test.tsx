import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChipGroup } from './ChipGroup';

const OPTIONS = [
  { value: 'space', label: 'Space' },
  { value: 'music', label: 'Music' },
];

function Interests() {
  const [selected, setSelected] = useState<string[]>([]);
  return <ChipGroup label="Interests" options={OPTIONS} selected={selected} onChange={setSelected} />;
}

describe('ChipGroup', () => {
  it('names its group and lets a student pick several, and undo one', () => {
    render(<Interests />);
    screen.getByRole('group', { name: 'Interests' });
    const space = screen.getByRole('button', { name: 'Space' });
    const music = screen.getByRole('button', { name: 'Music' });

    fireEvent.click(space);
    fireEvent.click(music);
    expect([space.getAttribute('aria-pressed'), music.getAttribute('aria-pressed')]).toEqual(['true', 'true']);

    fireEvent.click(space);
    expect([space.getAttribute('aria-pressed'), music.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
  });
});
