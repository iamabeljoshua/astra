const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
export const CHECK_WIDTH = 320;
export const CHECK_HEIGHT = 180;
const CELL_SIZE = DESIGN_WIDTH / CHECK_WIDTH;
const EDGE_LEVELS = 14;
const FEWEST_EDGE_SHARE = 0.002;
const SHOWN_ALPHA = 0.5;
const POINTER_REACH_CELLS = 3;
const FLAT_LEVELS = 8;
const BACKGROUND_LEVELS = 18;
const MARGIN_CELLS = 2;
const CLIP_SLACK = 1;
const HIGHEST_NUMBER = 1e6;
const WIDEST_LABEL = DESIGN_WIDTH - 50;
const BROKEN_TEXT = /\bNaN\b|\bundefined\b|\bnull\b|Infinity|\[object|\d\.\d{5,}|\de[+-]\d/;
const NUMBER_METHODS = ['moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fillRect', 'quadraticCurveTo', 'bezierCurveTo', 'translate', 'scale'];

const getCell = ({ cells, width, height }, cellX, cellY) => {
  const x = Math.max(0, Math.min(width - 1, cellX));
  const y = Math.max(0, Math.min(height - 1, cellY));
  const at = (y * width + x) * 4;
  return [cells[at], cells[at + 1], cells[at + 2]];
};

const getLevel = ([red, green, blue]) => (red * 299 + green * 587 + blue * 114) / 1000;

const getColorGap = (first, second) => Math.max(...first.map((part, index) => Math.abs(part - second[index])));

/** A gradient sky has no edges at this size, so an empty frame reads as empty whatever its background. */
function getEdgeShare(frame) {
  let edges = 0;
  for (let y = 0; y < frame.height - 1; y += 1) {
    for (let x = 0; x < frame.width - 1; x += 1) {
      const level = getLevel(getCell(frame, x, y));
      if (Math.abs(level - getLevel(getCell(frame, x + 1, y))) > EDGE_LEVELS || Math.abs(level - getLevel(getCell(frame, x, y + 1))) > EDGE_LEVELS) edges += 1;
    }
  }
  return edges / (frame.width * frame.height);
}

// The same row's far edges stand in for the background, so a sky's gradient does not read as a thing.
function isPointerOnNothing(frame, to) {
  const centerX = Math.round(to.x / CELL_SIZE);
  const centerY = Math.round(to.y / CELL_SIZE);
  const levels = [];
  for (let y = centerY - POINTER_REACH_CELLS; y <= centerY + POINTER_REACH_CELLS; y += 1) {
    for (let x = centerX - POINTER_REACH_CELLS; x <= centerX + POINTER_REACH_CELLS; x += 1) levels.push(getLevel(getCell(frame, x, y)));
  }
  if (Math.max(...levels) - Math.min(...levels) >= FLAT_LEVELS) return false;
  const color = getCell(frame, centerX, centerY);
  return getColorGap(color, getCell(frame, MARGIN_CELLS, centerY)) <= BACKGROUND_LEVELS && getColorGap(color, getCell(frame, frame.width - 1 - MARGIN_CELLS, centerY)) <= BACKGROUND_LEVELS;
}

const isOffFrame = ({ x, y }) => x < 0 || x > DESIGN_WIDTH || y < 0 || y > DESIGN_HEIGHT;

function getLabelProblems(frame) {
  return frame.labels.flatMap(({ text, alpha, width }) => {
    if (alpha < SHOWN_ALPHA) return [];
    if (BROKEN_TEXT.test(text)) return [`the label "${text}" shows a broken number`];
    return width > WIDEST_LABEL ? [`the label "${text}" is wider than the frame`] : [];
  });
}

const isPointerLost = (frame, to) => ![to.x, to.y].every(Number.isFinite) || isOffFrame(to) || isPointerOnNothing(frame, to);

/** Labels whose pointer lands on nothing or off the frame. The label stays and its pointer goes, because a person read the helicopter as right with its pointer on plain air. */
export function getLostPointers(frames) {
  return [...new Set(frames.flatMap((frame) => frame.labels.filter(({ to, alpha }) => to && alpha >= SHOWN_ALPHA && isPointerLost(frame, to)).map(({ text }) => text)))];
}

/** What code can catch on a drawing nobody has looked at. Any line here means no picture. */
export function getFrameProblems(frames) {
  const problems = frames.flatMap((frame) => [
    ...(getEdgeShare(frame) < FEWEST_EDGE_SHARE ? [`it is blank at ${frame.seconds} s`] : []),
    ...getLabelProblems(frame),
    ...frame.clippedTexts.map((text) => `the text "${text}" is cut by the frame`),
    ...frame.brokenTexts.map((text) => `the text "${text}" shows a broken number`),
    ...frame.brokenNumbers.map((method) => `${method} was given a number that cannot be drawn`),
  ]);
  return [...new Set(problems)];
}

function isCutByFrame(corners) {
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  const isGone = Math.max(...xs) < 0 || Math.min(...xs) > DESIGN_WIDTH || Math.max(...ys) < 0 || Math.min(...ys) > DESIGN_HEIGHT;
  return !isGone && (Math.min(...xs) < -CLIP_SLACK || Math.max(...xs) > DESIGN_WIDTH + CLIP_SLACK || Math.min(...ys) < -CLIP_SLACK || Math.max(...ys) > DESIGN_HEIGHT + CLIP_SLACK);
}

/** Listens to a context while the frame check draws, and leaves nothing behind once it stops. */
export function watchContext(context, getStage) {
  const getEmptyNotes = () => ({ clippedTexts: [], brokenTexts: [], brokenNumbers: [] });
  let notes = getEmptyNotes();
  const fillText = context.fillText;
  context.fillText = function watchedFillText(text, x, y, ...rest) {
    const words = String(text);
    if (context.globalAlpha >= SHOWN_ALPHA && BROKEN_TEXT.test(words)) notes.brokenTexts.push(words);
    if (context.globalAlpha >= SHOWN_ALPHA) {
      const { actualBoundingBoxLeft: left, actualBoundingBoxRight: right, actualBoundingBoxAscent: above, actualBoundingBoxDescent: below } = context.measureText(words);
      const { a, b, c, d, e, f } = context.getTransform();
      const { scale, left: stageLeft, top: stageTop } = getStage();
      const toDesign = (pointX, pointY) => ({ x: (a * pointX + c * pointY + e - stageLeft) / scale, y: (b * pointX + d * pointY + f - stageTop) / scale });
      if (isCutByFrame([toDesign(x - left, y - above), toDesign(x + right, y - above), toDesign(x - left, y + below), toDesign(x + right, y + below)])) notes.clippedTexts.push(words);
    }
    return fillText.call(context, text, x, y, ...rest);
  };
  for (const method of NUMBER_METHODS) {
    const real = context[method];
    context[method] = function watchedNumbers(...numbers) {
      if (numbers.some((number) => typeof number === 'number' && (!Number.isFinite(number) || Math.abs(number) > HIGHEST_NUMBER))) notes.brokenNumbers.push(method);
      return real.apply(context, numbers);
    };
  }
  return {
    takeNotes() {
      const taken = notes;
      notes = getEmptyNotes();
      return taken;
    },
    stop() {
      delete context.fillText;
      for (const method of NUMBER_METHODS) delete context[method];
    },
  };
}

/** Two looks at each line: once its first things have faded in, and near its end, where a later label shows. */
export function getCheckTimes({ moments, duration }) {
  const starts = Object.values(moments).sort((first, second) => first - second);
  const times = starts.flatMap((start, index) => {
    const gap = (starts[index + 1] ?? duration) - start;
    return [start + Math.min(1.3, gap * 0.5), start + gap * 0.85];
  });
  return [...new Set(times.map((seconds) => Number(Math.min(seconds, duration - 0.05).toFixed(2))))];
}
