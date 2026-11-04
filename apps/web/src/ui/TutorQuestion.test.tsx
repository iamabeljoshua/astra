import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TutorQuestion } from './TutorQuestion';

const LINE = 'Check your email.';

function stubReducedMotion(isReduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') ? isReduced : false }));
}

function getTypedText(container: HTMLElement) {
  const shown = container.querySelector('h1 [aria-hidden="true"]')?.textContent ?? '';
  const untyped = container.querySelector('h1 .invisible')?.textContent ?? '';
  return shown.slice(0, shown.length - untyped.length);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TutorQuestion', () => {
  it('types the line while a screen reader gets it whole at once', () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { container } = render(<TutorQuestion line={LINE}><p>The field</p></TutorQuestion>);

    screen.getByRole('heading', { name: LINE });
    expect(getTypedText(container)).toBe('');
    act(() => {
      vi.advanceTimersByTime(26 * 5);
    });
    expect(getTypedText(container)).toBe(LINE.slice(0, 5));
  });

  it('holds the field back in sight until the line ends, then stops pulsing and stops its timer', () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { container } = render(<TutorQuestion line={LINE}><p>The field</p></TutorQuestion>);

    screen.getByText('The field');
    expect(screen.getByText('The field').parentElement?.className).toContain('opacity-0');
    expect(container.querySelector('.animate-speak')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(26 * LINE.length);
    });

    expect(screen.getByText('The field').parentElement?.className).not.toContain('opacity-0');
    expect(container.querySelector('.animate-speak')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows everything at once under reduced motion', () => {
    stubReducedMotion(true);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { container } = render(<TutorQuestion line={LINE}><p>The field</p></TutorQuestion>);

    expect(getTypedText(container)).toBe(LINE);
    expect(screen.getByText('The field').parentElement?.className).not.toContain('opacity-0');
    expect(container.querySelector('.animate-speak')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes the line as soon as the student acts', () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { container } = render(<TutorQuestion line={LINE}><input aria-label="Field" /></TutorQuestion>);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'a' });

    expect(getTypedText(container)).toBe(LINE);
    expect(vi.getTimerCount()).toBe(0);
  });
});
