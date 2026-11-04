import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BOARD_PICTURE_CREDITS, LEGAL_PAGES, PICTURE_CREDITS } from '../strings';
import { LegalPage } from './LegalPage';

const APP_ROOT = join(__dirname, '../..');
const PICKS_FOLDER = join(APP_ROOT, 'public/picks');
const CREDITS_DOC = join(APP_ROOT, '../../docs/credits.md');
const TABLE_ROW_OF_A_PICTURE = /^\| `([a-z-]+\.jpg)` \| (.+?) \| /;
const BOARD_HEADING = '## Pictures on the board';
const AFTER_BOARD_HEADING = '## Our own drawings';
const NASA_CREDIT = 'Credit NASA';

function readPictureRows(section: string) {
  return section.split('\n').flatMap((line) => {
    const match = TABLE_ROW_OF_A_PICTURE.exec(line);
    return match ? [{ file: match[1], work: (match[2] as string).replaceAll('*', '') }] : [];
  });
}

function readDocumentedPictures() {
  const [picks = '', fromBoard = ''] = readFileSync(CREDITS_DOC, 'utf8').split(BOARD_HEADING);
  return { picks: readPictureRows(picks), board: readPictureRows(fromBoard.split(AFTER_BOARD_HEADING)[0] as string) };
}

describe('the credits', () => {
  it('has one line for every picture in the picks folder', () => {
    const credited = PICTURE_CREDITS.map(({ file }) => file).sort();

    expect(credited).toEqual(readdirSync(PICKS_FOLDER).sort());
  });

  it('words every picture as docs/credits.md does', () => {
    expect(PICTURE_CREDITS).toEqual(readDocumentedPictures().picks);
    expect(BOARD_PICTURE_CREDITS).toEqual(readDocumentedPictures().board);
  });

  it('shows every NASA credit on the page, exactly as docs/credits.md words it', () => {
    const { picks, board } = readDocumentedPictures();
    const nasaLines = [...picks, ...board].filter(({ work }) => work.includes(NASA_CREDIT));

    render(
      <MemoryRouter>
        <LegalPage legalDocument={LEGAL_PAGES.credits} />
      </MemoryRouter>,
    );

    expect(nasaLines.length).toBeGreaterThanOrEqual(5);
    for (const { work } of nasaLines) expect(screen.getByText(work)).toBeTruthy();
  });
});
