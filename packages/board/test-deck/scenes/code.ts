import { code, diagram, note, plot, reveal, say, table } from '../commands.ts';
import type { DeckScene } from '../deck-scene.ts';

const FORTY_LINES = Array.from({ length: 40 }, (_, index) => `line_${index + 1} = compute(${index + 1})`).join('\n');

export const CODE_SCENES: readonly DeckScene[] = [
  { name: 'code-long-line', subject: 'code', commands: [say('title', 'A long line wraps'), code('long', 'python', 'total_price_after_discount_and_shipping = calculate_total_price(items_in_the_shopping_cart, discount_code_from_the_customer, shipping_address_of_the_customer)\nprint(total_price_after_discount_and_shipping)')] },
  { name: 'code-python-function', subject: 'code', commands: [say('title', 'A function that adds tax'), code('tax', 'python', 'def add_tax(price, rate=0.2):\n    """Return the price with tax."""\n    tax = price * rate\n    return price + tax\n\nprint(add_tax(100))'), note('body', 'tax.line-3', 'underline', 'the tax is worked out here')] },
  { name: 'code-javascript-markup', subject: 'code', commands: [code('page', 'javascript', 'const html = `<div class="card" onclick="alert(1)">${name}</div>`;\ndocument.body.innerHTML = html;\n// <script>alert("not on this board")</script>'), say('warn', 'This code is shown as words, and none of it runs.')] },
  { name: 'code-lines-in-steps', subject: 'code', commands: [code('loop', 'python', 'for number in range(3):\n    square = number * number\n    print(square)', { startsEmpty: true }), reveal('loop', 1), reveal('loop', 2), reveal('loop', 3)] },
  { name: 'code-rust-tabs', subject: 'code', commands: [code('rust', 'rust', 'fn main() {\n\tlet numbers = vec![1, 2, 3];\n\tfor n in &numbers {\n\t\tprintln!("{}", n * 2);\n\t}\n}')] },
  { name: 'code-sql-and-result', subject: 'code', commands: [code('query', 'sql', "SELECT name, COUNT(*) AS orders\nFROM customers JOIN orders USING (customer_id)\nWHERE created_at > '2026-01-01'\nGROUP BY name ORDER BY orders DESC LIMIT 3;"), table('result', ['name', 'orders'], [['Ada', '12'], ['Grace', '9'], ['Katherine', '7']])] },
  { name: 'code-latex-source', subject: 'code', commands: [say('title', 'Backslashes belong in code'), code('tex', 'latex', String.raw`\documentclass{article}
\begin{document}
$\frac{1}{2} + \sqrt{x}$
\end{document}`)] },
  { name: 'code-unicode-strings', subject: 'code', commands: [code('hello', 'python', 'greetings = {\n    "ar": "مرحبا بالعالم",\n    "hi": "नमस्ते दुनिया",\n    "ja": "こんにちは世界",\n    "emoji": "👋🌍",\n}\nfor code, words in greetings.items():\n    print(code, words)')] },
  { name: 'code-flow-diagram', subject: 'code', commands: [diagram('flow', [['start', 'Read a number'], ['even', 'Is it even?'], ['halve', 'Halve it'], ['triple', 'Triple it, add 1'], ['done', 'Print it']], [['start', 'even'], ['even', 'halve', 'yes'], ['even', 'triple', 'no'], ['halve', 'done'], ['triple', 'done']])] },
  { name: 'code-big-o-plot', subject: 'code', commands: [plot('steps', 'x^2', [0, 20], { label: 'n squared', xLabel: 'items', yLabel: 'steps', yRange: [0, 100] }), plot('line', 'x', [0, 20], { label: 'n', over: 'steps' }), plot('log', 'log(x+1)', [0, 20], { label: 'log n', over: 'steps' }), code('sort', 'text', 'bubble sort: n squared\nbinary search: log n')] },
  { name: 'code-forty-lines', subject: 'code', commands: [code('long', 'python', FORTY_LINES)] },
  { name: 'code-empty-lines', subject: 'code', commands: [code('spaced', 'c', '#include <stdio.h>\n\n\nint main(void) {\n\n    return 0;\n\n}\n')] },
];
