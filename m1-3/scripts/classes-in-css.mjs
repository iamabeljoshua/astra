// Usage: node classes-in-css.mjs <dist dir>. Reports which probed classes the production CSS holds.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const dist = process.argv[2];
const cssFile = readdirSync(join(dist, 'assets')).find((name) => name.endsWith('.css'));
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8');
const CLASSES = process.env.CLASSES.split(' ');
const escapeForCss = (name) => name.replace(/[[\]()#%:,/.]/g, '\\$&');
const escapeForRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasSelector = (name) => new RegExp(`\\.${escapeForRegex(escapeForCss(name))}(?![a-zA-Z0-9_\\\\-])`).test(css);
const generated = CLASSES.filter(hasSelector);
const missing = CLASSES.filter((name) => !generated.includes(name));
console.log(`css file ${cssFile}, ${css.length} bytes`);
console.log(`generated: ${generated.join(' ') || 'none'}`);
console.log(`nothing: ${missing.join(' ') || 'none'}`);
console.log(`--shadow- vars: ${(css.match(/--shadow-[a-z0-9]+:/g) ?? []).length}, --drop-shadow- vars: ${(css.match(/--drop-shadow-[a-z0-9]+:/g) ?? []).length}, --radius- vars: ${(css.match(/--radius-[a-z0-9]+:/g) ?? []).length}`);
