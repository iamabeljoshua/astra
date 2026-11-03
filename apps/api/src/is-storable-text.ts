import type { ValidationOptions } from 'class-validator';
import { buildMessage, ValidateBy } from 'class-validator';

const NULL_CHARACTER = '\u0000';

function isStorableText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && !value.includes(NULL_CHARACTER);
}

/** Rejects blank text and null characters. Postgres fails on a null character with a server error. */
export function IsStorableText(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStorableText',
      validator: {
        validate: isStorableText,
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must have visible text and no null characters`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
