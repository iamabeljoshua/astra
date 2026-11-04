import { useCallback, useEffect, useState } from 'react';

const NOTE_LASTS_MS = 5_000;
const FILE_TYPE = 'Files';
const PLAIN_TEXT_TYPE = 'text/plain';
const RICH_TEXT_TYPE = 'text/html';

function carriesFile(transfer: DataTransfer | null) {
  return transfer?.types.includes(FILE_TYPE) ?? false;
}

// Word and Excel put a picture of the copied text beside the text, and that paste is still text.
function isFilePaste(clipboard: DataTransfer | null) {
  const isCopiedText = clipboard?.types.includes(PLAIN_TEXT_TYPE) && clipboard.types.includes(RICH_TEXT_TYPE);
  return carriesFile(clipboard) && !isCopiedText;
}

// Listens ahead of the page, so no field reads the file's name from the event, and the browser neither writes it nor opens the file.
function useFileAttempts(onAttempt: () => void) {
  useEffect(() => {
    const refuse = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      onAttempt();
    };
    const allowDrop = (event: DragEvent) => {
      if (carriesFile(event.dataTransfer)) event.preventDefault();
    };
    const refuseDrop = (event: DragEvent) => {
      if (carriesFile(event.dataTransfer)) refuse(event);
    };
    const refusePaste = (event: ClipboardEvent) => {
      if (isFilePaste(event.clipboardData)) refuse(event);
    };
    document.addEventListener('dragover', allowDrop, true);
    document.addEventListener('drop', refuseDrop, true);
    document.addEventListener('paste', refusePaste, true);
    return () => {
      document.removeEventListener('dragover', allowDrop, true);
      document.removeEventListener('drop', refuseDrop, true);
      document.removeEventListener('paste', refusePaste, true);
    };
  }, [onAttempt]);
}

// A session's Escape stops the tutor, so the note takes the first press for itself. Typing closes it too, because it can sit over the words.
function useNoteCloses(noteKey: number | null, close: () => void) {
  useEffect(() => {
    if (noteKey === null) return undefined;
    const closing = setTimeout(close, NOTE_LASTS_MS);
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
      if (event.key === 'Escape' || event.key.length === 1) close();
    };
    document.addEventListener('keydown', closeOnKey, true);
    return () => {
      clearTimeout(closing);
      document.removeEventListener('keydown', closeOnKey, true);
    };
  }, [noteKey, close]);
}

export interface FilesComingSoon {
  /** A new key per attempt puts the note on the page again, so a screen reader says it again. Null means no note. */
  noteKey: number | null;
  showNote(): void;
}

// One owner per screen, so a file brings one note however many places could show it.
export function useFilesComingSoon(): FilesComingSoon {
  const [noteKey, setNoteKey] = useState<number | null>(null);
  const showNote = useCallback(() => setNoteKey((key) => (key ?? 0) + 1), []);
  const closeNote = useCallback(() => setNoteKey(null), []);
  useFileAttempts(showNote);
  useNoteCloses(noteKey, closeNote);
  return { noteKey, showNote };
}
