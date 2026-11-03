import { useCallback, useEffect, useState } from 'react';
import { prefersReducedMotion } from './motion';

const MS_PER_CHARACTER = 26;

export function useTypedLine(line: string) {
  const [typedLength, setTypedLength] = useState(() => (prefersReducedMotion() ? line.length : 0));
  const isTyping = typedLength < line.length;
  const finishTyping = useCallback(() => setTypedLength(line.length), [line]);

  useEffect(() => {
    if (!isTyping) return undefined;
    const timer = setInterval(() => setTypedLength((length) => length + 1), MS_PER_CHARACTER);
    return () => clearInterval(timer);
  }, [isTyping]);

  return { typedLength, isTyping, finishTyping };
}
