import { useEffect, useState, type ComponentProps, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { CHAT_BOX_LABELS } from '../strings';
import { AttachControl } from '../ui/AttachControl';
import type { FilesComingSoon } from '../ui/useFilesComingSoon';
import { useHeightThatFitsText } from './useHeightThatFitsText';

// WebKit fires compositionend before keydown, so the Enter that confirms a word has this code and isComposing false.
const COMPOSING_KEY_CODE = 229;
const TOUCH_SCREEN_QUERY = '(pointer: coarse)';
const TOOL_BUTTON =
  'inline-flex h-8 items-center gap-1.5 px-2 text-fine text-ink-2 hover:text-ink aria-pressed:font-medium aria-pressed:text-ink';

interface ChatBoxProps {
  labels?: Pick<typeof CHAT_BOX_LABELS, 'label' | 'placeholder' | 'placeholderWhileTalkIsOn' | 'send'>;
  /** Without it the box offers no photo or PDF control. */
  filesComingSoon?: FilesComingSoon;
  clearsOnSend?: boolean;
  isSending?: boolean;
  /** A touch screen is left alone, so no keyboard opens by itself. */
  takesFocus?: boolean;
  /** A session's live voice owns this. Without it the button only changes the placeholder. */
  talk?: { isOn: boolean; onToggle: () => void; buttonProps?: ComponentProps<'button'> };
  onSend: (text: string, textBox: HTMLTextAreaElement) => void;
  onEdit: (question: string) => void;
}

export function ChatBox({ labels = CHAT_BOX_LABELS, filesComingSoon, clearsOnSend = false, isSending = false, takesFocus = false, talk, onSend, onEdit }: ChatBoxProps) {
  const [question, setQuestion] = useState('');
  const [isLocalTalkOn, setIsLocalTalkOn] = useState(false);
  const isTalkOn = talk?.isOn ?? isLocalTalkOn;
  const placeholder = isTalkOn ? labels.placeholderWhileTalkIsOn : labels.placeholder;
  const textBox = useHeightThatFitsText(question, placeholder);
  const hasQuestion = question.trim() !== '';

  useEffect(() => {
    if (takesFocus && !window.matchMedia(TOUCH_SCREEN_QUERY).matches) textBox.current?.focus({ preventScroll: true });
  }, [takesFocus, textBox]);

  function send() {
    if (!hasQuestion || isSending || !textBox.current) return;
    onSend(question.trim(), textBox.current);
    if (clearsOnSend) setQuestion('');
  }

  function editQuestion(editedQuestion: string) {
    setQuestion(editedQuestion);
    onEdit(editedQuestion);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  return (
    <form onSubmit={submit} className="fades-with-theme border border-ink bg-paper focus-within:outline focus-within:outline-accent">
      <QuestionBox
        textBox={textBox}
        label={labels.label}
        question={question}
        placeholder={placeholder}
        isReadOnly={isSending}
        onChange={editQuestion}
        onEnter={send}
      />
      <div className="flex items-center gap-1.5 pt-1.5 pr-2 pb-2 pl-2.5">
        {filesComingSoon && <AttachControl filesComingSoon={filesComingSoon} className={TOOL_BUTTON} isLabelShown />}
        <TalkButton isOn={isTalkOn} onToggle={talk?.onToggle ?? (() => setIsLocalTalkOn(!isLocalTalkOn))} buttonProps={talk?.buttonProps} />
        <SendButton label={labels.send} isEnabled={hasQuestion && !isSending} />
      </div>
    </form>
  );
}

// A touch keyboard has no Shift to add a line, so Return adds one there, and the send button sends.
function isSendKey(event: KeyboardEvent) {
  const isComposing = event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE;
  const isTouchScreen = window.matchMedia(TOUCH_SCREEN_QUERY).matches;
  return event.key === 'Enter' && !event.shiftKey && !isComposing && !isTouchScreen;
}

interface QuestionBoxProps {
  textBox: RefObject<HTMLTextAreaElement | null>;
  label: string;
  question: string;
  placeholder: string;
  isReadOnly: boolean;
  onChange: (question: string) => void;
  onEnter: () => void;
}

function QuestionBox({ textBox, label, question, placeholder, isReadOnly, onChange, onEnter }: QuestionBoxProps) {
  return (
    <textarea
      ref={textBox}
      rows={1}
      value={question}
      readOnly={isReadOnly}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (!isSendKey(event)) return;
        event.preventDefault();
        onEnter();
      }}
      className="block max-h-chat-input-max w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-lead leading-chat outline-none placeholder:text-ink-2"
    />
  );
}

function TalkButton({ isOn, onToggle, buttonProps }: { isOn: boolean; onToggle: () => void; buttonProps?: ComponentProps<'button'> }) {
  return (
    <button type="button" aria-pressed={isOn} onClick={onToggle} className={TOOL_BUTTON} {...buttonProps}>
      <TalkIcon />
      <span>{CHAT_BOX_LABELS.talk}</span>
    </button>
  );
}

function SendButton({ label, isEnabled }: { label: string; isEnabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={!isEnabled}
      aria-label={label}
      title={label}
      className="ml-auto inline-flex size-8 flex-none items-center justify-center bg-ink text-paper disabled:cursor-default disabled:opacity-30"
    >
      <SendIcon />
    </button>
  );
}

function TalkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-4.5 flex-none">
      <rect x={9} y={3} width={6} height={12} rx={3} />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="size-4">
      <path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}
