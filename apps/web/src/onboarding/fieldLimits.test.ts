import { describe, expect, it } from 'vitest';
import { isStorableText } from '../../../api/src/is-storable-text';
import { isStorableName } from './fieldLimits';

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
    ['a name holding a null character', 'Maya\u0000', false],
    ['a name holding a lone surrogate', 'Maya\ud83d', false],
  ])('decides %s the same way on the web and at the API', (_caseName, name, isStorable) => {
    expect(isStorableName(name)).toBe(isStorable);
    expect(isStorableText(name)).toBe(isStorable);
  });
});
