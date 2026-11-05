export interface EarlyMessage {
  payload: Uint8Array;
  topic: string | undefined;
}

export interface EarlyMessages {
  hold(message: EarlyMessage): void;
  take(): EarlyMessage[];
}

const MOST_HELD = 64;

// LiveKit can tell a job about a student after that student's first messages arrive, and those carry no sender. They hold hello and the opening line, which are never sent again.
export function createEarlyMessages(): EarlyMessages {
  let held: EarlyMessage[] = [];
  return {
    hold(message) {
      if (held.length < MOST_HELD) held = [...held, message];
    },
    take() {
      const taken = held;
      held = [];
      return taken;
    },
  };
}
