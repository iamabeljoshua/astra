import type { ValidationOptions } from 'class-validator';
import { buildMessage, ValidateBy } from 'class-validator';

const NULL_CHARACTER = '\u0000';
const LONE_SURROGATE = /\p{Cs}/u;
const VISIBLE_CHARACTER = /[^\p{Z}\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800\uFFFC\u{1D159}]/u;

const hasOnlyStorableCharacters = (text: string) => !text.includes(NULL_CHARACTER) && !LONE_SURROGATE.test(text);

export function isStorableText(value: unknown): boolean {
  return typeof value === 'string' && VISIBLE_CHARACTER.test(value) && hasOnlyStorableCharacters(value);
}

function holdsOnlyStorableText(value: unknown): boolean {
  if (typeof value === 'string') return hasOnlyStorableCharacters(value);
  if (typeof value !== 'object' || value === null) return true;
  return Object.entries(value).every(([key, inner]) => hasOnlyStorableCharacters(key) && holdsOnlyStorableText(inner));
}

/** Postgres fails on a null character with a server error, and a lone surrogate reads back changed. */
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

/** The same two characters anywhere in a value stored as JSON, where Postgres refuses them as well. */
export function IsStorableJson(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isStorableJson',
      validator: {
        validate: holdsOnlyStorableText,
        defaultMessage: buildMessage((eachPrefix) => `${eachPrefix}$property must have no invalid characters`, validationOptions),
      },
    },
    validationOptions,
  );
}
