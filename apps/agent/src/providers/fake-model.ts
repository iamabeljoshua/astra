import type { ModelEvent, ModelStopReason, ModelUsage, TutorModelAdapter, TutorModelRequest } from './types.ts';

export interface FakeReply {
  /** Each piece arrives as one streamed fragment. */
  pieces: readonly string[];
  firstTextMs?: number;
  msPerPiece?: number;
  /** Holds the stream this long before the piece at this index. */
  stall?: { beforePiece: number; ms: number };
  stopReason?: ModelStopReason;
  refusalCategory?: string | null;
  /** Throws at the start, as a broken connection or an overloaded model does. */
  failure?: string;
  /** Throws after the pieces, as a connection that breaks mid reply does. */
  failAfterPieces?: string;
  /** A new block starts at these pieces, as it does around a tool call. */
  newBlocksAt?: readonly number[];
}

const FAKE_PROMPT_TOKENS = 100;
const CHARACTERS_PER_TOKEN = 4;

const FAKE_USAGE: ModelUsage = { inputTokens: FAKE_PROMPT_TOKENS, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export interface FakeTutorModel extends TutorModelAdapter {
  requests: TutorModelRequest[];
  /** How many streams were still being read when they were aborted, and how many pieces were never sent. */
  aborted: { streams: number; piecesNotSent: number };
}

// Stands in for the model with a recorded reply, so every failure a real model can have runs for free and on demand.
export function makeFakeTutorModel(getReply: (request: TutorModelRequest, attempt: number) => FakeReply): FakeTutorModel {
  const requests: TutorModelRequest[] = [];
  const aborted = { streams: 0, piecesNotSent: 0 };

  async function* stream(request: TutorModelRequest, signal: AbortSignal): AsyncGenerator<ModelEvent> {
    requests.push(request);
    const reply = getReply(request, requests.length);
    if (reply.failure) throw new Error(reply.failure);
    yield { type: 'started', usage: FAKE_USAGE };
    await wait(reply.firstTextMs ?? 0, signal);
    let written = 0;
    for (const [index, piece] of reply.pieces.entries()) {
      if (reply.stall?.beforePiece === index) await wait(reply.stall.ms, signal);
      if (signal.aborted) {
        aborted.streams += 1;
        aborted.piecesNotSent += reply.pieces.length - index;
        return;
      }
      yield { type: 'text', text: piece, isNewBlock: index === 0 || (reply.newBlocksAt?.includes(index) ?? false) };
      written += piece.length;
      await wait(reply.msPerPiece ?? 0, signal);
    }
    if (signal.aborted) return;
    if (reply.failAfterPieces) throw new Error(reply.failAfterPieces);
    yield { type: 'finished', stopReason: reply.stopReason ?? 'finished', refusalCategory: reply.refusalCategory ?? null, usage: { ...FAKE_USAGE, outputTokens: Math.ceil(written / CHARACTERS_PER_TOKEN) } };
  }

  return {
    name: 'fake',
    requests,
    aborted,
    stream,
    warm: async () => {},
    compact: async () => null,
    getCostUsd: () => 0,
  };
}

const ANSWER = [
  'Okay, picture it. ',
  '{"kind":"writeMath","id":"steps","tex":"v = u + at"}',
  'Speed changes by the same amount every second, ',
  '{"kind":"highlight","id":"ring","target":"steps","tex":"at"}',
  'and this part is that change. ',
  'What does it do on the way up?',
];

const RECORDED_REPLIES: readonly { heard: RegExp; reply: FakeReply }[] = [
  { heard: /invalid/i, reply: { pieces: ['Right, watch this. ', '{"kind":"laser","id":"zap"}', 'A command the board cannot draw is dropped, ', '{"kind":"writeMath","id":"ok","tex":"2 + 2 = 4"}', 'and the words still play. What do you notice?'], msPerPiece: 60 } },
  { heard: /stall/i, reply: { pieces: ['That took a while.'], firstTextMs: 10_000 } },
  { heard: /wrong math/i, reply: { pieces: ['So then, ', '{"kind":"writeMath","id":"bad","tex":"2 + 2 = 5"}', 'two plus two is five.'], msPerPiece: 40 } },
  { heard: /tag/i, reply: { pieces: ['<thinking>private working</thinking>Fine, ', 'no tag reached you. ', '{"kind":"text","id":"note","text":"No tags"}', 'What next?'], msPerPiece: 40 } },
];

/** A recorded model for live proofs with no spending. It chooses its reply from what the student typed. */
export function makeRecordedTutorModel(): FakeTutorModel {
  const stalledOnce = new Set<string>();
  return makeFakeTutorModel((request) => {
    const lastUser = [...request.turns].reverse().find((turn) => turn.role === 'user');
    const text = lastUser && 'text' in lastUser ? lastUser.text : '';
    const recorded = RECORDED_REPLIES.find(({ heard }) => heard.test(text));
    const isSecondAttempt = request.turns.at(-1)?.role === 'system' && /correction/.test(JSON.stringify(request.turns.at(-1)));
    if (/stall/i.test(text) && stalledOnce.has(text)) return { pieces: ['There you are. ', 'A stall ended at the timeout, and a new request answered. What next?'], msPerPiece: 40 };
    if (/stall/i.test(text)) stalledOnce.add(text);
    if (recorded && isSecondAttempt) return { pieces: ['That line was wrong. ', '{"kind":"writeMath","id":"good","tex":"2 + 2 = 4"}', 'Two plus two is four. What is three plus three?'], msPerPiece: 40 };
    return recorded?.reply ?? { pieces: ANSWER, msPerPiece: 60, firstTextMs: 300 };
  });
}
