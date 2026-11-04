import { describe, expect, it } from 'vitest';
import { checkMathLine, checkMathStep } from '../src/tutor/check-math.ts';

describe('checking a line of math', () => {
  it.each([
    ['2 + 2 = 4'],
    ['9.8 \\times 2 = 19.6'],
    ['\\frac{1}{3} = 0.33'],
    ['\\pi = 3.14'],
    ['\\sqrt{16} = 4'],
    ['2^{10} = 1024'],
    ['3(4 + 1) = 15'],
    ['\\frac{1}{2} \\cdot 8 = 4'],
    ['v = 4.2 + 3 = 7.2'],
    ['7 \\approx 7.04'],
  ])('passes %s', (tex) => {
    expect(checkMathLine(tex).status).toBe('right');
  });

  it.each([['2 + 2 = 5'], ['9.8 \\times 2 = 19.7'], ['\\frac{1}{3} = 0.5'], ['v = 4.2 + 3 = 7.5'], ['7 \\approx 9'], ['\\sqrt{16} = 5'], ['-3^2 = 9']])('refuses %s', (tex) => {
    expect(checkMathLine(tex).status).toBe('wrong');
  });

  it.each([['2\\frac{1}{2} = 2.5'], ['\\sin 30 = 0.5'], ['\\cos 60 = 0.5'], ['2x + 3 = 11'], ['g = 9.8'], ['v = u + at'], ['x < 5'], ['\\int_0^1 x dx = \\frac{1}{2}'], ['\\text{speed} = 5'], ['\\frac{d}{dx} x^2 = 2x'], ['']])('does not judge %s', (tex) => {
    expect(checkMathLine(tex).status).toBe('cannotCheck');
  });
});

describe('checking a rewrite against the line before it', () => {
  it.each([
    ['2x + 3 = 11', '2x = 11 - 3'],
    ['2x = 11 - 3', '2x = 8'],
    ['2x = 8', 'x = \\frac{8}{2}'],
    ['x = \\frac{8}{2}', 'x = 4'],
    ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0'],
    ['(x + 1)^2', 'x^2 + 2x + 1'],
    ['v - u = at', 'v = u + at'],
    ['\\frac{x}{2} = 3', 'x = 6'],
  ])('passes %s to %s', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('right');
  });

  it.each([
    ['2x + 3 = 11', '2x = 11 + 3'],
    ['2x = 8', 'x = 16'],
    ['(x + 1)^2', 'x^2 + 1'],
    ['x^2 - 5x + 6 = 0', '(x - 2)(x + 3) = 0'],
    ['2x = 8', 'x = 8 - 2 = 7'],
  ])('refuses %s to %s', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('wrong');
  });

  it.each([
    ['v = u + at', 'a = \\frac{v - u}{t}'],
    ['2x + 3 = 11', '\\text{so} x = 4'],
    ['2x + 3', '2x + 3 = 11'],
    ['x^2', '4'],
  ])('does not judge %s to %s', (before, after) => {
    expect(checkMathStep(before, after).status).toBe('cannotCheck');
  });
});
