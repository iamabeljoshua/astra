import type { ValidationOptions } from 'class-validator';
import { buildMessage, ValidateBy } from 'class-validator';

const NULL_CHARACTER = '\u0000';
const LONE_SURROGATE = /\p{Cs}/u;
// Anything but separators, control and format characters, combining marks, and characters that draw nothing.
const VISIBLE_CHARACTER = /[^\p{Z}\p{C}\p{M}\p{Default_Ignorable_Code_Point}]/u;

function isStorableText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    VISIBLE_CHARACTER.test(value) &&
    !value.includes(NULL_CHARACTER) &&
    !LONE_SURROGATE.test(value)
  );
}

/** Rejects text with nothing visible, null characters, and lone surrogates. Postgres fails on a null character with a server error, and a lone surrogate reads back changed. */
export function IsStorableText(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStorableText',
      validator: {
        validate: isStorableText,
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must have visible text and no invalid characters`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
