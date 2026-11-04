import { BOARD_WORK_LABELS } from '../strings';
import { isVoiceOver, type LiveVoiceView } from './liveVoice';

/** What the tutor is doing, in a word or two, for the top of the page. */
export function getTutorState(view: LiveVoiceView, hasOpenTask: boolean): string | null {
  if (view.closedBecause || isVoiceOver(view.phase)) return null;
  const { tutorState: labels } = BOARD_WORK_LABELS;
  if (view.isTutorSpeaking) return labels.talking;
  if (view.isThinking) return labels.reading;
  if (view.isStopped) return labels.stopped;
  const lastWord = view.tutorComing.at(-1) ?? view.tutorHeard.at(-1);
  if (hasOpenTask || lastWord?.trimEnd().endsWith('?')) return labels.waiting;
  return view.tutorHeard.length > 0 ? labels.watching : labels.ready;
}
