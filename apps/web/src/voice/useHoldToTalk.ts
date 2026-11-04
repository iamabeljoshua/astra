import { type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { CHAT_BOX_LABELS } from '../strings';
import { createMicHold, type MicHold } from './micHold';
import type { PressSource } from './holdToTalk';
import type { HeldMic } from './useLiveVoice';

const TALK_BUTTON_ATTRIBUTE = 'data-talk-button';
const INTERACTIVE_ROLES = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'slider', 'spinbutton', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'listbox', 'menu', 'application', 'grid', 'tree', 'dialog'];
const TAKES_OVER_FOCUS = ['a[href]', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'label', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])', ...INTERACTIVE_ROLES.map((role) => `[role="${role}"]`)].join(',');
const CLICK_AFTER_RELEASE_MS = 500;

/** Space is ours unless the target is something a student can act on, or a custom element like MathLive's. */
export function isOpenToSpace(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(TAKES_OVER_FOCUS)) return false;
  return !target.tagName.includes('-');
}

const isTalkButton = (target: EventTarget | null) => target instanceof Element && target.closest(`[${TALK_BUTTON_ATTRIBUTE}]`) !== null;

const getRealTarget = (event: KeyboardEvent) => event.composedPath()[0] ?? event.target;

const hasOtherKeys = (event: KeyboardEvent) => event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing;

export interface HoldToTalk {
  buttonProps: ComponentProps<'button'>;
  isHolding: boolean;
  hasHitLimit: boolean;
}

interface HoldToTalkOptions {
  heldMic: HeldMic;
  isTalkOn: boolean;
  toggleTalk(): Promise<void>;
  isEnabled: boolean;
}

export function useHoldToTalk({ heldMic, isTalkOn, toggleTalk, isEnabled }: HoldToTalkOptions): HoldToTalk {
  const latest = useRef({ heldMic, toggleTalk });
  const holdRef = useRef<MicHold | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [hasHitLimit, setHasHitLimit] = useState(false);
  const spaceSource = useRef<PressSource | null>(null);
  const isSpaceLeftAlone = useRef(false);
  const talkPointerId = useRef<number | null>(null);
  const pointerEndedAtMs = useRef(-Infinity);

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
      isSpaceLeftAlone.current = true;
      talkPointerId.current = null;
      hold.loseFinger();
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') loseEverything();
    };
    const onPointerEnd = (event: globalThis.PointerEvent) => {
      pointerEndedAtMs.current = performance.now();
      if (event.pointerId !== talkPointerId.current) return;
      talkPointerId.current = null;
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
      // On a Mac the page gets no key-up while Meta is down, so a held key would look held for good.
      if (event.key === 'Meta' || event.key === 'OS') {
        spaceSource.current = null;
        isSpaceLeftAlone.current = true;
        return holdRef.current?.loseFinger();
      }
      if (event.code !== 'Space') return;
      if (hasOtherKeys(event)) {
        isSpaceLeftAlone.current = true;
        return;
      }
      // A new task can take focus during a hold, and the key's repeats must not land in its line.
      if (spaceSource.current) return event.preventDefault();
      const target = getRealTarget(event);
      const isOnTalk = isTalkButton(target);
      const isOurs = isOnTalk || isOpenToSpace(target);
      if (!event.repeat) isSpaceLeftAlone.current = !isOurs;
      if (!isOurs) return;
      event.preventDefault();
      // A repeat with no press behind it went down before this listener existed, and that student is still waiting to be heard.
      if (isSpaceLeftAlone.current) return;
      setHasHitLimit(false);
      spaceSource.current = isOnTalk ? 'talkButton' : 'space';
      holdRef.current?.press(spaceSource.current);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      isSpaceLeftAlone.current = false;
      if (isTalkButton(getRealTarget(event))) event.preventDefault();
      if (!spaceSource.current) return;
      event.preventDefault();
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
      if (event.button !== 0 || !isEnabled) return;
      // A primary pointer means none other is down, so an id left by a lost event cannot block it.
      if (!event.isPrimary && talkPointerId.current !== null) return;
      talkPointerId.current = event.pointerId;
      setHasHitLimit(false);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      holdRef.current?.press('talkButton');
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerId !== talkPointerId.current) return;
      talkPointerId.current = null;
      holdRef.current?.loseFinger();
    },
    onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerId !== talkPointerId.current) return;
      talkPointerId.current = null;
      holdRef.current?.release('talkButton');
    },
    onContextMenu: (event: PointerEvent<HTMLButtonElement>) => event.preventDefault(),
    // Holding Enter clicks again and again, and each click would flip the microphone.
    onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
      if (event.key === 'Enter' && event.repeat) event.preventDefault();
    },
    // A click with no press before it is Enter, a screen reader, or a voice control, and it means what a press once means.
    onClick() {
      if (isEnabled && performance.now() - pointerEndedAtMs.current >= CLICK_AFTER_RELEASE_MS) void latest.current.toggleTalk();
    },
  } as ComponentProps<'button'>;

  return { buttonProps, isHolding, hasHitLimit };
}
