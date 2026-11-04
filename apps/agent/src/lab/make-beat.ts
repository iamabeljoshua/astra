import { type Beat, parseBeat } from '@astra/contracts';

export function makeBeat(id: string, script: unknown[], expectsReply = false): Beat {
  const parsed = parseBeat({ id, script, expectsReply });
  if (!parsed.ok) throw new Error(`${id}: ${parsed.problem}`);
  return parsed.value;
}
