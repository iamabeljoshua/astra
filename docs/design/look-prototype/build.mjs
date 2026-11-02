// Packs a shuffled subset of the film's dot layers into the prototype page.
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FILM = "/Users/abel/startup/content-videos/made-of-dots";
const COUNT = 64000;
const HELIX_TILT = 0.38;
const HELIX_RADIUS = 0.15;
const ATHENS_FLOOR = -0.31;
const RADIUS_UNIT = 0.008;
const PICKS = ["athens", "vitruvian", "wave", "helix"];

const meta = JSON.parse(fs.readFileSync(`${FILM}/src/data/dots-landscape.json`, "utf8"));
const posBytes = fs.readFileSync(`${FILM}/public/dots/landscape.pos.bin`);
const colBytes = fs.readFileSync(`${FILM}/public/dots/landscape.col.bin`);
const pos = new Float32Array(posBytes.buffer, posBytes.byteOffset, posBytes.length / 4);
const total = meta.N;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const out = list.slice();
  for (let index = out.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// Paper is the highlight, so light areas lose their dots and dark areas print heavier.
function getInkRadius({ layerInfo, spacing, level }) {
  if (layerInfo.kind === "helix") return 0.0026;
  return spacing * (0.03 + 0.6 * Math.pow(1 - level, 1.25));
}

function packLayer(id, seed) {
  const k = meta.layers.findIndex((layer) => layer.id === id);
  const layerInfo = meta.layers[k];
  const random = seededRandom(seed);
  const lit = [];
  for (let index = 0; index < total; index++) {
    const base = (k * total + index) * 4;
    if (colBytes[base + 3] === 0) continue;
    if (id === "athens" && pos[base + 1] < ATHENS_FLOOR) continue;
    if (id === "helix" && Math.hypot(pos[base + 1], pos[base + 2]) > HELIX_RADIUS) continue;
    lit.push(index);
  }
  const tilt = id === "helix" ? HELIX_TILT : 0;
  const chosen = shuffled(lit, random).slice(0, COUNT);
  const getLuminance = (base) => (0.2126 * colBytes[base] + 0.7152 * colBytes[base + 1] + 0.0722 * colBytes[base + 2]) / 255;
  const sorted = chosen.map((index) => getLuminance((k * total + index) * 4)).sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.04)];
  const high = sorted[Math.floor(sorted.length * 0.96)];
  const sizeUp = Math.sqrt(Math.max(lit.length, COUNT) / COUNT);
  const spacing = (layerInfo.spacing || 0.005) * sizeUp;
  const out = Buffer.alloc(COUNT * 12);
  const view = new DataView(out.buffer, out.byteOffset, out.length);
  const slots = shuffled([...Array(COUNT).keys()], random);
  let halfWidth = 0;
  let halfHeight = 0;

  slots.forEach((slot, order) => {
    const at = slot * 12;
    if (order >= chosen.length) return;
    const index = chosen[order];
    const base = (k * total + index) * 4;
    const [x, rawY, z, radius] = [pos[base], pos[base + 1], pos[base + 2], pos[base + 3]];
    const y = rawY - (0.5 + ATHENS_FLOOR) / 2 * (id === "athens" ? 1 : 0);
    halfWidth = Math.max(halfWidth, Math.abs(Math.cos(tilt) * x - Math.sin(tilt) * y));
    halfHeight = Math.max(halfHeight, Math.abs(Math.sin(tilt) * x + Math.cos(tilt) * y));
    const [red, green, blue] = [colBytes[base], colBytes[base + 1], colBytes[base + 2]];
    const level = Math.max(0, Math.min(1, (getLuminance(base) - low) / Math.max(high - low, 0.001)));
    view.setInt16(at, Math.round((x / 2) * 32767), true);
    view.setInt16(at + 2, Math.round((y / 2) * 32767), true);
    view.setInt16(at + 4, Math.round((z / 2) * 32767), true);
    out[at + 6] = clampByte(((radius * sizeUp) / RADIUS_UNIT) * 255);
    out[at + 7] = clampByte((getInkRadius({ layerInfo, spacing, level }) / RADIUS_UNIT) * 255);
    out[at + 8] = red;
    out[at + 9] = green;
    out[at + 10] = blue;
    out[at + 11] = clampByte(255 * (layerInfo.kind === "helix" ? 0.4 : 0.46 + 0.48 * level));
  });
  return { buffer: out, info: { hw: +halfWidth.toFixed(3), hh: +halfHeight.toFixed(3), lit: lit.length, tilt } };
}

const packed = PICKS.map((id, index) => packLayer(id, 100 + index));
const layers = Object.fromEntries(PICKS.map((id, index) => [id, packed[index].info]));
const data = Buffer.concat(packed.map((layer) => layer.buffer));
const page = fs
  .readFileSync(`${HERE}/src.html`, "utf8")
  .replace("__DOTS__", data.toString("base64"))
  .replace("__META__", JSON.stringify({ n: COUNT, layers }));
fs.writeFileSync(`${HERE}/astra-look.html`, page);
console.log(JSON.stringify(layers));
console.log("data MB", (data.length / 1e6).toFixed(2), "page MB", (page.length / 1e6).toFixed(2));
