import { Transform } from 'class-transformer';

const PLAIN_DIGITS = /^-?\d+$/;

function readStrictInteger(value: unknown): unknown {
  return typeof value === 'string' && PLAIN_DIGITS.test(value) ? Number(value) : value;
}

export function ToStrictInteger(): PropertyDecorator {
  return Transform(({ value }) => readStrictInteger(value));
}
