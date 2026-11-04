/** How long one line of a recap may be, in characters. */
export const RECAP_LINE_MAX_CHARACTERS = 300;

/** What a session's end says. */
export type SessionRecap =
  /** `gotRight` is null when code found no work right, so nothing can praise what did not happen. */
  | { kind: 'lesson'; covered: string; gotRight: string | null; tryNext: string }
  /** For a session where the student may not be safe. It says nothing of the work. */
  | { kind: 'gentle'; line: string };
