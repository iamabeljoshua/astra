import type { SliderMove } from '@astra/board';
import { getStepDecimals, writeStyle } from '@astra/board/drawing';
import type { ElementId, Slider } from '@astra/contracts';
import { BOARD_LABELS } from '../strings';
import type { BoardItem, ItemContext, SliderHandlers } from './boardItems';

const WIDEST_SLIDER = 420;
const STEPS_ACROSS = 100;

const getStep = ({ min, max }: Slider) => 10 ** Math.floor(Math.log10((max - min) / STEPS_ACROSS));

function getSliderWords(content: Slider): { label: string; unit: string } {
  return 'constant' in content ? { label: content.constant, unit: '' } : BOARD_LABELS.figures.parameters[content.parameter];
}

function getValue(content: Slider, { board }: ItemContext): number | undefined {
  const target = board.elements.get(content.target);
  const name = 'constant' in content ? content.constant : content.parameter;
  return target?.placedScene?.scene.values?.[name];
}

function getSliderMove(content: Slider, value: number): SliderMove {
  const target = content.target as ElementId;
  return 'constant' in content ? { target, value, constant: content.constant } : { target, value, parameter: content.parameter };
}

function createSliderInput(content: Slider, step: number): HTMLInputElement {
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: String(content.min), max: String(content.max), step: String(step) });
  return input;
}

// A native range input that shows the board's value, so a replay moves it too. The number on screen stays out of the label so the input keeps a name of its own, and it is no live region, because a value moving while the tutor talks must not speak over the voice.
export function createSliderItem(wrapper: HTMLElement, content: Slider, { onSliderMove, onSliderRelease }: SliderHandlers): BoardItem {
  const step = getStep(content);
  const decimals = getStepDecimals(step);
  const words = getSliderWords(content);
  const slider = document.createElement('div');
  slider.className = 'board-slider';
  const label = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = words.label;
  const input = createSliderInput(content, step);
  input.addEventListener('input', () => onSliderMove?.(getSliderMove(content, Number(Number(input.value).toFixed(decimals)))));
  input.addEventListener('change', () => onSliderRelease?.());
  label.append(name, input);
  const shownValue = document.createElement('span');
  shownValue.className = 'board-slider-value';
  shownValue.setAttribute('aria-hidden', 'true');
  slider.append(label, shownValue);
  wrapper.append(slider);
  return {
    prepare({ maxWidth }) {
      writeStyle(slider, 'width', `${Math.min(maxWidth, WIDEST_SLIDER)}px`);
      return { fit: 'line', size: { width: slider.offsetWidth, height: slider.offsetHeight }, fromSize: null };
    },
    paint(context) {
      const value = getValue(content, context);
      input.disabled = !context.canMoveSliders || value === undefined;
      const shown = value === undefined ? '' : `${value.toFixed(decimals)}${/^[a-z]/i.test(words.unit) ? ' ' : ''}${words.unit}`;
      if (shownValue.textContent !== shown) shownValue.textContent = shown;
      if (shown === '') input.removeAttribute('aria-valuetext');
      else if (input.getAttribute('aria-valuetext') !== shown) input.setAttribute('aria-valuetext', shown);
      if (value !== undefined && Math.abs(Number(input.value) - value) > step / 2) input.value = String(value);
    },
    getEntranceOpacity: ({ progress }) => progress,
    remove: () => slider.remove(),
  };
}
