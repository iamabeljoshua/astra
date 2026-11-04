import { createScenePlayer, createTimerClock } from '@astra/board';
import { parseBeat, type TurnId } from '@astra/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTACH_LABELS } from '../strings';
import { useFilesComingSoon } from '../ui/useFilesComingSoon';
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
  const stopTutor = vi.fn();
  const voice = { getBoardNow: () => ({ board: player.getBoard(boardAtMs), atMs: boardAtMs }), getView: () => ({ tutorHeard: [], tutorComing: [], isTutorSpeaking: false, isThinking: false, isHeard: false, closedBecause: null }), getLoudness: () => 0, sendPause: () => {}, reportMarkNotDrawn, reportBoardProblem, stopTutor } as unknown as LiveVoice;
  return { voice, reportMarkNotDrawn, reportBoardProblem, stopTutor };
}

function BoardWithFilesComingSoon({ voice }: { voice: LiveVoice }) {
  return <LiveBoard voice={voice} filesComingSoon={useFilesComingSoon()} />;
}

describe('the live board', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells the session when a ring has nothing to point at', async () => {
    const { voice, reportMarkNotDrawn } = makeVoiceWithBoard([{ kind: 'writeMath', id: 'eq', tex: '2x + 3 = 11' }, { kind: 'highlight', id: 'ring', target: 'eq', tex: 'q' }, 'Look here.']);
    await act(async () => {
      render(<LiveBoard voice={voice} />);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await waitFor(() => expect(reportMarkNotDrawn).toHaveBeenCalledWith('ring'));
  });

  const showBoard = async (voice: LiveVoice) => {
    await act(async () => {
      render(<LiveBoard voice={voice} />);
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
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '6px', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
    const { voice, reportBoardProblem } = makeVoiceWithBoard([{ kind: 'text', id: 'words', text: 'Too small for this board' }, 'Look here.'], 9000);
    await showBoard(voice);
    await waitFor(() => expect(reportBoardProblem).toHaveBeenCalledWith({ problem: 'tooSmallToRead', subject: 'words' }));
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

  it('says photos and PDFs are coming soon, and Escape closes the note before it stops the tutor', async () => {
    const { voice, stopTutor } = makeVoiceWithBoard(['Look here.']);
    await act(async () => {
      render(<BoardWithFilesComingSoon voice={voice} />);
    });

    fireEvent.click(screen.getByRole('button', { name: ATTACH_LABELS.attach }));
    screen.getByText(ATTACH_LABELS.comingSoon);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText(ATTACH_LABELS.comingSoon)).toBeNull();
    expect(stopTutor).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(stopTutor).toHaveBeenCalledOnce();
  });
});
