import { type RefObject, useRef, useState } from 'react';
import { BIRTH_DATE_LABELS } from '../strings';
import { toLatinDigits } from './toLatinDigits';

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

type DatePart = keyof DateParts;

const PART_RULES = {
  day: { maxLength: 2, highestFirstDigit: 3, width: 'w-[72px]', autoComplete: 'bday-day', label: BIRTH_DATE_LABELS.day, placeholder: BIRTH_DATE_LABELS.dayPlaceholder },
  month: { maxLength: 2, highestFirstDigit: 1, width: 'w-[72px]', autoComplete: 'bday-month', label: BIRTH_DATE_LABELS.month, placeholder: BIRTH_DATE_LABELS.monthPlaceholder },
  year: { maxLength: 4, highestFirstDigit: 9, width: 'w-[104px]', autoComplete: 'bday-year', label: BIRTH_DATE_LABELS.year, placeholder: BIRTH_DATE_LABELS.yearPlaceholder },
} as const;

const WHOLE_DATE = /^\s*(\d{1,4})\D+(\d{1,2})\D+(\d{1,4})\s*$/;
const YEAR_LENGTH = 4;

function isDatePart(type: string): type is DatePart {
  return type in PART_RULES;
}

function getPartOrder(): DatePart[] {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' });
  return format.formatToParts().map(({ type }) => type as string).filter(isDatePart);
}

function isPartFinished(part: DatePart, digits: string) {
  const { maxLength, highestFirstDigit } = PART_RULES[part];
  return digits.length >= maxLength || Number(digits[0]) > highestFirstDigit;
}

// A pasted date arrives in the year-first form or in the order this field shows.
function readWholeDate(text: string, order: DatePart[]): DateParts | null {
  const [, first, second, third] = WHOLE_DATE.exec(text) ?? [];
  if (!first || !second || !third) return null;
  const partOrder = first.length === YEAR_LENGTH ? (['year', 'month', 'day'] as const) : order;
  const [firstPart, secondPart, thirdPart] = partOrder as [DatePart, DatePart, DatePart];
  return { [firstPart]: first, [secondPart]: second, [thirdPart]: third } as unknown as DateParts;
}

interface BirthDateFieldProps {
  labelledBy: string;
  value: DateParts;
  isInvalid: boolean;
  describedBy?: string;
  firstFieldRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: DateParts) => void;
}

export function BirthDateField({ labelledBy, value, isInvalid, describedBy, firstFieldRef, onChange }: BirthDateFieldProps) {
  const [order] = useState(getPartOrder);
  const inputs = useRef<Partial<Record<DatePart, HTMLInputElement | null>>>({});

  function focusNeighbour(part: DatePart, offset: number) {
    const neighbour = order[order.indexOf(part) + offset];
    if (neighbour) inputs.current[neighbour]?.focus();
  }

  function change(part: DatePart, rawText: string) {
    const text = toLatinDigits(rawText);
    const wholeDate = readWholeDate(text, order);
    if (wholeDate) {
      onChange(wholeDate);
      return;
    }
    const digits = text.replace(/\D/g, '').slice(0, PART_RULES[part].maxLength);
    onChange({ ...value, [part]: digits });
    const typedSeparator = digits !== '' && text !== digits && /\D$/.test(text);
    const typedLastDigit = digits.length > value[part].length && isPartFinished(part, digits);
    if (typedSeparator || typedLastDigit) focusNeighbour(part, 1);
  }

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-3.5">
      {order.map((part, index) => (
        <label key={part} className="label flex flex-col gap-0.75 text-ink-2">
          {PART_RULES[part].label}
          <input
            ref={(input) => {
              inputs.current[part] = input;
              if (index === 0 && firstFieldRef) firstFieldRef.current = input;
            }}
            className={`line-input ${PART_RULES[part].width} text-ink tabular-nums`}
            inputMode="numeric"
            autoComplete={PART_RULES[part].autoComplete}
            placeholder={PART_RULES[part].placeholder}
            aria-invalid={isInvalid}
            aria-describedby={describedBy}
            value={value[part]}
            onChange={(event) => change(part, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && value[part] === '') focusNeighbour(part, -1);
            }}
          />
        </label>
      ))}
    </div>
  );
}
