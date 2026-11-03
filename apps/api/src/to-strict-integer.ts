import { Transform } from 'class-transformer';

const PLAIN_DIGITS = /^-?\d+$/;

function readStrictInteger(value: unknown): unknown {
  return typeof value === 'string' && PLAIN_DIGITS.test(value) ? Number(value) : value;
}

/** Reads a query or route value as a number only if it is plain digits, so `@IsInt()` rejects `0x10`, `1e1`, and ` 5`. */
export function ToStrictInteger(): PropertyDecorator {
  return Transform(({ value }) => readStrictInteger(value));
}
