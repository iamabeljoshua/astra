import { guardLoops } from './guard-loops.ts';

/** `connect-src` and the rest stop what a page can fetch. `webrtc` stops the one way out they do not cover. */
export const KIT_FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; webrtc 'block'";

const FRAME_CSS = `
:root{--plate:#0E0D0B;--label-ink:#FFFBF5;--label-ink-2:#A79F92;--label-line:#2B2823}
:root[data-theme=light]{--plate:#EFE8DA;--label-ink:#1B1815;--label-ink-2:#5F574C;--label-line:#CFC6B5}
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Barlow,system-ui,sans-serif}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#o{position:absolute;inset:0;pointer-events:none;overflow:hidden;color:var(--label-ink)}
.leaders{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.leaders line{stroke:#FFFBF5;stroke-width:1;opacity:0}
.leaders circle{fill:#FFFBF5;opacity:0}
.lbl{position:absolute;left:0;top:0;opacity:0;white-space:nowrap;padding:5px 9px 6px;background:var(--plate);border:1px solid var(--label-line);will-change:transform}
.lbl-main{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;line-height:1.25}
.lbl-sub{font-size:13px;font-weight:400;color:var(--label-ink-2);line-height:1.3;margin-top:2px}
.lbl.big .lbl-main{font-size:15px}
.ttl{position:absolute;opacity:0;background:var(--plate);border:1px solid var(--label-line);padding:6px 10px}
.ttl.lower{left:28px;bottom:26px;max-width:62%}
.ttl.upper{left:28px;top:24px;max-width:62%}
.ttl.corner{right:18px;bottom:14px}
.ttl-main{font-size:24px;font-weight:600;line-height:1.15;letter-spacing:-.005em}
.ttl-sub{font-size:14px;color:var(--label-ink-2);margin-top:4px;line-height:1.3}
.ttl.corner .ttl-main{font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--label-ink-2)}
.inset-frame{position:absolute;border:1px solid var(--label-line);opacity:0;box-sizing:border-box}
.inset-cap{position:absolute;left:0;top:-1px;transform:translateY(-100%);font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;padding-bottom:4px;white-space:nowrap}
`;

/** Text inside a script tag cannot end the tag or open an HTML comment. */
const toScriptText = (source: string) => source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

function getGuardName(): string {
  return `__guard${crypto.randomUUID().replaceAll('-', '')}`;
}

export interface KitFramePageInput {
  /** The built kit, from `getKitBundlePath` in Node or `/scene-kit/<version>/kit.js` in a browser. */
  kitBundle: string;
  /** A scene's `scene.js`, which declares `function scene(kit)`. */
  code: string;
  /** `@font-face` rules with data: URLs, because the page can fetch nothing. Empty falls back to a system font. */
  fontCss?: string;
}

/** The whole sandboxed page for one scene, set as the `srcdoc` of an `<iframe sandbox="allow-scripts">`. A random name holds the guard, so a scene cannot shadow it. Throws on a syntax error. */
export function buildKitFramePage({ kitBundle, code, fontCss = '' }: KitFramePageInput): string {
  const guardName = getGuardName();
  const scene = `window.__scene=(function(${guardName}){${toScriptText(guardLoops(code, guardName))}\n;return typeof scene==='function'?scene:null;})(window.__guard);`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${KIT_FRAME_CSP}"><style>${fontCss}${FRAME_CSS}</style></head><body><canvas id="c"></canvas><div id="o"></div><script>${toScriptText(kitBundle)}</script><script>${scene}</script></body></html>`;
}
