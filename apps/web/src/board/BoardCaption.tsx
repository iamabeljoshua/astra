import { useEffect, useRef, useState } from 'react';

const PAST_SHOWN = 2;

interface BoardCaptionProps {
  heard: readonly string[];
  coming: readonly string[];
  firstWord?: string | null;
}

// The tutor's words as they are spoken. Words not yet heard hold their place unseen, so a line does not move as it fills, and what was said before stays above it, faint.
export function BoardCaption({ heard, coming, firstWord = null }: BoardCaptionProps) {
  const [past, setPast] = useState<readonly string[]>([]);
  const said = useRef('');
  const heardText = heard.join(' ');
  const isNewTurn = heard.length === 0 && coming.length === 0;

  useEffect(() => {
    if (!isNewTurn && !heardText.startsWith(said.current.slice(0, heardText.length))) setPast((earlier) => [...earlier, said.current].slice(-PAST_SHOWN));
    if (isNewTurn && said.current !== '') {
      const finished = said.current;
      setPast((earlier) => [...earlier, finished].slice(-PAST_SHOWN));
      said.current = '';
      return;
    }
    if (!isNewTurn) said.current = [...heard, ...coming].join(' ');
  }, [heard, coming, heardText, isNewTurn]);

  const current = heard.at(-1);
  return (
    <div className="board-caption" data-testid="tutor-caption">
      {past.map((text, index) => <p key={`${index}:${text.slice(0, 16)}`} className="board-utterance board-utterance-past">{text}</p>)}
      {firstWord && isNewTurn && <p data-testid="first-word" data-utterance-now className="board-utterance">{firstWord}</p>}
      {!isNewTurn && (
        <p data-utterance-now className="board-utterance">
          {heard.slice(0, -1).map((word, index) => <span key={index}>{word} </span>)}
          {current && <span data-testid="current-word">{current} </span>}
          {coming.map((word, index) => <span key={index} className="board-word-coming">{word} </span>)}
        </p>
      )}
    </div>
  );
}
