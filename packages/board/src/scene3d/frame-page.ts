import { guardLoops } from './guard-loops.ts';

export const KIT_FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

// The labels' colours for each theme come from `THEME_CSS` in studio.js, which the scene's build adds.
const FRAME_CSS = `
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Barlow,system-ui,sans-serif}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#o{position:absolute;inset:0;pointer-events:none;overflow:hidden;color:#FFFBF5}
.leaders{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.leaders line{stroke:#FFFBF5;stroke-width:1;opacity:0}
.leaders circle{fill:#FFFBF5;opacity:0}
.lbl{position:absolute;left:0;top:0;opacity:0;white-space:nowrap;padding:5px 9px 6px;background:rgba(6,6,8,.62);border-left:1px solid rgba(255,251,245,.8);will-change:transform}
.lbl-main{font-size:12px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;line-height:1.25}
.lbl-sub{font-size:13px;font-weight:400;color:#D8D0C2;line-height:1.3;margin-top:2px}
.lbl.big .lbl-main{font-size:15px}
.ttl{position:absolute;opacity:0}
.ttl.lower{left:28px;bottom:26px;max-width:62%}
.ttl.upper{left:28px;top:24px;max-width:62%}
.ttl.corner{right:18px;bottom:14px}
.ttl-main{font-size:24px;font-weight:600;line-height:1.15;letter-spacing:-.005em}
.ttl-sub{font-size:14px;color:#D8D0C2;margin-top:4px;line-height:1.3}
.ttl.corner .ttl-main{font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#A79F92}
.inset-frame{position:absolute;border:1px solid rgba(255,251,245,.55);opacity:0;box-sizing:border-box}
.inset-cap{position:absolute;left:0;top:-1px;transform:translateY(-100%);font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;padding-bottom:4px;white-space:nowrap}
`;

/** Text inside a script tag cannot end the tag or open an HTML comment. */
const toScriptText = (source: string) => source.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

export interface KitFramePageInput {
  /** The built kit, the text of `apps/web/public/scene-kit/<version>/kit.js`. */
  kitBundle: string;
  /** A scene's `scene.js`, which declares `function scene(kit)`. */
  code: string;
  /** `@font-face` rules with data: URLs, because the page can fetch nothing. Empty falls back to a system font. */
  fontCss?: string;
}

/** The whole sandboxed page for one scene, set as the `srcdoc` of an `<iframe sandbox="allow-scripts">`. A random name holds the guard, so a scene cannot shadow it. Throws on a syntax error. */
export function buildKitFramePage({ kitBundle, code, fontCss = '' }: KitFramePageInput): string {
  const guardName = `__guard${crypto.randomUUID().replaceAll('-', '')}`;
  const scene = `window.__scene=(function(${guardName}){${toScriptText(guardLoops(code, guardName))}\n;return typeof scene==='function'?scene:null;})(window.__guard);`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${KIT_FRAME_CSP}"><style>${fontCss}${FRAME_CSS}</style></head><body><canvas id="c"></canvas><div id="o"></div><script>${toScriptText(kitBundle)}</script><script>${scene}</script></body></html>`;
}
