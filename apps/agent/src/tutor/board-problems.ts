import type { BoardProblemReport, SceneCommand } from '@astra/contracts';

export type BoardProblemNote = { problem: 'tooSmallToRead' | 'imageMissing'; target: string } | { problem: 'labelWithoutRoom'; label: string } | { problem: 'sliderWithoutConstant'; target: string; constant: string };

const LABEL_FIELDS = ['label', 'xLabel', 'yLabel'] as const;
/** A marked value with no label of its own, which holds nothing a forged report could say. */
const ONLY_A_VALUE = /^[\d\s().,−-]+$/;

const getLabels = (command: SceneCommand) => LABEL_FIELDS.flatMap((field) => (field in command ? [(command as unknown as Record<string, string>)[field] as string] : []));

// Built from what the model itself wrote, so a forged report can name only what is already on its board.
export function createBoardProblemNotes() {
  const commands = new Map<string, SceneCommand>();
  const labels = new Set<string>();
  const told = new Set<string>();

  // The board adds a value's coordinates after its label, so the words it reports can run past what the model wrote.
  const getWrittenLabel = (words: string): string | null => {
    const written = [...labels].filter((label) => words === label || words.startsWith(`${label} `)).sort((first, second) => second.length - first.length)[0];
    return written ?? (ONLY_A_VALUE.test(words) ? words : null);
  };

  const getNote = ({ problem, subject }: BoardProblemReport): BoardProblemNote | null => {
    const command = commands.get(subject);
    switch (problem) {
      case 'tooSmallToRead':
        return command ? { problem, target: subject } : null;
      case 'imageMissing':
        return command?.kind === 'image' ? { problem, target: subject } : null;
      case 'sliderWithoutConstant':
        return command?.kind === 'slider' && 'constant' in command ? { problem, target: command.target, constant: command.constant } : null;
      case 'labelWithoutRoom': {
        const label = getWrittenLabel(subject);
        return label === null ? null : { problem, label };
      }
    }
  };

  return {
    noteWritten(command: SceneCommand) {
      if ('id' in command) commands.set(command.id, command);
      for (const label of getLabels(command)) labels.add(label);
    },
    getNewNote(report: BoardProblemReport): BoardProblemNote | null {
      const note = getNote(report);
      const key = JSON.stringify(note);
      if (note === null || told.has(key)) return null;
      told.add(key);
      return note;
    },
  };
}
