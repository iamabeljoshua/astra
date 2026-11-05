export class HeldAudio {
  isHolding: boolean;
  queue: { samples: Float32Array; isQuiet: boolean }[];
  hold(): void;
  release(): void;
  drop(): void;
  endInput(): void;
  isDrained(): boolean;
  takeSteadyNoise(): boolean;
  process(input: Float32Array | undefined, output: Float32Array): void;
}
