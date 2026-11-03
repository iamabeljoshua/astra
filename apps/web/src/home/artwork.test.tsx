import { render, screen } from '@testing-library/react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findArtwork } from './artwork';

const PUBLIC_FOLDER = join(import.meta.dirname, '../../public');
const LIBRARY_PATH = join(import.meta.dirname, '../../../api/src/picks/library.json');
const { topics } = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8')) as { topics: { id: string; artwork: string }[] };

describe('the artwork table', () => {
  it.each(topics)('shows a real picture or drawing for $id', ({ artwork: name }) => {
    const artwork = findArtwork(name);

    if (artwork?.kind === 'picture') {
      expect(existsSync(join(PUBLIC_FOLDER, artwork.src))).toBe(true);
      expect(artwork.description).not.toBe('');
    } else if (artwork?.kind === 'drawing') {
      render(<artwork.Drawing />);
      expect(screen.getByRole('img').querySelector('path')).not.toBeNull();
    } else {
      expect.fail(`${name} has no row in the artwork table`);
    }
  });

  it('has a row for every picture file', () => {
    for (const file of readdirSync(join(PUBLIC_FOLDER, 'picks'))) {
      expect(findArtwork(basename(file, '.jpg'))).toMatchObject({ kind: 'picture', src: `/picks/${file}` });
    }
  });
});
