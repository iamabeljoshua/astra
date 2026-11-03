/** Short lines vary most, and a breath alone can double a three-word line. */
const SMALLEST_OVERRUN_MS = 800;
const OVERLONG_RATIO = 2;

export interface OverlongWatch {
  /** Feed the audio read so far and the characters its word times have covered. True from the moment the line is running far past its expected length. */
  isOverlong(audioMs: number, charactersAligned: number): boolean;
}

// Word times stretch with the sound, so nothing inside the audio shows the fault. Only the text's own length does, at this voice's own pace.
export function createOverlongWatch({ typicalMsPerCharacter }: { typicalMsPerCharacter: number }): OverlongWatch {
  return {
    isOverlong(audioMs, charactersAligned) {
      const expectedMs = charactersAligned * typicalMsPerCharacter;
      return audioMs > Math.max(expectedMs * OVERLONG_RATIO, expectedMs + SMALLEST_OVERRUN_MS);
    },
  };
}
