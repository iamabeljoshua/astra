export const say = (id: string, text: string, more: object = {}) => ({ kind: 'text', id, text, ...more });
export const math = (id: string, tex: string) => ({ kind: 'writeMath', id, tex });
export const morph = (target: string, tex: string) => ({ kind: 'transformMath', target, tex });
export const ring = (id: string, target: string, tex?: string) => ({ kind: 'highlight', id, target, ...(tex === undefined ? {} : { tex }) });
export const note = (id: string, target: string, mark: string, label?: string) => ({ kind: 'annotate', id, target, mark, ...(label === undefined ? {} : { label }) });
export const plot = (id: string, expression: string, domain: [number, number], more: object = {}) => ({ kind: 'plot', id, expression, domain, ...more });
export const markAt = (id: string, target: string, at: number, label?: string) => ({ kind: 'markValue', id, target, at, ...(label === undefined ? {} : { label }) });
export const shade = (id: string, target: string, from: number, to: number, label?: string) => ({ kind: 'shadeArea', id, target, from, to, ...(label === undefined ? {} : { label }) });
export const table = (id: string, columns: readonly string[], rows: readonly (readonly string[])[], more: object = {}) => ({ kind: 'table', id, columns, rows, ...more });
export const timeline = (id: string, events: readonly (readonly [string, string])[], more: object = {}) => ({ kind: 'timeline', id, events: events.map(([when, label]) => ({ when, label })), ...more });
export const code = (id: string, language: string, source: string, more: object = {}) => ({ kind: 'code', id, language, source, ...more });
export const picture = (id: string, asset: string, alt: string) => ({ kind: 'image', id, asset, alt });
export const drawing = (id: string, name: string, labels: readonly (readonly [string, string])[] = []) => ({ kind: 'drawing', id, name, labels: labels.map(([part, text]) => ({ part, text })) });
export const reveal = (target: string, upTo: number) => ({ kind: 'reveal', target, upTo });
export const hide = (target: string) => ({ kind: 'hide', target });
export const focus = (target: string) => ({ kind: 'focus', target });
export const clear = () => ({ kind: 'clearBoard' });

export function diagram(id: string, nodes: readonly (readonly [string, string])[], edges: readonly (readonly [string, string, string?])[], more: object = {}) {
  return { kind: 'diagram', id, nodes: nodes.map(([name, label]) => ({ name, label })), edges: edges.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) })), handwritten: false, ...more };
}

export const flight = (id: string, parameters: { horizontalSpeed: number; upwardSpeed: number; releaseHeight: number; gravity: number }, over?: string) => ({ kind: 'simulate', id, simulation: { model: 'projectile', parameters }, ...(over ? { over } : {}) });
export const SHOT = { horizontalSpeed: 4.2, upwardSpeed: 5.6, releaseHeight: 2.2, gravity: 9.8 };
export const sketch = (id: string) => ({ kind: 'sketch', id });
export const pen = (id: string, target: string, fields: object) => ({ kind: 'drawShape', id, target, ...fields });
export const move = (target: string, fields: object) => ({ kind: 'animate', target, ...fields });
