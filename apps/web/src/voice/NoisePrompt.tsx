import { useEffect, useState } from 'react';
import { VOICE_LABELS } from '../strings';

const TOUCH_SCREEN_QUERY = '(pointer: coarse)';

const getSeenKey = (sessionId: string) => `astra.noisePrompt.${sessionId}`;

function readHasSeen(sessionId: string): boolean {
  try {
    return window.sessionStorage.getItem(getSeenKey(sessionId)) !== null;
  } catch {
    return false;
  }
}

function noteSeen(sessionId: string): void {
  try {
    window.sessionStorage.setItem(getSeenKey(sessionId), 'yes');
  } catch {
    // A browser that refuses storage shows this again after a reload, which does no harm.
  }
}

const getWords = () => (window.matchMedia(TOUCH_SCREEN_QUERY).matches ? VOICE_LABELS.noisyHoldTalk : VOICE_LABELS.noisyHoldSpace);

export function NoisePrompt({ sessionId, isRoomNoisy, isHolding }: { sessionId: string; isRoomNoisy: boolean; isHolding: boolean }) {
  const [hasSeenBefore] = useState(() => readHasSeen(sessionId));
  const [isDone, setIsDone] = useState(false);
  if (isHolding && !isDone) setIsDone(true);
  const isShowing = isRoomNoisy && !hasSeenBefore && !isDone;

  useEffect(() => {
    if (isShowing) noteSeen(sessionId);
  }, [isShowing, sessionId]);

  if (!isShowing) return null;
  return (
    <p className="flex items-center gap-2 text-fine text-ink-2">
      <span>{getWords()}</span>
      <button type="button" onClick={() => setIsDone(true)} className="underline">
        {VOICE_LABELS.dismissNoisy}
      </button>
    </p>
  );
}
