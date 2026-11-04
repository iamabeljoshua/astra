import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { CHAT_BOX_LABELS } from '../strings';
import { createMicHold, type MicHold } from './micHold';
import type { PressSource } from './holdToTalk';
import type { HeldMic } from './useLiveVoice';

const TALK_BUTTON_ATTRIBUTE = 'data-talk-button';
const INTERACTIVE_ROLES = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'slider', 'spinbutton', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'listbox', 'menu', 'application', 'grid', 'tree', 'dialog'];
const TAKES_OVER_FOCUS = ['a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'label', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])', ...INTERACTIVE_ROLES.map((role) => `[role="${role}"]`)].join(',');
/** A click this soon after the pointer came up belongs to that press, however long the press was. */
const CLICK_AFTER_RELEASE_MS = 500;

/** Space belongs to anything a student can act on, and to custom elements like MathLive's. It is ours on the page itself, and on a heading the app put focus on when the screen opened. */
export function isOpenToSpace(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(TAKES_OVER_FOCUS)) return false;
  return !target.tagName.includes('-');
}

const isTalkButton = (target: EventTarget | null) => target instanceof Element && target.closest(`[${TALK_BUTTON_ATTRIBUTE}]`) !== null;

const getRealTarget = (event: KeyboardEvent) => event.composedPath()[0] ?? event.target;

const hasOtherKeys = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing;

export interface HoldToTalk {
  /** Spread onto any Talk button. */
  buttonProps: ComponentProps<'button'>;
  isHolding: boolean;
  /** A hold reached its limit, and the student has not pressed since. */
  hasHitLimit: boolean;
}

interface HoldToTalkOptions {
  heldMic: HeldMic;
  isTalkOn: boolean;
  toggleTalk(): Promise<void>;
  /** False once the room is over, and then Space goes back to scrolling the page. */
  isEnabled: boolean;
}

// Connects the physical keys and pointer to the press rule. Anything that could hide a key's release from the page counts as losing it, because a microphone with no finger on it is the worst failure here.
export function useHoldToTalk({ heldMic, isTalkOn, toggleTalk, isEnabled }: HoldToTalkOptions): HoldToTalk {
  const latest = useRef({ heldMic, toggleTalk });
  const holdRef = useRef<MicHold | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [hasHitLimit, setHasHitLimit] = useState(false);
  const spaceSource = useRef<PressSource | null>(null);
  const pointerEndedAtMs = useRef(-Infinity);
  const skipsNextClick = useRef(false);

  useEffect(() => {
    latest.current = { heldMic, toggleTalk };
  });

  useEffect(() => {
    const hold = createMicHold({
      getIsMicOn: () => latest.current.heldMic.isMicOn(),
      openMic: () => latest.current.heldMic.open(),
      closeMic: () => latest.current.heldMic.close(),
      endLine: () => latest.current.heldMic.endLine(),
      lowerTutor: () => latest.current.heldMic.lowerTutor(),
      tellHoldStarted: () => latest.current.heldMic.tellHoldStarted(),
      onHolding: setIsHolding,
      onLimitReached: () => setHasHitLimit(true),
    });
    holdRef.current = hold;
    const loseEverything = () => {
      spaceSource.current = null;
      hold.lose();
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') loseEverything();
    };
    const onPointerEnd = () => {
      pointerEndedAtMs.current = performance.now();
      hold.release('talkButton');
    };
    window.addEventListener('blur', loseEverything);
    window.addEventListener('pagehide', loseEverything);
    window.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', loseEverything);
      window.removeEventListener('pagehide', loseEverything);
      window.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('visibilitychange', onHidden);
      hold.close();
      holdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isTalkOn) holdRef.current?.noteMicOff();
  }, [isTalkOn]);

  useEffect(() => {
    if (!isEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // macOS sends no key-up while Meta is down, so a held key would look held for good.
      if (event.key === 'Meta' || event.key === 'OS') {
        spaceSource.current = null;
        return holdRef.current?.lose();
      }
      if (event.code !== 'Space' || hasOtherKeys(event)) return;
      const target = getRealTarget(event);
      const isOnTalk = isTalkButton(target);
      if (!isOnTalk && !isOpenToSpace(target)) return;
      event.preventDefault();
      if (event.repeat || spaceSource.current) return;
      setHasHitLimit(false);
      spaceSource.current = isOnTalk ? 'talkButton' : 'space';
      holdRef.current?.press(spaceSource.current);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (isTalkButton(getRealTarget(event))) event.preventDefault();
      if (!spaceSource.current) return;
      event.preventDefault();
      // A browser turns Space on a focused button into a click, and this press has already acted.
      skipsNextClick.current = spaceSource.current === 'talkButton';
      holdRef.current?.release(spaceSource.current);
      spaceSource.current = null;
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      spaceSource.current = null;
    };
  }, [isEnabled]);

  const buttonProps = {
    [TALK_BUTTON_ATTRIBUTE]: '',
    title: CHAT_BOX_LABELS.talkHint,
    'aria-keyshortcuts': 'Space',
    style: { touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' },
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      setHasHitLimit(false);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      holdRef.current?.press('talkButton');
    },
    onPointerUp() {
      pointerEndedAtMs.current = performance.now();
      holdRef.current?.release('talkButton');
    },
    onPointerCancel: () => holdRef.current?.lose(),
    onLostPointerCapture: () => holdRef.current?.release('talkButton'),
    onContextMenu: (event: PointerEvent<HTMLButtonElement>) => event.preventDefault(),
    // Holding Enter clicks again and again, and each click would flip the microphone.
    onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
      if (event.key === 'Enter' && event.repeat) event.preventDefault();
    },
    // A click with no press before it is Enter, a screen reader, or a voice control, and it means what a press once means.
    onClick() {
      const wasOwnPress = skipsNextClick.current || performance.now() - pointerEndedAtMs.current < CLICK_AFTER_RELEASE_MS;
      skipsNextClick.current = false;
      if (!wasOwnPress) void latest.current.toggleTalk();
    },
  } as ComponentProps<'button'>;

  return { buttonProps, isHolding, hasHitLimit };
}
