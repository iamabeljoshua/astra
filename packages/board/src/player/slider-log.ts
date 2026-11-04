import type { BrowserMessage, ElementId, StudentAction } from '@astra/contracts';
import type { BoardOperation } from './board-operations.ts';

export type SliderMove = { target: ElementId; value: number } & ({ parameter: Extract<StudentAction, { action: 'sliderDragged'; parameter: unknown }>['parameter'] } | { constant: string });

interface OpenDrag {
  move: SliderMove;
  startedAtMs: number;
  samples: { afterMs: number; value: number }[];
}

const SEND_EVERY_MS = 250;
const MOST_SAMPLES = 300;

const isSameSlider = (first: SliderMove, second: SliderMove) => first.target === second.target && ('constant' in first ? 'constant' in second && first.constant === second.constant : 'parameter' in second && first.parameter === second.parameter);

/** A student's drags on the board's clock, kept for this board and sent in pieces to the log, which replays each sample at its own moment. */
export function createSliderLog({ getNowMs, send }: { getNowMs(): number; send(message: BrowserMessage): void }) {
  const operations: BoardOperation[] = [];
  let open: OpenDrag | null = null;

  const finish = () => {
    if (!open) return;
    const { move, startedAtMs, samples } = open;
    const browserMs = Math.round(getNowMs());
    const target = 'constant' in move ? { constant: move.constant } : { parameter: move.parameter };
    send({ type: 'acted', browserMs, startedMsAgo: Math.max(0, browserMs - startedAtMs), action: { action: 'sliderDragged', target: move.target, samples, ...target } });
    open = null;
  };

  return {
    getOperations: () => operations,
    finish,
    move(move: SliderMove) {
      // The next whole ms, because a frame can already have read this same step of the audio clock without this move.
      const atMs = Math.floor(getNowMs()) + 1;
      if (open && (!isSameSlider(open.move, move) || atMs - open.startedAtMs >= SEND_EVERY_MS || open.samples.length >= MOST_SAMPLES)) finish();
      open ??= { move, startedAtMs: atMs, samples: [] };
      open.samples.push({ afterMs: atMs - open.startedAtMs, value: move.value });
      operations.push({ kind: 'parameterSample', atMs, target: move.target, parameter: 'constant' in move ? move.constant : move.parameter, value: move.value });
    },
  };
}
