import type { EarsEvent } from './live-session.ts';
import type { TurnEvent } from './turn-rule.ts';
import { dropWordsAlreadyAnswered, getWords, hasWords } from './turn-words.ts';

type GatePhase = 'open' | 'holding' | 'letGo';

export interface HoldGate {
  isHolding(): boolean;
  isWaitingForLine(): boolean;
  onHoldStarted(): TurnEvent[];
  onLineEnded(): TurnEvent[];
  onEars(event: EarsEvent): TurnEvent[];
  onLineFlushed(): TurnEvent[];
}

// Turns a held key into events the turn rule already knows.
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
