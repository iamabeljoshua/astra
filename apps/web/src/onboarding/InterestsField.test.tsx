import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { STUDENT_INTEREST_LABELS } from '../strings';
import type { StudentInterest } from './answers';
import { InterestsField } from './InterestsField';

const INTEREST_LABELS = Object.values(STUDENT_INTEREST_LABELS);
const PATH_STEP = /([MLHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?|[a-zA-Z][^a-zA-Z]*/g;

// Follows the absolute moves in a path, and gives the fixed coordinate of each straight stroke.
function getStraightStrokeCoordinates(path: string) {
  let [x, y] = [Number.NaN, Number.NaN];
  const fixedCoordinates: number[] = [];
  for (const [, command, first, second] of path.matchAll(PATH_STEP)) {
    if (command === 'H') fixedCoordinates.push(y);
    if (command === 'V') fixedCoordinates.push(x);
    if (command === 'H' || command === 'M' || command === 'L') x = Number(first);
    if (command === 'V') y = Number(first);
    if (command === 'M' || command === 'L') y = Number(second);
    if (!command) [x, y] = [Number.NaN, Number.NaN];
  }
  return fixedCoordinates.filter((coordinate) => !Number.isNaN(coordinate));
}

function Field() {
  const [selected, setSelected] = useState<StudentInterest[]>([]);
  return <InterestsField selected={selected} onChange={setSelected} />;
}

function getPicture(label: string) {
  return screen.getByRole('button', { name: label }).querySelector('svg')!;
}

describe('the interest chips', () => {
  it('has twelve chips, each named only by its label', () => {
    render(<Field />);

    expect(screen.getAllByRole('button').map((chip) => chip.textContent)).toEqual(INTEREST_LABELS);
  });

  it.each(INTEREST_LABELS)('hides the picture on %s from a screen reader', (label) => {
    render(<Field />);

    const picture = getPicture(label);
    expect(picture.getAttribute('aria-hidden')).toBe('true');
    expect(picture.getAttribute('role')).toBeNull();
    expect(picture.textContent).toBe('');
  });

  it.each(INTEREST_LABELS)('draws %s in strokes of the text color, as Home does', (label) => {
    render(<Field />);

    const strokes = [...getPicture(label).querySelectorAll('path')];
    expect(strokes.length).toBeGreaterThan(0);
    for (const stroke of strokes) {
      expect(stroke.getAttribute('stroke')).toBe('currentColor');
      expect(stroke.getAttribute('fill')).toBe('none');
    }
    expect(getPicture(label).getAttribute('class')).toContain('thumb-strokes');
  });

  it.each(INTEREST_LABELS)('keeps the straight strokes of %s on half pixels, so they stay sharp', (label) => {
    render(<Field />);

    const paths = [...getPicture(label).querySelectorAll('path')].map((stroke) => stroke.getAttribute('d') ?? '');
    for (const coordinate of paths.flatMap(getStraightStrokeCoordinates)) {
      expect(coordinate % 1).toBe(0.5);
    }
  });

  it('draws a different picture for each interest', () => {
    render(<Field />);

    const drawings = INTEREST_LABELS.map((label) => getPicture(label).innerHTML);
    expect(new Set(drawings).size).toBe(INTEREST_LABELS.length);
  });

  it('keeps the picture on a chip when it is picked', () => {
    render(<Field />);
    const space = screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.space });

    fireEvent.click(space);

    expect(space.getAttribute('aria-pressed')).toBe('true');
    expect(getPicture(STUDENT_INTEREST_LABELS.space)).not.toBeNull();
  });
});
