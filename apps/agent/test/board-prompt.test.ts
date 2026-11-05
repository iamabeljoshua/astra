import { parseSceneCommand } from '@astra/contracts';
import { describe, expect, it } from 'vitest';
import { DRAWN_KINDS } from '../src/tutor/board-memory.ts';
import { PROMPT_VERSIONS, TUTOR_PROMPT } from '../src/tutor/prompt.ts';

function getWrittenCommands(prompt: string): string[] {
  const commands: string[] = [];
  for (let start = prompt.indexOf('{"kind":'); start >= 0; start = prompt.indexOf('{"kind":', start + 1)) {
    let depth = 0;
    let isInString = false;
    for (let at = start; at < prompt.length; at += 1) {
      const character = prompt[at];
      if (isInString) {
        if (character === '\\') at += 1;
        else if (character === '"') isInString = false;
      } else if (character === '"') isInString = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) {
        commands.push(prompt.slice(start, at + 1));
        break;
      }
    }
  }
  return commands;
}

describe('board commands in the tutor prompt', () => {
  const written = getWrittenCommands(TUTOR_PROMPT.system);

  it.each(written)('shows the tutor a command the board takes: %s', (command) => {
    const parsed = parseSceneCommand(JSON.parse(command));
    expect(parsed.ok ? null : parsed.problem).toBeNull();
  });

  it('shows an example of every command the live board draws', () => {
    const shown = new Set(written.map((command) => (JSON.parse(command) as { kind: string }).kind));
    expect([...DRAWN_KINDS].filter((kind) => !shown.has(kind))).toEqual([]);
  });

  it('gives the prompt with a source search the same commands', () => {
    expect(getWrittenCommands(PROMPT_VERSIONS.v5FindSource.system)).toEqual(written);
  });

  it('asks for a drawing on an empty board, in the prompt and in each lead to carry on', () => {
    expect(TUTOR_PROMPT.system).toContain('When the board is empty and no picture is on screen');
    expect(TUTOR_PROMPT.system).toContain('a swing or an orbit is never a flight');
    expect(TUTOR_PROMPT.leadNotes?.next).toContain('If the board is empty and no picture is on screen, draw what you are describing');
  });
});
