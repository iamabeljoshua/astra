export class HeldAudio {
  isHolding: boolean;
  queue: { samples: Float32Array; isQuiet: boolean }[];
  hold(): void;
  release(): void;
  drop(): void;
  process(input: Float32Array, output: Float32Array): void;
}
