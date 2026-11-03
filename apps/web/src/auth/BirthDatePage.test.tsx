import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { BirthDatePage } from './BirthDatePage';

const AGE_LIMIT_WORDS = /\b13\b|thirteen|old enough|too young|minimum age|age limit|at least|or older/i;

vi.mock('./session', () => ({ signOut: vi.fn(), getAccessToken: async () => null }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

describe('the date of birth question', () => {
  it('gives no hint of an age limit in its words', () => {
    const { container } = renderWithQueryClient(<BirthDatePage />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder).join(' ');
    expect(`${container.textContent} ${placeholders}`).not.toMatch(AGE_LIMIT_WORDS);
  });

  it('shows no example date that a student could copy', () => {
    const { container } = renderWithQueryClient(<BirthDatePage />);

    const placeholders = [...container.querySelectorAll('input')].map((input) => input.placeholder);
    expect(placeholders.join('')).not.toMatch(/\d/);
  });

  it('sets no limit on the dates a student can type', () => {
    renderWithQueryClient(<BirthDatePage />);

    const year = screen.getByLabelText('Year');
    for (const attribute of ['min', 'max', 'pattern', 'list']) {
      expect(year.getAttribute(attribute)).toBeNull();
    }
  });

  it('has no age limit anywhere in the text that the web app ships', () => {
    const strings = readFileSync(join(import.meta.dirname, '../strings.ts'), 'utf8');

    expect(strings).not.toMatch(/\b13\b|thirteen|old enough|too young|minimum age|age limit/i);
  });

  it('leaves the age decision to the server', () => {
    const page = readFileSync(join(import.meta.dirname, 'BirthDatePage.tsx'), 'utf8');

    expect(page).not.toMatch(/getFullYear|Date\.now|new Date/);
  });
});
