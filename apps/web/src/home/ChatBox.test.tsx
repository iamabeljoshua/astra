import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_BOX_LABELS } from '../strings';
import { ChatBox } from './ChatBox';

const QUESTION = 'Why is the sky dark at night?';
const GROWN_HEIGHT_PX = 96;

const getTextBox = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: CHAT_BOX_LABELS.label });
const getSendButton = () => screen.getByRole<HTMLButtonElement>('button', { name: CHAT_BOX_LABELS.send });
const getTalkButton = () => screen.getByRole('button', { name: CHAT_BOX_LABELS.talk });
const type = (text: string) => fireEvent.change(getTextBox(), { target: { value: text } });

function renderChatBox() {
  const onSend = vi.fn();
  const { container } = render(<ChatBox onSend={onSend} onEdit={() => undefined} />);
  return { onSend, fileInput: container.querySelector<HTMLInputElement>('input[type=file]')! };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatBox', () => {
  describe('sending', () => {
    it('disables send while the box is empty', () => {
      renderChatBox();

      expect(getSendButton().disabled).toBe(true);
    });

    it('disables send while the box holds only spaces and new lines', () => {
      renderChatBox();

      type(' \n ');

      expect(getSendButton().disabled).toBe(true);
    });

    it('enables send once the box holds text', () => {
      renderChatBox();

      type(QUESTION);

      expect(getSendButton().disabled).toBe(false);
    });

    it('sends the question on Enter and adds no line', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'Enter' });

      expect(onSend).toHaveBeenCalledExactlyOnceWith(QUESTION);
      expect(wasNotPrevented).toBe(false);
    });

    it('leaves Shift plus Enter to the browser, which adds a line, and does not send', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'Enter', shiftKey: true });

      expect(onSend).not.toHaveBeenCalled();
      expect(wasNotPrevented).toBe(true);
    });

    it('does not send on any other key', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'a' });

      expect(onSend).not.toHaveBeenCalled();
      expect(wasNotPrevented).toBe(true);
    });

    it('does not send on the Enter that confirms a word in an input method', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      fireEvent.keyDown(getTextBox(), { key: 'Enter', isComposing: true });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('sends nothing on Enter while the box holds only spaces', () => {
      const { onSend } = renderChatBox();
      type('   ');

      fireEvent.keyDown(getTextBox(), { key: 'Enter' });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('sends the question without its outer spaces from the send button', () => {
      const { onSend } = renderChatBox();
      type(`  ${QUESTION}\n`);

      fireEvent.click(getSendButton());

      expect(onSend).toHaveBeenCalledExactlyOnceWith(QUESTION);
    });

    it('keeps the student\'s text in the box after sending', () => {
      renderChatBox();
      type(QUESTION);

      fireEvent.click(getSendButton());

      expect(getTextBox().value).toBe(QUESTION);
    });
  });

  describe('growing', () => {
    function stubTextHeight(heightPx: number) {
      vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(heightPx);
    }

    it('grows to fit the text as the student types', () => {
      renderChatBox();
      stubTextHeight(GROWN_HEIGHT_PX);

      type(QUESTION);

      expect(getTextBox().style.height).toBe(`${GROWN_HEIGHT_PX}px`);
    });

    it('fits the text again when the window changes size', () => {
      renderChatBox();
      stubTextHeight(GROWN_HEIGHT_PX);

      fireEvent(window, new Event('resize'));

      expect(getTextBox().style.height).toBe(`${GROWN_HEIGHT_PX}px`);
    });
  });

  describe('the talk control', () => {
    it('shows that it is on, and says that talking is not open yet', () => {
      renderChatBox();
      expect(getTalkButton().getAttribute('aria-pressed')).toBe('false');
      expect(getTextBox().placeholder).toBe(CHAT_BOX_LABELS.placeholder);

      fireEvent.click(getTalkButton());

      expect(getTalkButton().getAttribute('aria-pressed')).toBe('true');
      expect(getTextBox().placeholder).toBe(CHAT_BOX_LABELS.placeholderWhileTalkIsOn);
    });

    it('turns off again and keeps the student\'s text', () => {
      renderChatBox();
      type(QUESTION);

      fireEvent.click(getTalkButton());
      fireEvent.click(getTalkButton());

      expect(getTalkButton().getAttribute('aria-pressed')).toBe('false');
      expect(getTextBox().value).toBe(QUESTION);
    });
  });

  describe('the photo or PDF control', () => {
    const photo = new File(['photo'], 'homework.jpg', { type: 'image/jpeg' });

    it('accepts photos and PDFs', () => {
      const { fileInput } = renderChatBox();

      expect(fileInput.accept).toBe('image/*,.pdf');
    });

    it('opens the file picker', () => {
      const { fileInput } = renderChatBox();
      const openPicker = vi.spyOn(fileInput, 'click');

      fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.attach }));

      expect(openPicker).toHaveBeenCalledOnce();
    });

    it('shows the chosen file and lets the student remove it', () => {
      const { fileInput } = renderChatBox();

      fireEvent.change(fileInput, { target: { files: [photo] } });
      screen.getByText(photo.name);

      fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.removeAttachment }));
      expect(screen.queryByText(photo.name)).toBeNull();
    });

    it('still needs text before send works', () => {
      const { fileInput } = renderChatBox();

      fireEvent.change(fileInput, { target: { files: [photo] } });

      expect(getSendButton().disabled).toBe(true);
    });
  });
});
