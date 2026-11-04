import { createScenePlayer, createTimerClock } from '@astra/board';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatBox } from '../home/ChatBox';
import { BOARD_WORK_LABELS, CHAT_BOX_LABELS, REPLY_BOX_LABELS } from '../strings';
import { LiveBoard } from '../voice/LiveBoard';
import type { LiveVoice } from '../voice/liveVoice';
import { useHoldToTalk } from '../voice/useHoldToTalk';
import type { HeldMic } from '../voice/useLiveVoice';

function makeBoardVoice() {
  const nowMs = 2000;
  const player = createScenePlayer({ clock: createTimerClock({ getNowMs: () => nowMs }), clockId: 'test', send: () => {}, setOutputLevel: () => {} });
  const voice = {
    getBoardNow: () => ({ board: player.getBoard(nowMs), atMs: nowMs }),
    getView: () => ({ tutorHeard: [], tutorComing: [], isTutorSpeaking: false, isThinking: false, isHeard: false, closedBecause: null }),
    getLoudness: () => 0,
    sendPause: () => {},
    reportMarkNotDrawn: () => {},
    noteTyping: () => {},
    stopTutor: () => {},
    sendWork: () => {},
  } as unknown as LiveVoice;
  return voice;
}

function makeHeldMic() {
  let isOn = false;
  const opens: string[] = [];
  const mic: HeldMic = {
    isMicOn: () => isOn,
    open() {
      isOn = true;
      opens.push('open');
    },
    close() {
      isOn = false;
    },
    endLine() {
      isOn = false;
    },
    lowerTutor: () => {},
    tellHoldStarted: () => {},
  };
  return { mic, opens, getIsOn: () => isOn };
}

function SessionKeys({ voice, mic }: { voice: LiveVoice; mic: HeldMic }) {
  const hold = useHoldToTalk({ heldMic: mic, isTalkOn: false, toggleTalk: async () => {}, isEnabled: true });
  return (
    <>
      <ChatBox labels={REPLY_BOX_LABELS} clearsOnSend talk={{ isOn: false, onToggle: () => {}, buttonProps: hold.buttonProps }} onSend={() => {}} onEdit={() => {}} />
      <LiveBoard voice={voice} talkButtonProps={hold.buttonProps} />
    </>
  );
}

const pressSpace = (target: Element, init: KeyboardEventInit = {}) => fireEvent.keyDown(target, { code: 'Space', key: ' ', ...init });
const letGoOfSpace = (target: Element) => fireEvent.keyUp(target, { code: 'Space', key: ' ' });

function setUp() {
  const held = makeHeldMic();
  render(<SessionKeys voice={makeBoardVoice()} mic={held.mic} />);
  return held;
}

const boardLine = () => screen.getByRole('textbox', { name: BOARD_WORK_LABELS.entry });
const replyBox = () => screen.getByPlaceholderText(REPLY_BOX_LABELS.placeholder);
const boardTalk = () => within(screen.getByTestId('board-tools')).getByRole('button', { name: BOARD_WORK_LABELS.talk });

describe('Space while a student is typing', () => {
  it('stays a space in the board line, and never opens the microphone', () => {
    const { opens, getIsOn } = setUp();
    boardLine().focus();
    const wasLeftToType = pressSpace(boardLine());
    letGoOfSpace(boardLine());
    expect(wasLeftToType).toBe(true);
    expect(opens).toEqual([]);
    expect(getIsOn()).toBe(false);
  });

  it('stays a space in the reply box, and never opens the microphone', () => {
    const { opens, getIsOn } = setUp();
    replyBox().focus();
    const wasLeftToType = pressSpace(replyBox());
    letGoOfSpace(replyBox());
    expect(wasLeftToType).toBe(true);
    expect(opens).toEqual([]);
    expect(getIsOn()).toBe(false);
  });

  it('stays a space inside the math keys, which live in a custom element', () => {
    const { opens } = setUp();
    const mathField = document.createElement('math-field');
    document.body.append(mathField);
    const wasLeftToType = pressSpace(mathField);
    mathField.remove();
    expect(wasLeftToType).toBe(true);
    expect(opens).toEqual([]);
  });
});

describe('Space while a student is not typing', () => {
  it('opens the microphone and leaves focus where it was, so the next hold talks as well', () => {
    const { opens } = setUp();
    for (const hold of [1, 2]) {
      pressSpace(document.body);
      expect(document.activeElement).not.toBe(boardLine());
      expect(opens).toHaveLength(hold);
      letGoOfSpace(document.body);
    }
  });

  it('lets any other key still jump into the board line', () => {
    setUp();
    fireEvent.keyDown(document.body, { code: 'KeyX', key: 'x' });
    expect(document.activeElement).toBe(boardLine());
  });
});

describe('a new task taking focus during a hold', () => {
  it('puts no spaces in the board line, and the hold still ends on letting go', () => {
    const { opens, getIsOn } = setUp();
    pressSpace(document.body);
    expect(opens).toEqual(['open']);
    boardLine().focus();
    const wasLeftToType = pressSpace(boardLine(), { repeat: true });
    expect(wasLeftToType).toBe(false);
    letGoOfSpace(boardLine());
    expect(getIsOn()).toBe(false);
  });
});

describe('Talk on the board', () => {
  it('holds and lets go like the reply box Talk, with no text selection or menu on a phone', () => {
    const { opens, getIsOn } = setUp();
    expect(boardTalk().getAttribute('aria-keyshortcuts')).toBe('Space');
    expect(boardTalk().getAttribute('title')).toBe(CHAT_BOX_LABELS.talkHint);
    expect(boardTalk().style.touchAction).toBe('none');
    expect(boardTalk().style.userSelect).toBe('none');
    const wasMenuAllowed = fireEvent.contextMenu(boardTalk());
    expect(wasMenuAllowed).toBe(false);
    vi.useFakeTimers();
    fireEvent.pointerDown(boardTalk(), { button: 0, pointerId: 1 });
    expect(opens).toEqual(['open']);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(boardTalk(), { button: 0, pointerId: 1 });
    expect(getIsOn()).toBe(false);
    vi.useRealTimers();
  });
});
