/// <reference lib="dom" />
type StyleName = 'visibility' | 'clipPath' | 'opacity' | 'transform' | 'display' | 'transformOrigin' | 'maxWidth' | 'width' | 'height';

const written = new WeakMap<HTMLElement | SVGElement, Map<StyleName, string>>();

/** Writes a style only when it changes, so a board at rest writes nothing. It keeps its own copy, because a browser reads back a different spelling of what it was given. */
export function writeStyle(element: HTMLElement | SVGElement, name: StyleName, value: string): void {
  const styles = written.get(element) ?? new Map<StyleName, string>();
  if ((styles.get(name) ?? '') === value) return;
  styles.set(name, value);
  written.set(element, styles);
  element.style[name] = value;
}
