import type { EarsEvent } from './live-session.ts';
import type { TurnEvent } from './turn-rule.ts';
import { dropWordsAlreadyAnswered, getWords, hasWords } from './turn-words.ts';

type GatePhase = 'open' | 'holding' | 'letGo';

export interface HoldGate {
  isHolding(): boolean;
  /** The student let go, and Muse has not said it is done. */
  isWaitingForLine(): boolean;
  onHoldStarted(): TurnEvent[];
  onLineEnded(): TurnEvent[];
  onEars(event: EarsEvent): TurnEvent[];
  /** Muse has given all it will for a line that ended. */
  onLineFlushed(): TurnEvent[];
}

// Turns a held key into events the turn rule already knows, so the rule stays as searched: the press is sound over the tutor with its wait already up, and letting go is that sound ending. While a key is down the voice detector has no say, and once it is up Muse's last word on the line decides the turn.
export function createHoldGate(): HoldGate {
  let phase: GatePhase = 'open';
  let finals: string[] = [];
  // Words this gate has decided or will decide, which the SDK's own later turn repeats.
  let wordsOwned = '';

  const decide = (): TurnEvent[] => {
    const text = finals.join(' ');
    phase = 'open';
    finals = [];
    return hasWords(text) ? [{ type: 'turnDecided', text }] : [];
  };

  const ownFinal = (text: string) => {
    finals.push(text);
    wordsOwned = `${wordsOwned} ${text}`.trim();
  };

  const takeFromOwned = (text: string): string => {
    const fresh = dropWordsAlreadyAnswered(text, wordsOwned);
    const taken = getWords(text).length - getWords(fresh).length;
    wordsOwned = wordsOwned.trim().split(/\s+/).slice(taken).join(' ');
    return fresh;
  };

  const onSdkTurn = (text: string): TurnEvent[] => {
    const fresh = takeFromOwned(text);
    if (phase !== 'open' || !hasWords(fresh)) return [];
    return [{ type: 'turnDecided', text: fresh }];
  };

  return {
    isHolding: () => phase === 'holding',
    isWaitingForLine: () => phase === 'letGo',
    onHoldStarted() {
      if (phase === 'holding') return [];
      const isFreshLine = phase === 'open';
      phase = 'holding';
      return isFreshLine ? [{ type: 'voiceStarted' }, { type: 'timer', name: 'wordlessStop' }] : [{ type: 'voiceStarted' }];
    },
    onLineEnded() {
      if (phase !== 'holding') return [];
      phase = 'letGo';
      return [{ type: 'voiceEnded' }, { type: 'timer', name: 'reactionFloor' }];
    },
    onEars(event) {
      if (event.type === 'lineFlushed') return [];
      if (event.type === 'turnDecided') return onSdkTurn(event.text);
      if (phase === 'open') return [event];
      if (event.type !== 'words') return [];
      if (!event.isFinal) return [event];
      ownFinal(event.text);
      return [event];
    },
    onLineFlushed: () => (phase === 'letGo' ? decide() : []),
  };
}
