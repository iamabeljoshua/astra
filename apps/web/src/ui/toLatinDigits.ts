const LATIN_DIGITS = '0123456789';

// Each numbering system the browser knows maps its own ten digits to Latin ones, so no table of scripts needs keeping.
const LATIN_DIGIT_BY_LOCAL_DIGIT = new Map(
  Intl.supportedValuesOf('numberingSystem').flatMap((numberingSystem) => {
    const format = new Intl.NumberFormat(`en-u-nu-${numberingSystem}`, { useGrouping: false });
    return [...LATIN_DIGITS].map((digit) => [format.format(Number(digit)), digit] as const);
  }),
);

export function toLatinDigits(text: string): string {
  return [...text].map((character) => LATIN_DIGIT_BY_LOCAL_DIGIT.get(character) ?? character).join('');
}
