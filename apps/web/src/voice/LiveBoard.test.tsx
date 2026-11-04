import { createScenePlayer, createTimerClock } from '@astra/board';
import { parseBeat, type TurnId } from '@astra/contracts';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveBoard } from './LiveBoard';
import type { LiveVoice } from './liveVoice';

const TURN = 'turn-1' as TurnId;

function makeVoiceWithBoard(script: readonly unknown[]) {
  const nowMs = 2000;
  const player = createScenePlayer({ clock: createTimerClock({ getNowMs: () => nowMs }), clockId: 'test', send: () => {}, setOutputLevel: () => {} });
  const parsed = parseBeat({ id: 't1-b0', script, expectsReply: false });
  if (!parsed.ok) throw new Error(parsed.problem);
  player.receive({ type: 'turnStarted', turnId: TURN });
  script.forEach((part) => {
    if (typeof part !== 'string') player.receive({ type: 'cue', turnId: TURN, beatId: parsed.value.id, atWord: 0, command: part as never });
  });
  player.receive({ type: 'words', turnId: TURN, beatId: parsed.value.id, firstWord: 0, words: [{ text: 'Look', startMs: 0 }, { text: 'here.', startMs: 100 }] });
  player.receive({ type: 'beatClosed', turnId: TURN, beatId: parsed.value.id, wordCount: 2, expectsReply: false });
  player.tick();
  const reportMarkNotDrawn = vi.fn();
  const voice = { getBoardNow: () => ({ board: player.getBoard(nowMs), atMs: nowMs }), getView: () => ({ tutorHeard: [], tutorComing: [], isTutorSpeaking: false, isThinking: false, isHeard: false, closedBecause: null }), getLoudness: () => 0, sendPause: () => {}, reportMarkNotDrawn } as unknown as LiveVoice;
  return { voice, reportMarkNotDrawn };
}

describe('the live board', () => {
  it('tells the session when a ring has nothing to point at', async () => {
    const { voice, reportMarkNotDrawn } = makeVoiceWithBoard([{ kind: 'writeMath', id: 'eq', tex: '2x + 3 = 11' }, { kind: 'highlight', id: 'ring', target: 'eq', tex: 'q' }, 'Look here.']);
    await act(async () => {
      render(<LiveBoard voice={voice} />);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => expect(reportMarkNotDrawn).toHaveBeenCalledWith('ring'));
  });

  it('reads the visual every frame, and with none the board is in view', async () => {
    const { voice } = makeVoiceWithBoard([{ kind: 'writeMath', id: 'eq', tex: '2x + 3 = 11' }, 'Look here.']);
    const getVisual = vi.fn(() => null);
    const { queryByTestId } = render(<LiveBoard voice={voice} getVisual={getVisual} />);
    await waitFor(() => expect(getVisual.mock.calls.length).toBeGreaterThan(1));
    expect(getVisual).toHaveBeenCalledWith(expect.objectContaining({ atMs: 2000 }));
    expect(queryByTestId('board-visual')).toBeNull();
  });

  it('puts a visual in the right side when there is one', async () => {
    const { voice } = makeVoiceWithBoard(['Look here.']);
    const { findByTestId, getByText } = render(<LiveBoard voice={voice} getVisual={() => <span>The scene</span>} />);
    expect((await findByTestId('board-visual')).dataset.big).toBe('true');
    getByText('The scene');
  });
});
