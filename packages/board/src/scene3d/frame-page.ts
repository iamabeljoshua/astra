import { selfContainedFrameHost } from './frame-host.ts';
import type { KitFont } from './protocol.ts';

const getFrameCsp = (nonce: string) => `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; font-src data:; img-src 'none'; media-src 'none'; connect-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`;

const THEME_CSS = `
:root{--hud:rgba(6,6,8,.78);--hud-ink:#FFFBF5;--hud-ink2:#A79F92;--hud-line:#2B2823;--hud-accent:#FFCC94;--leader:#FFFBF5}
:root[data-theme=light]{--hud:rgba(246,241,230,.92);--hud-ink:#1B1815;--hud-ink2:#5F574C;--hud-line:#CFC6B5;--hud-accent:#B4561E}
:root[data-canvas=light]{--leader:#1B1815}
.lbl{background:var(--hud);color:var(--hud-ink);border-left:1px solid var(--hud-ink)}
.lbl-sub{color:var(--hud-ink2)}
.leaders line{stroke:var(--leader)}
.leaders circle{fill:var(--leader)}
.ttl{color:var(--hud-ink)}
.ttl.corner,.ttl.lower,.ttl.upper{background:var(--hud);padding:4px 8px}
.ttl-sub,.ttl.corner .ttl-main{color:var(--hud-ink2)}
.inset-frame{border-color:var(--hud-ink)}
.inset-cap{color:var(--hud-ink)}
.hud{position:absolute;left:0;top:0;opacity:0;box-sizing:border-box;background:var(--hud);border:1px solid var(--hud-line);color:var(--hud-ink);transform-origin:top right;font-family:Barlow,system-ui,sans-serif}
.hud svg{display:block;width:100%;height:100%}
.hud .t-label{font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;fill:var(--hud-ink2)}
.hud .t-tick{font-size:12px;font-weight:500;fill:var(--hud-ink2)}
.hud .t-big{font-size:32px;font-weight:600;fill:var(--hud-ink)}
.hud .t-unit{font-size:12px;font-weight:500;fill:var(--hud-ink2);letter-spacing:.04em}
.hud .t-sub{font-size:13px;font-weight:500;fill:var(--hud-ink)}
.hud .t-mark{font-size:11px;font-weight:600;fill:var(--hud-accent)}
.hud .s-arc{fill:none;stroke:var(--hud-line);stroke-width:2}
.hud .s-tick{stroke:var(--hud-ink2);stroke-width:1.4}
.hud .s-minor{stroke:var(--hud-line);stroke-width:1}
.hud .s-needle{stroke:var(--hud-ink);stroke-width:3;stroke-linecap:round}
.hud .s-hub{fill:var(--hud-ink)}
.hud .s-mark{stroke:var(--hud-accent);stroke-width:3}
.hud .s-fill{fill:none;stroke:var(--hud-accent);stroke-width:4}
.hud-read{padding:6px 10px 7px}
.hud-read .k{font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--hud-ink2);line-height:1.2}
.hud-read .v{font-size:18px;font-weight:600;line-height:1.25;white-space:nowrap}
`;

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

const getFontCss = (fonts: KitFont[]) => fonts.map(({ weight, url }) => `@font-face{font-family:Barlow;font-weight:${weight};font-display:block;src:url(${url}) format('woff2');}`).join('');

/** JSON with no `<` in it cannot end the script tag that holds it, whatever a scene writes. */
const toFrameData = (data: unknown) => JSON.stringify(data).replaceAll('<', '\\u003c');

export interface KitFramePageInput {
  kitBundle: string;
  code: string;
  fonts?: KitFont[];
}

/** The whole sandboxed page for one scene, set as the `srcdoc` of an `<iframe sandbox="allow-scripts">`. Scene code runs in a worker this page starts, and never in the page. */
export function buildKitFramePage({ kitBundle, code, fonts = [] }: KitFramePageInput): string {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const source = `${kitBundle}\n;self.__scene=(function(){${code}\n;return typeof scene==='function'?scene:null;})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${getFrameCsp(nonce)}"><style>${getFontCss(fonts)}${FRAME_CSS}${THEME_CSS}</style></head><body><canvas id="c"></canvas><div id="o"></div><script type="application/json" id="frame-data">${toFrameData({ source, fonts })}</script><script nonce="${nonce}">(${selfContainedFrameHost.toString()})()</script></body></html>`;
}
