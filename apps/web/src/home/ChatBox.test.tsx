import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_BOX_LABELS } from '../strings';
import { notifyResizeObservers, startLoadingFont } from '../test/fakeLayout';
import { ChatBox } from './ChatBox';

const QUESTION = 'Why is the sky dark at night?';
const ONE_LINE_PX = 42;
const TWO_LINES_PX = 66;
const THREE_LINES_PX = 90;

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
  vi.unstubAllGlobals();
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

      expect(onSend).toHaveBeenCalledExactlyOnceWith(QUESTION, getTextBox());
      expect(wasNotPrevented).toBe(false);
    });

    it('leaves Shift plus Enter to the browser, which adds a line, and does not send', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'Enter', shiftKey: true });

      expect(onSend).not.toHaveBeenCalled();
      expect(wasNotPrevented).toBe(true);
    });

    it('leaves Return to the browser on a touch screen, which has no Shift, so a line can be added', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'Enter' });

      expect(onSend).not.toHaveBeenCalled();
      expect(wasNotPrevented).toBe(true);
      fireEvent.click(getSendButton());
      expect(onSend).toHaveBeenCalledExactlyOnceWith(QUESTION, getTextBox());
    });

    it('does not send on any other key', () => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      const wasNotPrevented = fireEvent.keyDown(getTextBox(), { key: 'a' });

      expect(onSend).not.toHaveBeenCalled();
      expect(wasNotPrevented).toBe(true);
    });

    it.each([
      ['Chromium', { isComposing: true }],
      ['WebKit, after compositionend', { keyCode: 229 }],
    ])('does not send on the Enter that confirms a word in an input method in %s', (_browser, composingEvent) => {
      const { onSend } = renderChatBox();
      type(QUESTION);

      fireEvent.keyDown(getTextBox(), { key: 'Enter', ...composingEvent });

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

      expect(onSend).toHaveBeenCalledExactlyOnceWith(QUESTION, getTextBox());
    });
  });

  describe('fitting the text', () => {
    const layout = { isHidden: false, contentHeightPx: ONE_LINE_PX };
    const getHeight = () => getTextBox().style.height;

    beforeEach(() => {
      layout.isHidden = false;
      layout.contentHeightPx = ONE_LINE_PX;
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((runFrame) => {
        runFrame(0);
        return 0;
      });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => (layout.isHidden ? 0 : 300));
      vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() =>
        layout.isHidden ? 0 : layout.contentHeightPx,
      );
    });

    it('keeps its height while hidden, whatever resizes, and fits again when it shows', () => {
      renderChatBox();
      layout.contentHeightPx = TWO_LINES_PX;
      type(QUESTION);
      expect(getHeight()).toBe(`${TWO_LINES_PX}px`);

      layout.isHidden = true;
      fireEvent(window, new Event('resize'));
      notifyResizeObservers();
      expect(getHeight()).toBe(`${TWO_LINES_PX}px`);

      layout.isHidden = false;
      layout.contentHeightPx = THREE_LINES_PX;
      notifyResizeObservers();
      expect(getHeight()).toBe(`${THREE_LINES_PX}px`);
    });

    it('fits again once a web font has loaded', async () => {
      const finishLoadingFont = startLoadingFont();
      layout.contentHeightPx = TWO_LINES_PX;
      renderChatBox();

      layout.contentHeightPx = ONE_LINE_PX;
      await finishLoadingFont();

      expect(getHeight()).toBe(`${ONE_LINE_PX}px`);
    });

    it('fits again when Talk changes the placeholder', () => {
      renderChatBox();
      layout.contentHeightPx = TWO_LINES_PX;

      fireEvent.click(getTalkButton());

      expect(getHeight()).toBe(`${TWO_LINES_PX}px`);
    });

    it('stays as tall as a wrapped placeholder when the first key makes the content shorter', () => {
      layout.contentHeightPx = TWO_LINES_PX;
      renderChatBox();

      layout.contentHeightPx = ONE_LINE_PX;
      type(QUESTION);
      expect(getHeight()).toBe(`${TWO_LINES_PX}px`);

      layout.contentHeightPx = THREE_LINES_PX;
      type(`${QUESTION} ${QUESTION}`);
      expect(getHeight()).toBe(`${THREE_LINES_PX}px`);
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

    it('opens the file picker', () => {
      const { fileInput } = renderChatBox();
      const openPicker = vi.spyOn(fileInput, 'click');

      fireEvent.click(screen.getByRole('button', { name: CHAT_BOX_LABELS.attach }));

      expect(openPicker).toHaveBeenCalledOnce();
    });

    it('shows the chosen file, removes it by name, and returns focus to the control', () => {
      const { fileInput } = renderChatBox();

      fireEvent.change(fileInput, { target: { files: [photo] } });
      screen.getByText(photo.name);

      const removeButton = screen.getByRole('button', { name: new RegExp(photo.name) });
      removeButton.focus();
      fireEvent.click(removeButton);

      expect(screen.queryByText(photo.name)).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: CHAT_BOX_LABELS.attach }));
    });

    it('still needs text before send works', () => {
      const { fileInput } = renderChatBox();

      fireEvent.change(fileInput, { target: { files: [photo] } });

      expect(getSendButton().disabled).toBe(true);
    });
  });
});
