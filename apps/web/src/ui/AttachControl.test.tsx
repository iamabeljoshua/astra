import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACH_LABELS } from '../strings';
import { AttachControl } from './AttachControl';
import { useFilesComingSoon } from './useFilesComingSoon';

const NOTE_LASTS_MS = 5_000;
const FILE_NAME = 'homework.jpg';

const getNote = () => screen.queryByText(ATTACH_LABELS.comingSoon);
const getControl = () => screen.getByRole('button', { name: ATTACH_LABELS.attach });

function ControlOnAPage() {
  return <AttachControl filesComingSoon={useFilesComingSoon()} className="tool" />;
}

function renderControl() {
  render(
    <>
      <ControlOnAPage />
      <textarea aria-label="Question" />
    </>,
  );
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Question' });
}

function firePaste(target: Element, types: string[]) {
  const paste = createEvent.paste(target, { clipboardData: { types, getData: () => FILE_NAME } });
  fireEvent(target, paste);
  return paste;
}

function fireDrag(kind: 'dragOver' | 'drop', target: Element, types: string[]) {
  const drag = createEvent[kind](target, { dataTransfer: { types, files: types.includes('Files') ? [new File(['bytes'], FILE_NAME)] : [] } });
  fireEvent(target, drag);
  return drag;
}

describe('the photo or PDF control', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the note in a live region, and offers no way to choose a file', () => {
    const openPicker = vi.spyOn(HTMLInputElement.prototype, 'click');
    renderControl();
    const liveRegion = screen.getByRole('status');
    expect(liveRegion.textContent).toBe('');

    fireEvent.click(getControl());

    expect(liveRegion.textContent).toBe(ATTACH_LABELS.comingSoon);
    expect(document.querySelector('input[type=file]')).toBeNull();
    expect(openPicker).not.toHaveBeenCalled();
  });

  it('dismisses the note by itself, and counts again from a second press', () => {
    renderControl();
    fireEvent.click(getControl());

    act(() => vi.advanceTimersByTime(NOTE_LASTS_MS - 1));
    expect(getNote()).not.toBeNull();
    fireEvent.click(getControl());
    act(() => vi.advanceTimersByTime(NOTE_LASTS_MS - 1));
    expect(getNote()).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(getNote()).toBeNull();
  });

  it('puts the words on the page again on a second press, so a screen reader says them again', () => {
    renderControl();
    fireEvent.click(getControl());
    const firstNote = getNote();

    fireEvent.click(getControl());

    expect(getNote()).not.toBe(firstNote);
  });

  it('dismisses the note on Escape, and only that first Escape is taken from the rest of the page', () => {
    const seenByThePage = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', seenByThePage);
    renderControl();
    fireEvent.click(getControl());

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(getNote()).toBeNull();
    expect(seenByThePage).toHaveLastReturnedWith(true);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(seenByThePage).toHaveLastReturnedWith(false);
    document.removeEventListener('keydown', seenByThePage);
  });

  it('closes the note when the student goes on typing, and leaves the key to the box', () => {
    const textBox = renderControl();
    fireEvent.click(getControl());

    const wasNotPrevented = fireEvent.keyDown(textBox, { key: 'a' });

    expect(getNote()).toBeNull();
    expect(wasNotPrevented).toBe(true);
  });

  it.each([
    ['anywhere on the page', () => document.body],
    ['on the text box', () => screen.getByRole('textbox', { name: 'Question' })],
  ])('shows the note for a file dropped %s, and the browser neither opens it nor writes its name', (_place, getTarget) => {
    renderControl();

    expect(fireDrag('dragOver', getTarget(), ['Files']).defaultPrevented).toBe(true);
    expect(fireDrag('drop', getTarget(), ['Files']).defaultPrevented).toBe(true);

    expect(getNote()).not.toBeNull();
  });

  it('leaves dragged text to the browser', () => {
    const textBox = renderControl();

    expect(fireDrag('dragOver', textBox, ['text/plain']).defaultPrevented).toBe(false);
    expect(fireDrag('drop', textBox, ['text/plain']).defaultPrevented).toBe(false);

    expect(getNote()).toBeNull();
  });

  it.each([
    ['a screenshot', ['Files']],
    ['a file copied in Finder, which also carries its name as text', ['text/plain', 'Files']],
    ['a picture copied from a web page', ['text/html', 'Files']],
  ])('shows the note for a paste of %s, and the browser does not write its name', (_kind, types) => {
    const textBox = renderControl();

    expect(firePaste(textBox, types).defaultPrevented).toBe(true);

    expect(getNote()).not.toBeNull();
  });

  it('keeps a pasted file from a field that reads the clipboard for itself', () => {
    const textBox = renderControl();
    const readsTheClipboard = vi.fn();
    textBox.addEventListener('paste', readsTheClipboard);

    firePaste(textBox, ['text/plain', 'Files']);

    expect(readsTheClipboard).not.toHaveBeenCalled();
  });

  it.each([
    ['plain text', ['text/plain']],
    ['text from Word or Excel, which adds a picture of itself', ['text/plain', 'text/html', 'Files']],
  ])('leaves a paste of %s to the browser', (_kind, types) => {
    const textBox = renderControl();

    expect(firePaste(textBox, types).defaultPrevented).toBe(false);

    expect(getNote()).toBeNull();
  });

  it('stops listening once it leaves the page', () => {
    const { unmount } = render(<ControlOnAPage />);
    unmount();

    expect(firePaste(document.body, ['Files']).defaultPrevented).toBe(false);
  });
});
