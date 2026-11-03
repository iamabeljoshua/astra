import { useRef } from 'react';
import { StepHeading } from '../auth/StepHeading';
import { ChatBox } from '../home/ChatBox';
import { FIRST_ANSWER_BOX_LABELS, ONBOARDING_LABELS } from '../strings';
import { getHelloLine } from './answers';
import { StepScreen } from './StepScreen';
import type { StepProps } from './useOnboarding';
import { useSpokenLine } from './useSpokenLine';

export function HelloStep({ flow }: StepProps) {
  const line = getHelloLine(flow.answers);
  const { words, wordsShown, isRevealingWords } = useSpokenLine(line, flow.answers.voice);
  const answerBox = useRef<HTMLTextAreaElement>(null);

  return (
    <StepScreen flow={flow}>
      <div className="label flex items-center gap-2.5" data-speaking={isRevealingWords}>
        <i className="tutor-dot" />
        <span>{isRevealingWords ? ONBOARDING_LABELS.speaking : ONBOARDING_LABELS.listening}</span>
      </div>
      <StepHeading fieldToFocus={answerBox} className="font-voice text-tutor-line font-normal">
        <span className="sr-only">{line}</span>
        <span aria-hidden>
          {words.map((word, index) => (
            <span key={index} className={index < wordsShown ? undefined : 'text-line'}>
              {word}{' '}
            </span>
          ))}
        </span>
      </StepHeading>
      <ChatBox labels={FIRST_ANSWER_BOX_LABELS} canAttach={false} textBoxHandle={answerBox} onSend={flow.finish} onEdit={() => undefined} />
      {flow.saveProblem && <p role="alert" className="stop-note">{flow.saveProblem}</p>}
    </StepScreen>
  );
}
