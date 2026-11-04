import { type ParseResult, type Place, readFields, readString, readVariant, toParseResult, type VariantTable } from './read.ts';
import { RECAP_LINE_MAX_CHARACTERS, type SessionRecap } from './session-recap.ts';

const readLine = (place: Place) => readString(place, RECAP_LINE_MAX_CHARACTERS);

const RECAPS: VariantTable<SessionRecap, 'kind'> = {
  tag: 'kind',
  variants: {
    lesson: {
      keys: ['covered', 'gotRight', 'tryNext'],
      read: (fields) => {
        const gotRight = fields.at('gotRight');
        return { kind: 'lesson', covered: readLine(fields.at('covered')), gotRight: gotRight.value === null ? null : readLine(gotRight), tryNext: readLine(fields.at('tryNext')) };
      },
    },
    gentle: { keys: ['line'], read: (fields) => ({ kind: 'gentle', line: readLine(fields.at('line')) }) },
  },
};

export function readSessionRecap(place: Place): SessionRecap {
  return readVariant<SessionRecap>(place, RECAPS);
}

export function parseSessionRecap(value: unknown): ParseResult<SessionRecap> {
  return toParseResult(() => readSessionRecap({ value, path: 'recap' }));
}
