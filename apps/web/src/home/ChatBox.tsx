import { useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { CHAT_BOX_LABELS } from '../strings';
import { useHeightThatFitsText } from './useHeightThatFitsText';

const ACCEPTED_ATTACHMENTS = 'image/*,.pdf';
// WebKit fires compositionend before keydown, so the Enter that confirms a word has this code and isComposing false.
const COMPOSING_KEY_CODE = 229;
const TOOL_BUTTON =
  'inline-flex h-8 items-center gap-1.5 px-2 text-fine text-ink-2 hover:text-ink aria-pressed:font-medium aria-pressed:text-ink';

interface ChatBoxProps {
  onSend: (question: string) => void;
  onEdit: () => void;
}

export function ChatBox({ onSend, onEdit }: ChatBoxProps) {
  const [question, setQuestion] = useState('');
  const [isTalkOn, setIsTalkOn] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const attachButton = useRef<HTMLButtonElement>(null);
  const hasQuestion = question.trim() !== '';

  function send() {
    if (hasQuestion) onSend(question.trim());
  }

  function editQuestion(editedQuestion: string) {
    setQuestion(editedQuestion);
    onEdit();
  }

  function removeAttachment() {
    setAttachment(null);
    attachButton.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  return (
    <form onSubmit={submit} className="fades-with-theme border border-ink bg-paper focus-within:outline focus-within:outline-accent">
      {attachment && <AttachmentChip fileName={attachment.name} onRemove={removeAttachment} />}
      <QuestionBox
        question={question}
        placeholder={isTalkOn ? CHAT_BOX_LABELS.placeholderWhileTalkIsOn : CHAT_BOX_LABELS.placeholder}
        onChange={editQuestion}
        onEnter={send}
      />
      <div className="flex items-center gap-1.5 pt-1.5 pr-2 pb-2 pl-2.5">
        <AttachButton button={attachButton} onChoose={setAttachment} />
        <TalkButton isOn={isTalkOn} onToggle={() => setIsTalkOn(!isTalkOn)} />
        <SendButton isEnabled={hasQuestion} />
      </div>
    </form>
  );
}

function isSendKey(event: KeyboardEvent) {
  const isComposing = event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE;
  return event.key === 'Enter' && !event.shiftKey && !isComposing;
}

interface QuestionBoxProps {
  question: string;
  placeholder: string;
  onChange: (question: string) => void;
  onEnter: () => void;
}

function QuestionBox({ question, placeholder, onChange, onEnter }: QuestionBoxProps) {
  const textBox = useHeightThatFitsText(question, placeholder);

  return (
    <textarea
      ref={textBox}
      rows={1}
      value={question}
      aria-label={CHAT_BOX_LABELS.label}
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

function AttachmentChip({ fileName, onRemove }: { fileName: string; onRemove: () => void }) {
  return (
    <div className="px-4 pt-2">
      <div className="inline-flex max-w-full items-center gap-2 border border-line px-2 py-0.75 text-fine text-ink-2">
        <span className="truncate">{fileName}</span>
        <button
          type="button"
          aria-label={CHAT_BOX_LABELS.removeAttachment(fileName)}
          onClick={onRemove}
          className="minimum-target -m-1 p-1 hover:text-ink"
        >
          {CHAT_BOX_LABELS.removeAttachmentMark}
        </button>
      </div>
    </div>
  );
}

interface AttachButtonProps {
  button: RefObject<HTMLButtonElement | null>;
  onChoose: (file: File | null) => void;
}

function AttachButton({ button, onChoose }: AttachButtonProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    if (!fileInput.current) return;
    // A browser can fire no change event for the same file twice, so a removed file could not come back.
    fileInput.current.value = '';
    fileInput.current.click();
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept={ACCEPTED_ATTACHMENTS}
        onChange={(event) => onChoose(event.target.files?.[0] ?? null)}
      />
      <button ref={button} type="button" onClick={openFilePicker} className={TOOL_BUTTON}>
        <AttachIcon />
        <span>{CHAT_BOX_LABELS.attach}</span>
      </button>
    </>
  );
}

function TalkButton({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={isOn} onClick={onToggle} className={TOOL_BUTTON}>
      <TalkIcon />
      <span>{CHAT_BOX_LABELS.talk}</span>
    </button>
  );
}

function SendButton({ isEnabled }: { isEnabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={!isEnabled}
      aria-label={CHAT_BOX_LABELS.send}
      title={CHAT_BOX_LABELS.send}
      className="ml-auto inline-flex size-8 flex-none items-center justify-center bg-ink text-paper disabled:cursor-default disabled:opacity-30"
    >
      <SendIcon />
    </button>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden className="size-4.5 flex-none">
      <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3" />
    </svg>
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
