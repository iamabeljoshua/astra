import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_LABELS } from '../strings';
import { chooseTheme, getAppliedTheme } from './theme';
import { ThemeToggle } from './ThemeToggle';

const indexHtml = readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8');
const prePaintScript = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

function loadPage() {
  delete document.documentElement.dataset.theme;
  new Function(prePaintScript)();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the script that runs before first paint', () => {
  it('sits in the head ahead of the stylesheet', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));

    expect(prePaintScript).not.toBe('');
    expect(head.indexOf(prePaintScript)).toBeLessThan(head.indexOf('rel="stylesheet"'));
  });

  it('uses light when nothing is saved', () => {
    loadPage();

    expect(getAppliedTheme()).toBe('light');
  });

  it('applies a saved dark choice', () => {
    chooseTheme('dark');

    loadPage();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getAppliedTheme()).toBe('dark');
  });

  it('applies a saved light choice', () => {
    chooseTheme('dark');
    chooseTheme('light');

    loadPage();

    expect(getAppliedTheme()).toBe('light');
  });

  it('uses light when the saved value is not a theme', () => {
    localStorage.setItem('theme', 'purple');

    loadPage();

    expect(getAppliedTheme()).toBe('light');
  });

  it('uses light when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    loadPage();

    expect(getAppliedTheme()).toBe('light');
  });
});

describe('ThemeToggle', () => {
  it('shows the applied theme as pressed', () => {
    chooseTheme('dark');
    loadPage();

    render(createElement(ThemeToggle));

    expect(screen.getByRole('button', { name: THEME_LABELS.dark }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: THEME_LABELS.light }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the page and keeps the choice for the next load', () => {
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByRole('button', { name: THEME_LABELS.dark }));

    expect(getAppliedTheme()).toBe('dark');
    expect(screen.getByRole('button', { name: THEME_LABELS.dark }).getAttribute('aria-pressed')).toBe('true');
    loadPage();
    expect(getAppliedTheme()).toBe('dark');
  });

  it('still switches the page when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    render(createElement(ThemeToggle));

    fireEvent.click(screen.getByRole('button', { name: THEME_LABELS.dark }));

    expect(getAppliedTheme()).toBe('dark');
  });
});
