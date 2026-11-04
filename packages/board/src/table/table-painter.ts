/// <reference lib="dom" />
import type { Table } from '@astra/contracts';
import { type BlockPainter, getPartBoxes, makeTextElement, paintSteps } from '../block/block-steps.ts';

const BREAKS_WORDS = 'board-table-breaks-words';

function makeHeader(columns: readonly string[]): HTMLTableSectionElement {
  const head = document.createElement('thead');
  const row = document.createElement('tr');
  for (const column of columns) {
    const cell = makeTextElement('th', 'board-table-cell', column);
    cell.scope = 'col';
    row.append(cell);
  }
  head.append(row);
  return head;
}

export function createTablePainter(root: HTMLElement, { columns, rows }: Pick<Table, 'columns' | 'rows'>): BlockPainter {
  const table = document.createElement('table');
  table.className = 'board-table';
  const body = document.createElement('tbody');
  const parts = new Map<string, Element>();
  const rowElements = rows.map((cells, rowIndex) => {
    const row = document.createElement('tr');
    parts.set(`row-${rowIndex + 1}`, row);
    cells.forEach((text, columnIndex) => {
      const cell = makeTextElement('td', 'board-table-cell', text);
      parts.set(`cell-${rowIndex + 1}-${columnIndex + 1}`, cell);
      row.append(cell);
    });
    return row;
  });
  body.append(...rowElements);
  const head = makeHeader(columns);
  [...(head.rows[0]?.cells ?? [])].forEach((cell, index) => parts.set(`column-${index + 1}`, cell));
  table.append(head, body);
  root.append(table);
  let fittedWidth = 0;
  return {
    stepCount: rows.length,
    fitTo(maxWidth) {
      if (maxWidth === fittedWidth) return;
      fittedWidth = maxWidth;
      table.classList.remove(BREAKS_WORDS);
      if (table.offsetWidth > maxWidth) table.classList.add(BREAKS_WORDS);
    },
    paint: (reached, isReducedMotion) => paintSteps(rowElements, reached, isReducedMotion),
    getTermBoxes: (query) => getPartBoxes(root, parts, query),
    getTextPx: () => Number.parseFloat(getComputedStyle(table).fontSize),
    remove: () => table.remove(),
  };
}
