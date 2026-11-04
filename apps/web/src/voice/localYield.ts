import type { OutputLevel } from '@astra/board';

/** The agent's detector answers by now, on any link a lesson can run on. If it heard no voice, the tutor comes back up. */
const LONGEST_LOCAL_YIELD_MS = 1500;

export interface LocalYield {
  /** The microphone just went from quiet to sound. */
  onStudentSound(): void;
  /** The level the player asked for. */
  noteLevel(level: OutputLevel): void;
  noteAgentYield(isYielding: boolean): void;
  close(): void;
}

interface LocalYieldOptions {
  setLevel(level: OutputLevel): void;
  onYield?(): void;
}

// The agent's word comes over two network legs, too slow for "about 300 ms" on a far link. The browser hears the student first, so it lowers the voice at once and the agent decides what the sound was.
export function createLocalYield({ setLevel, onYield }: LocalYieldOptions): LocalYield {
  let level: OutputLevel = 'silent';
  let isAgentYielding = false;
  let isLowered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    onStudentSound() {
      if (level !== 'full') return;
      isLowered = true;
      setLevel('lowered');
      onYield?.();
      clearTimeout(timer);
      timer = setTimeout(() => {
        isLowered = false;
        if (!isAgentYielding && level === 'full') setLevel('full');
      }, LONGEST_LOCAL_YIELD_MS);
    },
    noteLevel(next) {
      level = next;
      if (next !== 'full') isAgentYielding = next === 'lowered';
      if (next === 'full' && isLowered) {
        isLowered = false;
        clearTimeout(timer);
      }
    },
    noteAgentYield(isYielding) {
      isAgentYielding = isYielding;
    },
    close: () => clearTimeout(timer),
  };
}
