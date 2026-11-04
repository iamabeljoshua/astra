import { createScenePlayer, createTimerClock } from '@astra/board';
import { parseBeat, type TurnId } from '@astra/contracts';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveBoard } from './LiveBoard';
import type { LiveVoice } from './liveVoice';

const TURN = 'turn-1' as TurnId;

function makeVoiceWithBoard(script: readonly unknown[], boardAtMs = 2000) {
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
  const reportBoardProblem = vi.fn();
  const voice = { getBoardNow: () => ({ board: player.getBoard(boardAtMs), atMs: boardAtMs }), reportMarkNotDrawn, reportBoardProblem } as unknown as LiveVoice;
  return { voice, reportMarkNotDrawn, reportBoardProblem };
}

describe('the live board', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells the session when a ring has nothing to point at', async () => {
    const { voice, reportMarkNotDrawn } = makeVoiceWithBoard([{ kind: 'writeMath', id: 'eq', tex: '2x + 3 = 11' }, { kind: 'highlight', id: 'ring', target: 'eq', tex: 'q' }, 'Look here.']);
    await act(async () => {
      render(<LiveBoard voice={voice} whileEmpty={null} />);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => expect(reportMarkNotDrawn).toHaveBeenCalledWith('ring'));
  });

  const showBoard = async (voice: LiveVoice) => {
    await act(async () => {
      render(<LiveBoard voice={voice} whileEmpty={null} />);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  };

  it('tells the session when a picture cannot show', async () => {
    const { voice, reportBoardProblem } = makeVoiceWithBoard([{ kind: 'image', id: 'pic', fileId: 'file-1', alt: 'A wave' }, 'Look here.']);
    await showBoard(voice);
    await waitFor(() => expect(reportBoardProblem).toHaveBeenCalledWith({ problem: 'imageMissing', subject: 'pic' }));
  });

  it('tells the session when a slider has no constant to move', async () => {
    const { voice, reportBoardProblem } = makeVoiceWithBoard([{ kind: 'plot', id: 'curve', expression: 'x', domain: [-1, 1] }, { kind: 'slider', id: 'move-a', target: 'curve', constant: 'a', min: 0, max: 1 }, 'Look here.']);
    await showBoard(voice);
    await waitFor(() => expect(reportBoardProblem).toHaveBeenCalledWith({ problem: 'sliderWithoutConstant', subject: 'move-a' }));
  });

  it('tells the session when a label has no room', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(60);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
    const { voice, reportBoardProblem } = makeVoiceWithBoard([{ kind: 'plot', id: 'curve', expression: 'x', domain: [0, 2], label: 'no room here' }, 'Look here.'], 9000);
    await showBoard(voice);
    await waitFor(() => expect(reportBoardProblem).toHaveBeenCalledWith({ problem: 'labelWithoutRoom', subject: 'no room here' }));
  });

  it('tells the session when an element is too small to read', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(4000);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(4000);
    const { voice, reportBoardProblem } = makeVoiceWithBoard([{ kind: 'text', id: 'words', text: 'Too big for this board' }, 'Look here.'], 9000);
    await showBoard(voice);
    await waitFor(() => expect(reportBoardProblem).toHaveBeenCalledWith({ problem: 'tooSmallToRead', subject: 'words' }));
  });
});
