import { useEffect, useState } from 'react';
import type { TutorVoice } from './answers';
import { speak, stopSpeaking } from './browserVoice';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const WORD_MS = 235;

export function useSpokenLine(line: string, voice: TutorVoice | null) {
  const words = line.split(' ');
  const [wordsShown, setWordsShown] = useState(() => (window.matchMedia(REDUCED_MOTION_QUERY).matches ? words.length : 0));

  useEffect(() => {
    if (voice) speak(line, voice, () => undefined);
    return stopSpeaking;
  }, [line, voice]);

  useEffect(() => {
    if (wordsShown >= words.length) return;
    const timer = setTimeout(() => setWordsShown(wordsShown + 1), WORD_MS);
    return () => clearTimeout(timer);
  }, [wordsShown, words.length]);

  return { words, wordsShown, isRevealingWords: wordsShown < words.length };
}
