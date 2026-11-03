import type { ValidationOptions } from 'class-validator';
import { buildMessage, ValidateBy } from 'class-validator';
import { isValidBirthDate } from '../auth/age-gate';

/** Accepts a real, past date written as YYYY-MM-DD. */
export function IsBirthDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isBirthDate',
      validator: {
        validate: (value: unknown) => isValidBirthDate(value, new Date()),
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a real date in the form YYYY-MM-DD`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
