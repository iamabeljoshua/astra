import { clear, code, diagram, drawing, hide, markAt, math, note, picture, plot, say, table, timeline } from '../commands.ts';
import type { DeckScene } from '../deck-scene.ts';

const LONG_WORD = 'W'.repeat(80);
const LONGEST_TEXT = 'M'.repeat(400);
const WIDE_SCRIPTS = ['﷽﷽﷽', '𒀱𒀱𒀱𒀱𒀱𒀱', '👩‍👩‍👧‍👦👩‍👩‍👧‍👦👩‍👩‍👧‍👦', 'မင်္ဂလာပါ မင်္ဂလာပါ', 'ﷺﷺﷺ', 'ꦲꦤꦕꦫꦏ ꦢꦠꦱꦮꦭ'];
const MARKUP = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
const ZERO_WIDTH = `a${'​'.repeat(70)}b`;
const widest = (index: number) => `${LONG_WORD.slice(0, 70)}${String(index).padStart(2, '0')}`;

export const HOSTILE_SCENES: readonly DeckScene[] = [
  { name: 'hostile-markup-everywhere', subject: 'hostile', commands: [say('x', MARKUP), table('t', [MARKUP.slice(0, 80), '<b>bold</b>'], [['<a href="https://example.com">link</a>', '<iframe src="https://example.com">']]), timeline('l', [['<i>when</i>', '<svg onload="window.pwned=1">']]), code('c', 'html', `<script>window.pwned=1</script>\n${MARKUP}`), diagram('d', [['a', '<style>*{display:none}</style>']], []), plot('p', 'x', [0, 1], { label: '<b onmouseover="window.pwned=1">label</b>' })] },
  { name: 'hostile-widest-tex', subject: 'hostile', commands: [math('wide', `x = ${Array.from({ length: 50 }, (_, index) => `a_{${index}}`).join(' + ')}`)] },
  { name: 'hostile-marks-on-one-spot', subject: 'hostile', commands: [plot('p', 'x', [0, 10], { label: 'a curve' }), ...['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((name) => markAt(name, 'p', 5, `label number ${name}`))] },
  { name: 'hostile-eighty-wide-letters', subject: 'hostile', commands: [say('w', LONG_WORD), plot('p', 'x', [0, 1], { label: LONG_WORD, xLabel: LONG_WORD, yLabel: LONG_WORD }), note('n', 'w', 'underline', LONG_WORD)] },
  { name: 'hostile-longest-word', subject: 'hostile', commands: [say('w', LONGEST_TEXT), say('w2', LONGEST_TEXT)] },
  { name: 'hostile-widest-table', subject: 'hostile', commands: [table('t', Array.from({ length: 8 }, (_, index) => widest(index)), Array.from({ length: 12 }, () => Array.from({ length: 8 }, (_, index) => widest(index))))], expectedProblems: ['tooSmallToRead'] },
  { name: 'hostile-widest-timeline', subject: 'hostile', commands: [timeline('l', Array.from({ length: 12 }, (_, index) => [widest(index), widest(index + 20)] as const))] },
  { name: 'hostile-widest-diagram', subject: 'hostile', commands: [diagram('d', Array.from({ length: 12 }, (_, index) => [`n${index}`, widest(index)] as const), Array.from({ length: 11 }, (_, index) => [`n${index}`, `n${index + 1}`, widest(index)] as const))] },
  { name: 'hostile-handwritten-diagram', subject: 'hostile', commands: [diagram('d', Array.from({ length: 12 }, (_, index) => [`n${index}`, `Node ${index} with a rather long name`] as const), Array.from({ length: 11 }, (_, index) => [`n${index}`, `n${(index + 5) % 12}`, 'an edge label'] as const), { handwritten: true })] },
  { name: 'hostile-code-one-long-line', subject: 'hostile', commands: [code('c', 'python', 'x'.repeat(2000))] },
  { name: 'hostile-wide-scripts', subject: 'hostile', commands: [...WIDE_SCRIPTS.map((text, index) => say(`s${index}`, text)), table('t', WIDE_SCRIPTS.slice(0, 3), [WIDE_SCRIPTS.slice(3, 6)]), plot('p', 'x', [0, 1], { label: WIDE_SCRIPTS[0], xLabel: WIDE_SCRIPTS[1], yLabel: WIDE_SCRIPTS[2] })] },
  { name: 'hostile-slider-without-constant', subject: 'hostile', commands: [plot('p', 'a*x', [0, 1], { constants: [{ name: 'a', value: 1, min: 0, max: 2 }, { name: 'b', value: 1, min: 0, max: 2 }] }), { kind: 'slider', id: 'dead', target: 'p', constant: 'c', min: 0, max: 1 }, { kind: 'slider', id: 'unused', target: 'p', constant: 'b', min: 0, max: 2 }], expectedProblems: ['sliderWithoutConstant'] },
  { name: 'hostile-file-the-board-lacks', subject: 'hostile', commands: [{ kind: 'image', id: 'gone', fileId: 'no-such-file', alt: 'A worksheet the student uploaded' }, say('after', 'The words stand in for the picture.')], expectedProblems: ['imageMissing'] },
  { name: 'hostile-curve-with-no-values', subject: 'hostile', commands: [plot('p', 'sqrt(-1-x*x)', [-5, 5], { label: 'nothing to draw', xLabel: 'x', yLabel: 'y' }), markAt('m', 'p', 0, 'no point here')], expectedProblems: ['markWithoutTarget'] },
  { name: 'hostile-drawing-long-labels', subject: 'hostile', commands: [drawing('c', 'animal-cell', [['membrane', widest(1)], ['nucleus', widest(2)], ['nucleolus', widest(3)], ['mitochondrion', widest(4)], ['vacuole', widest(5)], ['ribosome', widest(6)], ['membrane', widest(7)], ['nucleus', widest(8)], ['nucleolus', widest(9)], ['mitochondrion', widest(10)], ['vacuole', widest(11)], ['ribosome', widest(12)]])] },
  { name: 'hostile-mark-on-a-missing-part', subject: 'hostile', commands: [table('t', ['A'], [['1']]), note('n', 't.row-9', 'circle', 'nowhere'), code('c', 'text', 'one'), note('n2', 'c.line-5', 'cross', 'nowhere'), drawing('d', 'atom'), note('n3', 'd.not-a-part', 'check', 'nowhere')], expectedProblems: ['markWithoutTarget'] },
  { name: 'hostile-marks-on-wide-things', subject: 'hostile', commands: [table('t', ['Column one', 'Column two', 'Column three'], [['A rather long cell that takes the whole width of the board', 'Another long cell that takes more of the width', 'And one more']]), note('tick', 't', 'check', 'correct'), note('cross', 't', 'cross', 'wrong'), note('under', 't', 'underline', 'read this'), note('round', 't', 'circle', 'all of it')] },
  { name: 'hostile-mixed-directions', subject: 'hostile', commands: [say('s', 'The word مرحبا means hello, and שלום means peace, 123 ٤٥٦.'), table('t', ['English عربي', 'עברית English'], [['abc مرحبا def', 'אבג def שלום']]), timeline('l', [['١٩٤٨', 'سنة التأسيس and more English words']])] },
  { name: 'hostile-zero-width', subject: 'hostile', commands: [say('z', ZERO_WIDTH), table('t', [ZERO_WIDTH], [[ZERO_WIDTH]]), plot('p', 'x', [0, 1], { label: ZERO_WIDTH })] },
  { name: 'hostile-many-at-once', subject: 'hostile', commands: [...Array.from({ length: 20 }, (_, index) => say(`w${index}`, `Line ${index}, which is here to fill the board and see what leaves.`)), table('t', ['Last'], [['Still on the board']])] },
  { name: 'hostile-replaced-while-arriving', subject: 'hostile', commands: [table('same', ['First'], [['1']]), table('same', ['Second', 'Wider'], [['1', '2']]), table('same', ['Third', 'Wider', 'Widest'], [['1', '2', '3']]), code('same-code', 'text', 'a'), code('same-code', 'text', 'a\nb\nc')] },
  { name: 'hostile-strobe-picture', subject: 'hostile', msBetweenCommands: 120, commands: Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? picture('flash', 'whole-earth', 'The whole Earth') : clear())) },
  { name: 'hostile-strobe-table', subject: 'hostile', msBetweenCommands: 90, commands: Array.from({ length: 16 }, (_, index) => (index % 2 === 0 ? table('flash', ['One', 'Two', 'Three'], Array.from({ length: 12 }, () => ['A full row', 'of the table', 'in every cell'])) : clear())) },
  { name: 'hostile-strobe-hide', subject: 'hostile', msBetweenCommands: 160, commands: Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? picture('flash', 'school-of-athens', 'The School of Athens') : hide('flash'))) },
];
