import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CHAT_BOX_LABELS } from '../strings';

const ACCEPTED_ATTACHMENTS = 'image/*,.pdf';
const TOOL_BUTTON =
  'inline-flex h-8 items-center gap-1.5 px-2 text-fine text-ink-2 hover:text-ink aria-pressed:font-medium aria-pressed:text-ink';

interface ChatBoxProps {
  onSend: (question: string) => void;
  onEdit: () => void;
}

function useHeightThatFitsText(text: string) {
  const textBox = useRef<HTMLTextAreaElement>(null);

  const fitHeightToText = useCallback(() => {
    if (!textBox.current) return;
    textBox.current.style.height = 'auto';
    textBox.current.style.height = `${textBox.current.scrollHeight}px`;
  }, []);

  useLayoutEffect(fitHeightToText, [text, fitHeightToText]);

  useEffect(() => {
    window.addEventListener('resize', fitHeightToText);
    return () => window.removeEventListener('resize', fitHeightToText);
  }, [fitHeightToText]);

  return textBox;
}

export function ChatBox({ onSend, onEdit }: ChatBoxProps) {
  const [question, setQuestion] = useState('');
  const [isTalkOn, setIsTalkOn] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const textBox = useHeightThatFitsText(question);
  const hasQuestion = question.trim() !== '';

  function send() {
    if (hasQuestion) onSend(question.trim());
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="fades-with-theme border border-ink bg-paper focus-within:outline focus-within:outline-accent"
    >
      {attachment && <AttachmentChip fileName={attachment.name} onRemove={() => setAttachment(null)} />}
      <textarea
        ref={textBox}
        rows={1}
        value={question}
        aria-label={CHAT_BOX_LABELS.label}
        placeholder={isTalkOn ? CHAT_BOX_LABELS.placeholderWhileTalkIsOn : CHAT_BOX_LABELS.placeholder}
        autoComplete="off"
        onChange={(event) => {
          setQuestion(event.target.value);
          onEdit();
        }}
        onKeyDown={sendOnEnter}
        className="block max-h-chat-input-max w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-lead leading-chat outline-none placeholder:text-ink-2"
      />
      <div className="flex items-center gap-1.5 pt-1.5 pr-2 pb-2 pl-2.5">
        <AttachButton onChoose={setAttachment} />
        <button type="button" aria-pressed={isTalkOn} onClick={() => setIsTalkOn(!isTalkOn)} className={TOOL_BUTTON}>
          <TalkIcon />
          <span>{CHAT_BOX_LABELS.talk}</span>
        </button>
        <button
          type="submit"
          disabled={!hasQuestion}
          aria-label={CHAT_BOX_LABELS.send}
          title={CHAT_BOX_LABELS.send}
          className="ml-auto inline-flex size-8 flex-none items-center justify-center bg-ink text-paper disabled:cursor-default disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}

function AttachmentChip({ fileName, onRemove }: { fileName: string; onRemove: () => void }) {
  return (
    <div className="px-4 pt-2">
      <div className="inline-flex max-w-full items-center gap-2 border border-line px-2 py-0.75 text-fine text-ink-2">
        <span className="truncate">{fileName}</span>
        <button type="button" aria-label={CHAT_BOX_LABELS.removeAttachment} onClick={onRemove} className="-m-1 p-1 hover:text-ink">
          {CHAT_BOX_LABELS.removeAttachmentMark}
        </button>
      </div>
    </div>
  );
}

function AttachButton({ onChoose }: { onChoose: (file: File | null) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    if (!fileInput.current) return;
    // Chromium and WebKit fire no change event for the same file twice, so a removed file could not come back.
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
      <button type="button" onClick={openFilePicker} className={TOOL_BUTTON}>
        <AttachIcon />
        <span>{CHAT_BOX_LABELS.attach}</span>
      </button>
    </>
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
