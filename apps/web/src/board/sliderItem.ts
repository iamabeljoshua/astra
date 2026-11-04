import type { SliderMove } from '@astra/board';
import { writeStyle } from '@astra/board/drawing';
import type { ElementId, Slider } from '@astra/contracts';
import { BOARD_LABELS } from '../strings';
import type { BoardItem, ItemContext, SliderHandlers } from './boardItems';

const WIDEST_SLIDER = 420;
const STEPS_ACROSS = 100;

const getStep = ({ min, max }: Slider) => 10 ** Math.floor(Math.log10((max - min) / STEPS_ACROSS));

const getDecimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

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

// A native range input that shows the board's value, so a replay moves it too.
export function createSliderItem(wrapper: HTMLElement, content: Slider, { onSliderMove, onSliderRelease }: SliderHandlers): BoardItem {
  const step = getStep(content);
  const words = getSliderWords(content);
  const label = document.createElement('label');
  label.className = 'board-slider';
  const name = document.createElement('span');
  name.textContent = words.label;
  const output = document.createElement('output');
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: String(content.min), max: String(content.max), step: String(step) });
  input.addEventListener('input', () => onSliderMove?.(getSliderMove(content, Number(Number(input.value).toFixed(getDecimals(step))))));
  input.addEventListener('change', () => onSliderRelease?.());
  label.append(name, output, input);
  wrapper.append(label);
  return {
    prepare({ maxWidth }) {
      writeStyle(label, 'width', `${Math.min(maxWidth, WIDEST_SLIDER)}px`);
      return { fit: 'line', size: { width: label.offsetWidth, height: label.offsetHeight }, fromSize: null };
    },
    paint(context) {
      const value = getValue(content, context);
      input.disabled = !context.canMoveSliders;
      if (value === undefined) return;
      const shown = `${value.toFixed(getDecimals(step))}${/^[a-z]/i.test(words.unit) ? ' ' : ''}${words.unit}`;
      if (output.textContent !== shown) output.textContent = shown;
      if (Math.abs(Number(input.value) - value) > step / 2) input.value = String(value);
    },
    getEntranceOpacity: ({ progress }) => progress,
    remove: () => label.remove(),
  };
}
