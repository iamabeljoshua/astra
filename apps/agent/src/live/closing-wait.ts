export interface ClosingWait {
  studentLeft(how: { leftOnPurpose: boolean }): void;
  cancel(): void;
}

// Closes the room once a student has stayed away. Joining is what says they are back, because a page can take a second or more to say anything after it joins.
export function createClosingWait({ leftOnPurposeMs, linkDroppedMs, onClose }: { leftOnPurposeMs: number; linkDroppedMs: number; onClose(): void }): ClosingWait {
  let closing: ReturnType<typeof setTimeout> | undefined;
  return {
    studentLeft({ leftOnPurpose }) {
      clearTimeout(closing);
      closing = setTimeout(onClose, leftOnPurpose ? leftOnPurposeMs : linkDroppedMs);
    },
    cancel: () => clearTimeout(closing),
  };
}
