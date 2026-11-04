import { describe, expect, it } from 'vitest';
import { sayNumber } from '../src/tutor/tools/spoken-result.ts';

describe('a number said out loud', () => {
  it.each([
    ['0', 'zero'],
    ['7', 'seven'],
    ['19', 'nineteen'],
    ['21', 'twenty-one'],
    ['100', 'one hundred'],
    ['391', 'three hundred ninety-one'],
    ['4913', 'four thousand nine hundred thirteen'],
    ['9261', 'nine thousand two hundred sixty-one'],
    ['19683', 'nineteen thousand six hundred eighty-three'],
    ['1000000', 'one million'],
    ['37323207', 'thirty-seven million three hundred twenty-three thousand two hundred seven'],
    ['-7', 'minus seven'],
    ['42.875', 'forty-two point eight seven five'],
    ['0.428571', 'zero point four two eight five seven one'],
    ['-0.5', 'minus zero point five'],
  ])('%s is %s', (text, words) => {
    expect(sayNumber(text)).toBe(words);
  });

  it('has no words for what is too long to say or is not a plain number', () => {
    expect(sayNumber('1'.repeat(16))).toBeNull();
    expect(sayNumber('1.23457e+21')).toBeNull();
    expect(sayNumber('38416/6561')).toBeNull();
  });
});
