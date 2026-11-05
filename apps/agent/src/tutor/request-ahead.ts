import type { ModelEvent, ModelUsage, TutorModelAdapter, TutorModelRequest } from '../providers/types.ts';

const CHARACTERS_PER_TOKEN = 3.2;

export interface RequestAhead {
  events: AsyncIterable<ModelEvent>;
  abort(): void;
  /** What the request has cost so far, with its output counted from the words that came back. */
  getUsageSoFar(): ModelUsage;
}

// Reads the model into memory from the moment it is asked, so whoever comes for the words later finds them waiting.
export function startRequestAhead(model: TutorModelAdapter, request: TutorModelRequest): RequestAhead {
  const controller = new AbortController();
  const arrived: ModelEvent[] = [];
  let isDone = false;
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  let usage: ModelUsage | null = null;
  let isUsageFinal = false;
  let textCharacters = 0;

  const note = (event: ModelEvent) => {
    if (event.type === 'text') textCharacters += event.text.length;
    else {
      usage = event.usage;
      isUsageFinal = event.type === 'finished';
    }
  };

  const pump = async () => {
    try {
      for await (const event of model.stream(request, controller.signal)) {
        note(event);
        arrived.push(event);
        wake?.();
      }
    } catch (error) {
      failure = error;
    } finally {
      isDone = true;
      wake?.();
    }
  };
  void pump();

  async function* readEvents(): AsyncGenerator<ModelEvent> {
    for (let at = 0; ; at += 1) {
      while (at >= arrived.length) {
        if (failure !== null) throw failure as Error;
        if (isDone) return;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      yield arrived[at] as ModelEvent;
    }
  }

  return {
    events: readEvents(),
    abort: () => controller.abort(),
    getUsageSoFar() {
      const known = usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      return isUsageFinal ? known : { ...known, outputTokens: Math.ceil(textCharacters / CHARACTERS_PER_TOKEN) };
    },
  };
}
