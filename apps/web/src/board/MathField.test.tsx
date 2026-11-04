import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKeyedTex, MathField } from './MathField';
import type { MathFieldElement } from './loadMathField';

const keys = vi.hoisted(() => ({ show: vi.fn(), hide: vi.fn(), field: null as MathFieldElement | null }));

vi.mock('./loadMathField', () => ({
  loadMathField: async () => ({
    makeField() {
      const field = document.createElement('input') as unknown as MathFieldElement;
      field.getValue = (format) => (format === 'latex' ? '\\frac{x}{2}=4' : '(x)/(2)=4');
      keys.field = field;
      return field;
    },
    showKeys: keys.show,
    onKeysMoved: () => () => {},
    hideKeys: keys.hide,
  }),
}));

describe('reading what was set in the math keys', () => {
  it('takes the board can set', () => {
    expect(getKeyedTex('\\frac{x}{2} = 4')).toBe('\\frac{x}{2} = 4');
    expect(getKeyedTex('\\mleft(x\\mright)=2')).toBe('\\left(x\\right)=2');
  });

  it.each(['', '   ', 'x=\\placeholder{}', '\\href{http://a}{b}', `x=${'1'.repeat(3000)}`])('leaves %s to the plain characters', (tex) => {
    expect(getKeyedTex(tex)).toBeNull();
  });
});

describe('the math keys', () => {
  afterEach(() => vi.clearAllMocks());

  const open = async () => {
    const onLine = vi.fn();
    const onTyping = vi.fn();
    const view = render(<MathField onLine={onLine} onTyping={onTyping} />);
    await act(async () => {});
    return { onLine, onTyping, field: keys.field as MathFieldElement, ...view };
  };

  it('opens its keyboard, sends a finished line, and clears for the next', async () => {
    const { onLine, field } = await open();
    expect(screen.getByTestId('math-field').contains(field)).toBe(true);
    expect(keys.show).toHaveBeenCalled();
    field.dispatchEvent(new Event('change'));
    expect(onLine).toHaveBeenCalledExactlyOnceWith({ text: '(x)/(2)=4', tex: '\\frac{x}{2}=4' });
    expect(field.value).toBe('');
  });

  it('sends nothing when the field only loses focus', async () => {
    const { onLine, field } = await open();
    field.blur();
    field.dispatchEvent(new Event('change'));
    expect(onLine).not.toHaveBeenCalled();
  });

  it('sends nothing when the student goes to another window, which leaves the field active', async () => {
    const { onLine, field } = await open();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(document.activeElement).toBe(field);
    field.dispatchEvent(new Event('change'));
    expect(onLine).not.toHaveBeenCalled();
    hasFocus.mockRestore();
  });

  it('puts its keyboard away when closed', async () => {
    const { unmount } = await open();
    unmount();
    await act(async () => {});
    expect(keys.hide).toHaveBeenCalled();
  });
});
