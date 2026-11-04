import { describe, expect, it } from 'vitest';
import { isStorableText } from '../../../api/src/is-storable-text';
import { isStorableName } from './fieldLimits';

const LAST_CODE_POINT = 0x10ffff;

describe('the rule for a name', () => {
  it.each([
    ['a plain name', 'Maya', true],
    ['a name with an accent', 'Zoë', true],
    ['a name in another script', '玛雅', true],
    ['an emoji', '\u{1F642}', true],
    ['a name holding a zero-width joiner', 'Ma‍ya', true],
    ['nothing', '', false],
    ['spaces', '   ', false],
    ['a no-break space', ' ', false],
    ['a zero-width space', '​', false],
    ['a byte order mark', '﻿', false],
    ['a soft hyphen', '­', false],
    ['a combining mark alone', '́', false],
    // Only one class in the rule refuses each of these three, so dropping that class fails its row.
    ['a tab', '\t', false],
    ['an Arabic number sign', '؀', false],
    ['a Hangul filler', 'ㅤ', false],
    // Unicode gives these three no ink, and each is a symbol the classes above let through.
    ['a blank Braille pattern', '\u2800', false],
    ['a null notehead', '\u{1D159}', false],
    ['an object replacement character', '\uFFFC', false],
    ['a name holding a blank Braille pattern', 'Ma\u2800ya', true],
    ['a name holding a null character', 'Maya\u0000', false],
    ['a name holding a lone surrogate', 'Maya\ud83d', false],
  ])('decides %s the same way on the web and at the API', (_caseName, name, isStorable) => {
    expect(isStorableName(name)).toBe(isStorable);
    expect(isStorableText(name)).toBe(isStorable);
  });

  it('agrees with the API on every code point, alone and inside a name', () => {
    const disagreements: string[] = [];
    for (let codePoint = 0; codePoint <= LAST_CODE_POINT; codePoint += 1) {
      const character = String.fromCodePoint(codePoint);
      const agrees = [character, `Maya${character}`].every((name) => isStorableName(name) === isStorableText(name));
      if (!agrees) disagreements.push(`U+${codePoint.toString(16).toUpperCase()}`);
    }

    expect(disagreements).toEqual([]);
  });
});
