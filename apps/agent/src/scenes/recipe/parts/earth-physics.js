PART('volcano', {
  doc: 'A real stratovolcano with the near right quarter cut away: layered ash and lava in the cone, bent rock strata below, a magma chamber deep in the crust, one central vent up to the crater. Lava is the only glowing thing. Magma only ever moves upward through the vent, and lava only runs downhill on the true slope.',
  args: 'none',
  stage: 'studio',
  anchors: ['chamber', 'vent', 'crater', 'lava', 'ash', 'slope'],
  motions: { rise: 'magma climbs from the chamber up the vent, over about 3 s', erupt: 'a lava fountain at the crater, lava running down the slope, a dark ash plume rising' },
  views: { front: [36, 13], left: [-20, 16], right: [62, 12], close: [36, 8] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const g = P.group(P.root, [0, -0.6, 0]);
    const B = 3.2, YB = -2.7;
    const prof = (r) => { if (r < 0.24) return 1.95 - 0.34 * (1 - (r / 0.24) ** 2); const s = (r - 0.24) / 2.96; return 1.95 * (0.62 * Math.exp(-3.4 * s) + 0.38 * (1 - s)) * (1 - 0.02 * s); };
    const h = (x, z) => { const r = Math.hypot(x, z), cx = x / (r + 1e-5), cz = z / (r + 1e-5), w = sm(0.3, 0.9, r); const ridge = (fbm(cx * 3 + 5 + r * 0.5, cz * 3 + r * 0.7, 3) - 0.5) * 0.34 * w * (1 - 0.6 * sm(2, 3.2, r)); const gully = Math.abs(Math.sin(Math.atan2(cz, cx) * 11 + fbm(cx * 2 + 9, cz * 2, 2) * 7)) * 0.05 * w; return Math.max(prof(r), 0) + ridge - gully + (fbm(x * 5, z * 5, 4) - 0.5) * 0.09 * sm(0.28, 0.6, r); };
    const col = (x, y, z) => { const r = Math.hypot(x, z), n = fbm(x * 3 + 2, z * 3, 3), m = fbm(x * 11, z * 11, 2); const forest = mix3(rgb('#232f1e'), rgb('#3a4427'), m), rock = mix3(rgb('#4a433d'), rgb('#6d6054'), m), ash = mix3(rgb('#232120'), rgb('#3b3633'), m); let c = mix3(forest, rock, sm(0.18 + n * 0.25, 0.65 + n * 0.3, y)); c = mix3(c, ash, sm(0.95 + n * 0.3, 1.45, y)); const old = sm(0.52, 0.6, fbm(Math.atan2(z, x) * 5 + 40, r * 0.8, 3)); return mix3(c, mix3(c, rgb('#1d1a19'), 0.7), old * sm(0.5, 1, r)); };
    land(-B, B, -2.6, 2.6, 128, 104, h, col, (x, z) => !(x > 0 && z > 0), g);
    // The rock of the cut, addressed by distance from the axis and height.
    const faceTex = (() => { const bands = ['#5a4a38', '#8a6f52', '#6d5a48', '#9a8162', '#5c5046', '#7e6a55', '#4c4640'].map(rgb), basalt = rgb('#3a3633'), tan = rgb('#83715c'), bake = rgb('#4a2418'); return tex(720, 720, (u, v) => { const r = u * B, y = YB + v * 5; const n = fbm(r * 2.2, y * 2.2, 3), f = fbm(r * 18, y * 18, 2); const bend = 0.34 * Math.exp(-((r / 1.5) ** 2)); let c; if (y > 0.04 + (n - 0.5) * 0.08) { const d = prof(r) - y, b = 0.5 + 0.5 * Math.sin(d * 34 + (n - 0.5) * 6); c = mix3(basalt, tan, sm(0.25, 0.75, b) * 0.85); } else { const yy = y - bend + (n - 0.5) * 0.14; if (yy > -1.25) { const q = clamp(-yy / 1.25) * 6.99; const i = Math.floor(q); c = mix3(bands[i], bands[Math.min(6, i + 1)], sm(0.72, 1, q - i)); const lam = 0.5 + 0.5 * Math.sin(yy * 95 + n * 4); c = mix3(c, mix3(c, [0, 0, 0], 0.22), lam * 0.5); } else { const g2 = fbm(r * 26, y * 26, 2); c = mix3(rgb('#3d3835'), rgb('#6a625c'), sm(0.32, 0.68, g2)); } } c = mix3(c, mix3(c, [0, 0, 0], 0.5), Math.abs(f - 0.5) * 0.6); const e = Math.hypot(r / 1.12, (y + 1.72) / 0.5); c = mix3(c, bake, (1 - sm(0.95, 1.5, e)) * 0.85); c = mix3(c, rgb('#241c1a'), (1 - sm(0.07, 0.26, r + (n - 0.5) * 0.08)) * 0.9); return c; }); })();
    const rock = P.mat('rock', '#ffffff', { map: faceTex, side: T.DoubleSide });
    const vOf = (y) => (y - YB) / 5, edge = (a) => 0.72 + 0.28 * (Math.abs(a) / B);
    wall(0, 0, B, 0, 72, h, YB, (x, y) => [x / B, vOf(y)], rock, g);
    wall(0, 2.6, 0, 0, 64, h, YB, (x, y, z) => [z / B, vOf(y)], rock, g);
    wall(-B, 2.6, 0, 2.6, 48, h, YB, (x, y) => [edge(x), vOf(y)], rock, g);
    wall(B, 0, B, -2.6, 40, h, YB, (x, y, z) => [edge(z), vOf(y)], rock, g);
    wall(B, -2.6, -B, -2.6, 48, h, YB, (x, y) => [edge(x), vOf(y)], rock, g);
    wall(-B, -2.6, -B, 2.6, 48, h, YB, (x, y, z) => [edge(z), vOf(y)], rock, g);
    const lt = lavaTex(), lavaM = P.glowMat('#ffffff', 1.65, { map: lt });
    const domeG = new T.SphereGeometry(1, 40, 28);
    const dome = (sx, sy, sz) => { const m = P.add(domeG, lavaM, g, [0, -1.72, 0]); m.scale.set(sx, sy, sz); m.castShadow = false; return m; };
    dome(1.08, 0.44, 0.09); dome(0.09, 0.44, 1.08);
    const ventPts = []; for (let i = 0; i <= 14; i++) { const s = i / 14, y = mix(-1.32, prof(0) + 0.02, s); ventPts.push(new T.Vector3(0.012 + Math.sin(s * 9) * 0.012, y, 0.012 + Math.cos(s * 7) * 0.012)); }
    const ventC = new T.CatmullRomCurve3(ventPts);
    P.add(new T.TubeGeometry(ventC, 40, 0.075, 10), P.mat('rock', '#161413'), g);
    const magmaG = new T.TubeGeometry(ventC, 80, 0.095, 10);
    const lavaUp = lt.clone(); lavaUp.needsUpdate = true; lavaUp.repeat.set(1, 6);
    const magma = P.add(magmaG, P.glowMat('#ffffff', 1.9, { map: lavaUp }), g); magma.castShadow = false;
    const head = P.add(new T.SphereGeometry(0.12, 16, 12), P.glowMat('#ffd27a', 2.2), g); head.castShadow = false;
    const pool = P.add(new T.CircleGeometry(0.2, 32).rotateX(-PI / 2), lavaM, g, [0, prof(0) + 0.05, 0]); pool.castShadow = false;
    const flowsDef = [[106, 2.1, 0.05], [132, 2.5, 0.058], [156, 1.8, 0.044], [-14, 2.2, 0.052], [-40, 1.6, 0.04]];
    const lavaFlow = lt.clone(); lavaFlow.needsUpdate = true; lavaFlow.repeat.set(5, 1);
    const flowM = P.glowMat('#ffffff', 1.5, { map: lavaFlow });
    const flowAt = (d, s) => { const a = ((d[0] + Math.sin(s * 5 + d[0]) * 7 * s) * PI) / 180, r = 0.22 + s * d[1], x = Math.cos(a) * r, z = Math.sin(a) * r; return [x, h(x, z) + 0.012, z]; };
    const flows = flowsDef.map((d) => { const pts = []; for (let i = 0; i <= 40; i++) { const p = flowAt(d, i / 40); pts.push(new T.Vector3(p[0], p[1], p[2])); } const m = P.add(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 90, d[2], 6), flowM, g); m.castShadow = false; return m; });
    const dropG = new T.IcosahedronGeometry(1, 1), dropN = 240, drops = inst(dropG, new T.MeshBasicMaterial({ color: '#ffffff' }), dropN, g);
    const dropInfo = []; for (let i = 0; i < dropN; i++) { const a = hash(i, 1) * TAU, core = i % 5 < 2, sp = (core ? 0.1 : 0.55) * hash(i, 2); dropInfo.push({ vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (core ? 2.2 : 1.3) + hash(i, 3) * 0.95, life: 1.3 + hash(i, 4) * 0.9, ph: hash(i, 5), s: 0.012 + hash(i, 6) * 0.03 }); drops.setColorAt(i, new T.Color(1, 1, 1)); }
    const blobG = new T.SphereGeometry(1, 14, 10); { const p = blobG.attributes.position; for (let i = 0; i < p.count; i++) { const v = new T.Vector3().fromBufferAttribute(p, i), k = 1 + (fbm(v.x * 1.6 + 3, v.y * 1.6 + v.z * 1.3, 3) - 0.5) * 0.55; p.setXYZ(i, v.x * k, v.y * k, v.z * k); } blobG.computeVertexNormals(); }
    const ashN = 170, ash = inst(blobG, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 }), ashN, g);
    for (let i = 0; i < ashN; i++) ash.setColorAt(i, new T.Color(1, 1, 1));
    const col1 = new T.Color();
    P.anchor('chamber', g, [0.66, -1.72, 0.12], 1.5);
    P.anchor('vent', g, [0.07, 0.25, 0.07], 1.1);
    P.anchor('crater', g, [0.02, prof(0.24), 0.02], 0.8);
    const lp = flowAt(flowsDef[1], 0.42); P.anchor('lava', g, lp, 1);
    P.anchor('slope', g, [-1.0, h(-1.0, 1.25), 1.25], 1.1);
    const ashA = P.anchor('ash', g, [0.2, 3.1, 0], 1.7);
    return {
      radius: 3.6,
      update(m, t) {
        const e = m.erupt, rise = Math.max(m.rise.u, clamp(e.u * 5));
        const k = sm(0, 1, rise), idxN = magmaG.index.count, n = Math.floor((k * idxN) / 60) * 60;
        magmaG.setDrawRange(0, n); magma.visible = k > 0.002;
        const hp = ventC.getPointAt(clamp(k)); head.position.copy(hp); head.visible = k > 0.002 && k < 0.995;
        lt.offset.set(t * 0.012, t * 0.02); lavaUp.offset.y = -t * 0.28; lavaFlow.offset.x = -t * 0.05;
        pool.visible = k > 0.97;
        const go = e.tau > 0;
        flows.forEach((f, i) => { const fk = clamp((e.tau - 0.7 - i * 0.5) / (8 + i)), q = 1 - (1 - fk) ** 2, c = Math.floor((q * f.geometry.index.count) / 36) * 36; f.geometry.setDrawRange(0, c); f.visible = go && c > 0; });
        const ramp = clamp(e.tau / 1.6), top = prof(0);
        dropInfo.forEach((d, i) => { const age = fract(d.ph + e.tau / d.life) * d.life; const x = d.vx * age, z = d.vz * age, y = top + 0.06 + d.vy * age * 0.95 - 0.5 * 2.5 * age * age; const live = go && d.ph < ramp * 1.02 && e.tau > 0.05; const ground = Math.hypot(x, z) < 0.24 ? top : h(x, z); const heat = 1 - age / d.life; if (!live || (y < ground && age > 0.15)) { place(drops, i, 0, -40, 0, 0); return; } place(drops, i, x, y, z, d.s * (0.5 + 0.7 * heat)); col1.setRGB(mix(0.9, 3.4, heat), mix(0.08, 1.5, heat * heat), mix(0.01, 0.3, heat * heat)); drops.setColorAt(i, col1); });
        drops.instanceMatrix.needsUpdate = true; if (drops.instanceColor) drops.instanceColor.needsUpdate = true; drops.visible = go;
        const H = 1.85 * sm(0, 1, e.tau / 7) + 0.3;
        for (let i = 0; i < ashN; i++) { const a = fract(hash(i, 7) + e.tau / 9), hh = Math.pow(a, 0.62) * H, wid = 0.07 + 0.2 * hh + 0.07 * hh * hh, ang = i * 2.399 + hh * 0.9, rr = wid * Math.sqrt(hash(i, 8)); const x = Math.cos(ang) * rr + hh * hh * 0.035, z = Math.sin(ang) * rr, y = top + 0.15 + hh; const s = (0.06 + 0.13 * hh * (0.6 + 0.8 * hash(i, 9))) * sm(0, 0.04, a) * (1 - sm(0.93, 1, a)); place(ash, i, x, y, z, go ? s : 0); const warm = 1 - sm(0, 0.8, hh), base = 0.022 + 0.03 * hash(i, 10) + 0.018 * sm(1, 3, hh); col1.setRGB(base + warm * 0.4, base * 0.96 + warm * 0.07, base * 0.92); ash.setColorAt(i, col1); }
        ash.instanceMatrix.needsUpdate = true; if (ash.instanceColor) ash.instanceColor.needsUpdate = true; ash.visible = go;
        ashA.place([0.1 + H * H * 0.015, top + H * 0.72, 0]);
      },
    };
  },
});

PART('tectonicPlates', {
  doc: 'A cut block of Earth: two plates of crust over hot mantle with slow convection. mode converge: the denser ocean plate dives under the continent, with a trench and a mountain chain with a volcano on the upper plate. mode diverge: plates part at a ridge, magma wells up, new crust moves outward. mode slide: plates grind past each other along a fault, and crossing lines bend then snap back. Directions live inside the part and cannot be set wrong. In diverge the trench anchor is the rift valley and mountain the ridge. In slide both are on the fault.',
  args: 'mode: converge|diverge|slide',
  stage: 'studio',
  anchors: ['plateA', 'plateB', 'mantle', 'boundary', 'trench', 'mountain', 'focus'],
  motions: { drift: 'plates move the true way for the mode', quake: 'plates stick, then a sudden slip every 6 s with rings spreading from the focus' },
  views: { front: [22, 20], left: [-30, 20], right: [48, 18], above: [14, 52] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const mode = ['converge', 'diverge', 'slide'].includes(o.mode) ? o.mode : 'converge';
    const g = P.group(P.root, [0, 0.72, 0]), gB = P.group(g);
    const X0 = -3.4, X1 = 3.4, ZN = 1.05, ZF = -1.55, YB = -2.6;
    const mantleT = (() => { const a = rgb('#4a1608'), b = rgb('#c4470f'), c = rgb('#d9661a'); return tex(512, 256, (u, v) => { const n = fbm(u * 9, v * 5, 4), m = fbm(u * 26, v * 14, 2), k = clamp(0.8 - v * 0.9 + (n - 0.5) * 0.75); return mix3(mix3(a, b, sm(0.05, 0.6, k)), c, sm(0.65, 1.05, k + (m - 0.5) * 0.3)); }); })();
    const mantleM = P.glowMat('#ffffff', 0.74, { map: mantleT, side: T.DoubleSide });
    const mu = (a, y) => [(a + 3.4) / 6.8, (y - YB) / 2.6], mTop = () => -0.15;
    wall(X0, ZN - 0.02, X1, ZN - 0.02, 8, mTop, YB, (x, y) => mu(x, y), mantleM, g);
    wall(X1 - 0.02, ZN, X1 - 0.02, ZF, 8, mTop, YB, (x, y, z) => mu(z * 2, y), mantleM, g);
    wall(X0 + 0.02, ZN, X0 + 0.02, ZF, 8, mTop, YB, (x, y, z) => mu(z * 2, y), mantleM, g);
    wall(X0, ZF + 0.02, X1, ZF + 0.02, 8, mTop, YB, (x, y) => mu(x, y), mantleM, g);
    const seaM = P.mat('matte', '#17456c', { roughness: 0.62, transparent: true, opacity: 0.66, side: T.DoubleSide, depthWrite: false });
    const contT = (() => { const d = rgb('#6d5a4d'), s = rgb('#a68d6e'), t = rgb('#857552'); return tex(512, 256, (u, v) => { const n = fbm(u * 8, v * 8, 3), f = fbm(u * 60, v * 40, 2), yy = v + (n - 0.5) * 0.06; let c = mix3(d, s, sm(0.3, 0.8, yy)); const lam = 0.5 + 0.5 * Math.sin(yy * 120); c = mix3(c, t, sm(0.74, 0.8, yy) * lam); return mix3(c, [0, 0, 0], Math.abs(f - 0.5) * 0.55); }); })();
    const contM = P.mat('rock', '#ffffff', { map: contT, side: T.DoubleSide });
    const cu = (x, y) => [(x + 3.4) / 6.8, clamp((y + 1.6) / 2.8)];
    const stripT = (() => { const a = rgb('#23292e'), b = rgb('#454c50'), c = rgb('#6c5c50'); return tex(512, 128, (u, v) => { const n = fbm(u * 8, v * 4, 3, 8), st = 0.5 + 0.5 * Math.sin(u * TAU * 4 + (n - 0.5) * 2); let k = v < 0.2 ? a : mix3(b, c, sm(0.25, 0.95, v)); k = mix3(k, [0, 0, 0], sm(0.5, 0.9, st) * 0.32); return mix3(k, [0, 0, 0], Math.abs(fbm(u * 64, v * 24, 2, 64) - 0.5) * 0.5); }); })();
    const plateM = P.mat('rock', '#ffffff', { map: stripT, side: T.DoubleSide });
    const floorT = (() => { const a = rgb('#20272c'), b = rgb('#3a4347'); return tex(256, 256, (u, v) => { const n = fbm(u * 16, v * 16, 3, 16), st = 0.5 + 0.5 * Math.sin(u * TAU * 4 + (n - 0.5) * 2), fine = 0.5 + 0.5 * Math.sin(u * TAU * 40); return mix3(mix3(a, b, n), [0, 0, 0], sm(0.5, 0.9, st) * 0.45 + fine * 0.08); }); })();
    const floorM = P.mat('rock', '#ffffff', { map: floorT, side: T.DoubleSide });
    const sheet = (xs, top, z0, z1, uf, mat, parent) => { const pos = [], uv = [], idx = []; xs.forEach((x, i) => { const y = top(x), u = uf(x); pos.push(x, y, z0, x, y, z1); uv.push(u, 0, u, 1); if (i < xs.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }); return P.add(buildGeo(pos, uv, idx), mat, parent); };
    const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => mix(a, b, i / n));
    const ringM = () => new T.MeshBasicMaterial({ color: '#dfe9ff', transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    const arcs = [0, 1, 2].map(() => P.add(new T.RingGeometry(0.965, 1, 72, 1, PI, PI), ringM(), g));
    const flats = [0, 1, 2].map(() => P.add(new T.RingGeometry(0.965, 1, 72).rotateX(-PI / 2), ringM(), g));
    [...arcs, ...flats].forEach((r) => { r.castShadow = false; r.receiveShadow = false; r.visible = false; });
    const beadsAt = (cx, cy, a, b, cw, col, parent) => { const pts = []; for (let i = 0; i <= 22; i++) { const q = (i / 22) * TAU * (cw ? -1 : 1); pts.push([cx + Math.cos(q) * a, cy + Math.sin(q) * b, ZN + 0.015]); } return P.beads(pts, { count: 16, speed: 0.035, size: 5, color: col ?? '#ffcc94', intensity: 1.3, parent: parent ?? g }); };
    let focus, epi, setDrift, plateAat, plateBat, boundaryAt, trenchAt, mountainAt;
    if (mode === 'converge') {
      const xT = 0.1, slabTop = (x) => (x <= xT ? -0.42 - 0.2 * sm(-0.9, xT, x) : -0.62 - 0.62 * Math.pow(x - xT, 1.28)), th = 0.36, slabBot = (x) => Math.max(YB, slabTop(x) - th);
      const xs = range(X0, 2.58, 150); let acc = 0; const arc = new Map(); xs.forEach((x, i) => { if (i) acc += Math.hypot(x - xs[i - 1], slabTop(x) - slabTop(xs[i - 1])); arc.set(x, acc); });
      const arcOf = (x) => { const i = Math.round(((x - X0) / (2.58 - X0)) * 150); return arc.get(xs[clamp(i, 0, 150)]); };
      wall(X0, ZN, 2.58, ZN, 150, (x) => slabTop(x), slabBot, (x, y) => [arcOf(x) / 2, clamp((slabTop(x) - y) / th)], plateM, g);
      sheet(xs.filter((x) => x <= 1.1), slabTop, ZN, ZF, (x) => arcOf(x) / 2, floorM, g);
      wall(X0, ZF, 1.0, ZF, 60, (x) => slabTop(x), slabBot, (x, y) => [arcOf(x) / 2, clamp((slabTop(x) - y) / th)], plateM, g);
      const contTop = (x, z) => { const shelf = -0.62 + 0.78 * sm(xT, 0.75, x), cz = 0.75 + 0.5 * fbm(z * 1.6, 3, 3), mt = 0.74 * Math.exp(-(((x - 1.75) / 0.6) ** 2)) * cz, cone = 0.3 * Math.exp(-Math.hypot(x - 1.62, z - ZN + 0.02) / 0.3); return shelf + mt + cone + (fbm(x * 4.5, z * 4.5, 4) - 0.5) * 0.34 * sm(0.75, 1.3, x); };
      const contBot = (x) => Math.max(slabTop(x), -0.95 - 0.38 * Math.exp(-(((x - 1.75) / 0.6) ** 2)));
      land(xT, X1, ZF, ZN, 110, 48, contTop, (x, y, z) => { const m = fbm(x * 13, z * 13, 2), n = fbm(x * 3, z * 3, 2); let c = mix3(rgb('#2d3a24'), rgb('#49512e'), m); if (y < 0.12) c = mix3(rgb('#3c3a30'), c, sm(-0.05, 0.12, y)); c = mix3(c, mix3(rgb('#574c42'), rgb('#7a6c5e'), m), sm(0.35 + n * 0.15, 0.62, y)); return mix3(c, rgb('#a9a8a3'), sm(0.72 + m * 0.1, 0.9 + m * 0.1, y)); }, null, gB);
      wall(xT, ZN, X1, ZN, 110, contTop, contBot, (x, y) => cu(x, y), contM, gB);
      wall(X1, ZN, X1, ZF, 48, contTop, -1, (x, y, z) => cu(z * 1.5 + 2, y), contM, gB);
      wall(xT, ZF, X1, ZF, 100, contTop, contBot, (x, y) => cu(x, y), contM, gB);
      const yS = 0.02, bedAt = (x) => (x < xT ? slabTop(x) : contTop(x, ZN));
      let xc = 0.2; while (contTop(xc, ZN) < yS && xc < 1) xc += 0.005;
      wall(X0, ZN + 0.002, xc, ZN + 0.002, 90, () => yS, bedAt, () => [0, 0], seaM, g);
      P.add(new T.PlaneGeometry(1.2 - X0, ZN - ZF).rotateX(-PI / 2), seaM, g, [(X0 + 1.2) / 2, yS, (ZN + ZF) / 2]).castShadow = false;
      const lt = lavaTex(), melt = []; for (let i = 0; i <= 8; i++) { const s = i / 8; melt.push([mix(1.86, 1.62, s) + Math.sin(s * 8) * 0.04, mix(slabTop(1.86), contTop(1.62, ZN) - 0.02, s), ZN + 0.008]); }
      const mm = P.tubeAlong(melt, 0.022, P.glowMat('#ffffff', 1.5, { map: lt }), gB); mm.castShadow = false;
      P.beads(melt.map((p) => [p[0], p[1], p[2] + 0.012]), { count: 8, speed: 0.1, size: 5, color: '#ffb46a', intensity: 1.6, parent: gB });
      beadsAt(-1.6, -1.55, 1.45, 0.72, true); beadsAt(2.85, -1.2, 0.42, 0.26, false);
      focus = [0.92, slabTop(0.92) + 0.01, ZN + 0.01]; epi = [0.92, 0.2, 0];
      plateAat = [-2.2, -0.6, ZN]; plateBat = [2.7, -0.45, ZN]; boundaryAt = [0.55, slabTop(0.55), ZN]; trenchAt = [xT, -0.6, ZN * 0.5]; mountainAt = [1.62, contTop(1.62, ZN), ZN];
      setDrift = (sl, q) => { stripT.offset.x = -sl / 2; floorT.offset.x = -sl / 2; gB.position.x = -0.09 * (1 - Math.exp(-sl * 0.5)); gB.position.y = -0.035 * q.stuck * sm(0, 0.3, q.tau); };
    } else if (mode === 'diverge') {
      const topD = (d) => -0.55 + 0.55 * Math.exp(-d / 0.95) - 0.1 * Math.exp(-((d / 0.11) ** 2)), thick = (d) => 0.06 + 0.42 * Math.sqrt(d / 3.4), botD = (d) => topD(d) - thick(d);
      const lt = lavaTex(), lavaM = P.glowMat('#ffffff', 1.5, { map: lt, side: T.DoubleSide });
      for (const sgn of [-1, 1]) {
        const a = sgn < 0 ? X0 : 0.05, b = sgn < 0 ? -0.05 : X1, top = (x) => topD(Math.abs(x)), bot = (x) => botD(Math.abs(x));
        wall(a, ZN, b, ZN, 90, top, bot, (x, y) => [Math.abs(x) / 2, clamp((top(x) - y) / 0.5)], plateM, g);
        wall(a, ZF, b, ZF, 60, top, bot, (x, y) => [Math.abs(x) / 2, clamp((top(x) - y) / 0.5)], plateM, g);
        sheet(range(a, b, 90), top, ZN, ZF, (x) => Math.abs(x) / 2, floorM, g);
      }
      wall(-0.85, ZN + 0.004, 0.85, ZN + 0.004, 60, (x) => (Math.abs(x) < 0.05 ? topD(0.05) - 0.015 : botD(Math.abs(x))), (x) => botD(Math.abs(x)) - 0.55 * (1 - Math.abs(x) / 0.85) ** 1.2, (x, y) => [x * 0.5, y * 0.5], lavaM, g).castShadow = false;
      sheet(range(-0.05, 0.05, 2), () => topD(0.05) - 0.012, ZN, ZF, (x) => x, lavaM, g).castShadow = false;
      const yS = 0.3; wall(X0, ZN + 0.002, X1, ZN + 0.002, 120, () => yS, (x) => topD(Math.abs(x)), () => [0, 0], seaM, g);
      P.add(new T.PlaneGeometry(X1 - X0, ZN - ZF).rotateX(-PI / 2), seaM, g, [0, yS, (ZN + ZF) / 2]).castShadow = false;
      beadsAt(-1.6, -1.55, 1.45, 0.72, false); beadsAt(1.6, -1.55, 1.45, 0.72, true);
      P.beads([[0, -2, ZN + 0.02], [0, -1.2, ZN + 0.02], [0, -0.5, ZN + 0.02], [0, topD(0.05) - 0.02, ZN + 0.02]], { count: 12, speed: 0.12, size: 6, color: '#ffc27a', intensity: 1.7, parent: g });
      focus = [0.03, -0.4, ZN + 0.01]; epi = [0, topD(0), 0];
      plateAat = [-2.3, topD(2.3) - 0.12, ZN]; plateBat = [2.3, topD(2.3) - 0.12, ZN]; boundaryAt = [0, -0.35, ZN]; trenchAt = [0, topD(0), 0.1]; mountainAt = [0.32, topD(0.32), 0.1];
      setDrift = (sl) => { stripT.offset.x = -sl / 2; floorT.offset.x = -sl / 2; lt.offset.y = -sl * 0.2; };
    } else {
      const yTop = (x, z) => 0.1 + (fbm(x * 2.5 + 3, z * 2.5, 3) - 0.5) * 0.02, yBot = -0.85;
      const landT = (() => { const a = rgb('#3d3d2b'), b = rgb('#4d4b35'), c = rgb('#c9c3ac'); return tex(256, 512, (u, v) => { const n = fbm(u * 16, v * 32, 4, 16), m = fbm(u * 64, v * 128, 2, 64); let k = mix3(a, b, sm(0.3, 0.7, n)); k = mix3(k, [0, 0, 0], Math.abs(m - 0.5) * 0.4); const line = Math.abs(fract(v * 2) - 0.5); return mix3(k, c, 1 - sm(0.012, 0.022, line)); }); })();
      const landM = P.mat('rock', '#ffffff', { map: landT, side: T.DoubleSide });
      const cols = range(0, 3.4, 40), L = ZN - ZF, surf = [-1, 1].map((sgn) => { const pos = [], uv = [], idx = []; cols.forEach((d, i) => { pos.push(sgn * (d + 0.015), 0.1, ZN, sgn * (d + 0.015), 0.1, ZF); uv.push(d / 3.4, 0, d / 3.4, L / 2.6); if (i < 40) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }); return { sgn, mesh: P.add(buildGeo(pos, uv, idx), landM, g) }; });
      wall(X0, ZN, -0.015, ZN, 40, () => 0.1, yBot, (x, y) => cu(x, y * 0.7 + 0.2), contM, g);
      wall(0.015, ZN, X1, ZN, 40, () => 0.1, yBot, (x, y) => cu(x, y * 0.7 + 0.2), contM, g);
      wall(X1, ZN, X1, ZF, 20, () => 0.1, yBot, (x, y, z) => cu(z * 1.5 + 2, y * 0.7 + 0.2), contM, g);
      wall(X0, ZN, X0, ZF, 20, () => 0.1, yBot, (x, y, z) => cu(z * 1.5 + 2, y * 0.7 + 0.2), contM, g);
      const crack = P.mat('rock', '#0b0a09');
      P.add(new T.BoxGeometry(0.03, 0.95, L), crack, g, [0, -0.375, (ZN + ZF) / 2]);
      beadsAt(-1.6, -1.72, 1.45, 0.6, true); beadsAt(1.6, -1.72, 1.45, 0.6, false);
      focus = [0, -0.5, ZN + 0.01]; epi = [0, 0.12, 0.1];
      plateAat = [-2.2, 0.1, 0]; plateBat = [2.2, 0.1, 0]; boundaryAt = [0, 0.1, ZN]; trenchAt = [0, 0.1, 0]; mountainAt = [0, 0.1, -0.6];
      setDrift = (sl, q, hasQuake) => { const face = hasQuake ? q.faceSlip : sl; surf.forEach(({ sgn, mesh }) => { const uv = mesh.geometry.attributes.uv; cols.forEach((d, i) => { const D = mix(face, sl, sm(0, 1.9, d)) / 2.6; const base = sgn > 0 ? -D : D; uv.setY(i * 2, base); uv.setY(i * 2 + 1, base + L / 2.6); }); uv.needsUpdate = true; }); };
    }
    P.anchor('plateA', g, plateAat, 1.5); P.anchor('plateB', mode === 'converge' ? gB : g, plateBat, 1.5);
    P.anchor('mantle', g, [-1, -1.8, ZN], 1.5); P.anchor('boundary', g, boundaryAt, 1.1); P.anchor('trench', g, trenchAt, 1);
    P.anchor('mountain', mode === 'converge' ? gB : g, mountainAt, 1); P.anchor('focus', g, focus, 0.9);
    const PERIOD = 6, T0 = 4.5, V = mode === 'slide' ? 0.13 : 0.16, JUMP = 0.42;
    return {
      radius: 2.75,
      update(m, t) {
        const q = m.quake, hasQ = q.tau > 0;
        const n = q.tau < T0 ? 0 : 1 + Math.floor((q.tau - T0) / PERIOD), age = q.tau < T0 ? -1 : (q.tau - T0) % PERIOD;
        const stuck = q.tau < T0 ? q.tau / T0 : age / PERIOD;
        const faceT = n ? T0 + (n - 1) * PERIOD : 0;
        const far = V * (m.drift.tau + q.tau);
        const slidePos = mode === 'slide' ? far : V * m.drift.tau + JUMP * n * (1 - 0) + JUMP * sm(0, 0.18, age) * 0;
        setDrift(slidePos, { stuck, tau: q.tau, faceSlip: V * (m.drift.tau + faceT) }, hasQ);
        const shake = age >= 0 ? Math.exp(-age * 2.4) * 0.05 : 0;
        g.position.x = shake * Math.sin(age * 47); g.position.y = 0.72 + shake * Math.cos(age * 39) * 0.7;
        [0, 1, 2].forEach((i) => {
          const a = age - i * 0.35, live = a > 0 && a < 2.4, r = 0.08 + a * 1.25, k = live ? (1 - a / 2.4) ** 1.2 * 0.85 : 0;
          arcs[i].visible = flats[i].visible = live;
          if (!live) return;
          arcs[i].position.set(focus[0], focus[1], ZN + 0.012); arcs[i].scale.setScalar(Math.min(r, 1.6)); arcs[i].material.opacity = k;
          flats[i].position.set(epi[0], epi[1] + 0.02, epi[2]); flats[i].scale.setScalar(r * 1.15); flats[i].material.opacity = k * 0.9 * (1 - sm(0.9, 1.75, r));
        });
      },
    };
  },
});

PART('earthLayers', {
  doc: 'Earth with a wedge cut out toward the viewer, showing crust, mantle, liquid outer core and solid inner core at their true relative thickness, so the crust is a hairline. The surface turns the true way, west to east, while the cut stays open.',
  args: 'none',
  stage: 'space',
  anchors: ['crust', 'mantle', 'outerCore', 'innerCore'],
  motions: { spin: 'the surface turns west to east while the cut stays open' },
  views: { front: [0, 16], left: [-25, 18], right: [25, 18], above: [0, 44] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    kit.sunAt([-260, 220, 520]);
    const R = 2, A = (43 * PI) / 180, id = `${P.id}.body`;
    const earth = P.own(kit.planet({ id, preset: 'earth', radius: R, spin: 0, spinStart: 0, segments: 96, cloudGain: 1.25, sunset: 0.22, glint: 0.3 }));
    const phiS = PI / 2 + A, phiL = TAU - 2 * A;
    const sphere = earth.spinner.children[0], clouds = earth.spinner.children[1];
    sphere.geometry = new T.SphereGeometry(R, 128, 84, phiS, phiL);
    if (clouds) clouds.geometry = new T.SphereGeometry(R * 1.004, 128, 84, phiS, phiL);
    const uvBases = [sphere, clouds].filter(Boolean).map((mesh) => { const uv = mesh.geometry.attributes.uv, base = new Float32Array(uv.count); for (let i = 0; i < uv.count; i++) base[i] = (phiS + uv.getX(i) * phiL) / TAU; return { uv, base }; });
    const maps = [sphere.material.uniforms.uMap, sphere.material.uniforms.uNight, clouds?.material.uniforms.uC];
    maps.forEach((u) => { if (u?.value) { u.value.wrapS = T.RepeatWrapping; u.value.needsUpdate = true; } });
    const rI = 1221 / 6371, rO = 3480 / 6371, rC = 1 - 35 / 6371;
    const layerT = (() => { const ic = rgb('#fff0b8'), ic2 = rgb('#ffd978'), oc = rgb('#ffb030'), oc2 = rgb('#ff8a1c'), lm = rgb('#c2410e'), um = rgb('#7c2a0e'), um2 = rgb('#5b2410'); return tex(1024, 1024, (u, v) => { const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), n = fbm(x * 7 + 4, y * 7 + 2, 4), m = fbm(Math.atan2(y, x) * 4 + 9, r * 14, 3); if (r < rI) return mix3(ic, ic2, r / rI); if (r < rO) return mix3(oc, oc2, (r - rI) / (rO - rI) + (n - 0.5) * 0.5); if (r < rC) { const k = (r - rO) / (rC - rO); return mix3(mix3(lm, um, sm(0.05, 0.75, k)), um2, sm(0.82, 1, k) * 0.9 + (m - 0.5) * 0.4); } return rgb('#e7dcc8'); }); })();
    const faceM = P.glowMat('#ffffff', 1, { map: layerT, side: T.DoubleSide });
    const faceG = new T.CircleGeometry(R, 128, -PI / 2, PI);
    const beta = [A - PI / 2, -(PI / 2 + A)];
    beta.forEach((b) => { const m = P.add(faceG, faceM, P.root); m.rotation.y = b; m.castShadow = false; });
    const crustG = new T.RingGeometry(R * rC, R, 128, 1, -PI / 2, PI);
    const crustM = new T.MeshBasicMaterial({ color: '#f1e7d4', side: T.DoubleSide });
    beta.forEach((b) => { const m = P.add(crustG, crustM, P.root); m.rotation.y = b; m.castShadow = false; });
    const ball = P.add(new T.SphereGeometry(R * rI, 48, 32), P.glowMat('#ffe9a8', 1.45), P.root); ball.castShadow = false;
    const onFace = (side, r, deg) => { const a = (deg * PI) / 180, s = side > 0 ? Math.sin(A) : -Math.sin(A), c = Math.cos(A); return [s * Math.cos(a) * r * R, Math.sin(a) * r * R, c * Math.cos(a) * r * R]; };
    P.anchor('crust', P.root, onFace(1, 0.998, 42), 0.75);
    P.anchor('mantle', P.root, onFace(-1, 0.78, 22), 1);
    P.anchor('outerCore', P.root, onFace(1, 0.38, -18), 0.9);
    P.anchor('innerCore', P.root, [0, R * rI * 0.7, R * rI * 0.72], 0.6);
    return {
      radius: 2.5,
      update(m) {
        const s = 0.32 - m.spin.tau * 0.022;
        uvBases.forEach(({ uv, base }) => { for (let i = 0; i < uv.count; i++) uv.setX(i, base[i] + s); uv.needsUpdate = true; });
      },
    };
  },
});

PART('waterCycle', {
  doc: 'A landscape in a cut block: sea on the left, land rising to mountains on the right, the Sun above. Vapour rises from the sea, a cloud forms and drifts over the land, rain falls on the mountain, a river runs back to the sea. The order and direction are built in: vapour only rises, the river only runs downhill.',
  args: 'none',
  stage: 'studio',
  anchors: ['sea', 'vapour', 'cloud', 'rain', 'river', 'mountain', 'sun'],
  motions: { cycle: 'runs the whole loop, one round in about 14 s' },
  views: { front: [10, 20], left: [-24, 20], right: [34, 20], above: [10, 42] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const g = P.group(P.root, [0, -0.85, 0]);
    const X0 = -3.3, X1 = 3.3, ZN = 1.3, ZF = -1.3, YB = -1, SEA = 0;
    const riverZ = (x) => 0.45 * Math.sin(x * 1.3 + 0.6) * sm(-0.6, 0.6, x) + 0.28;
    const baseH = (x, z) => { const up = sm(-1.15, 3, x), peak = 1.55 * Math.exp(-(((x - 2.05) / 0.82) ** 2) - ((z + 0.2) / 1.05) ** 2), r2 = 0.6 * Math.exp(-(((x - 1.1) / 0.5) ** 2) - ((z + 0.9) / 0.6) ** 2); return -0.28 + 0.62 * up + peak + r2 + (fbm(x * 1.7 + 2, z * 1.7, 3) - 0.5) * 0.3 * sm(-0.6, 0.6, x); };
    const h = (x, z) => { const y = baseH(x, z) + (fbm(x * 6, z * 6, 4) - 0.5) * 0.22 * sm(0, 1.4, x); const d = Math.abs(z - riverZ(x)); const carve = (1 - sm(0.03, 0.17, d)) * 0.09 * sm(-1, -0.4, x) * (1 - sm(1.3, 1.9, x)); return y - carve; };
    land(X0, X1, ZF, ZN, 150, 64, h, (x, y, z) => { const m = fbm(x * 13, z * 13, 2), n = fbm(x * 3 + 1, z * 3, 2); let c = y < 0.05 ? mix3(rgb('#6a6248'), rgb('#7d7656'), m) : mix3(rgb('#2f4a26'), rgb('#4d6030'), m); c = mix3(c, mix3(rgb('#5a5046'), rgb('#7c6e60'), m), sm(0.72 + n * 0.3, 1.1 + n * 0.2, y)); return mix3(c, rgb('#b6b5b0'), sm(1.32 + m * 0.1, 1.5 + m * 0.1, y)); }, (x) => true, g);
    const earthT = (() => { const a = rgb('#6b5238'), b = rgb('#463a2d'), c = rgb('#2e2a27'); return tex(512, 256, (u, v) => { const n = fbm(u * 10, v * 10, 3), f = fbm(u * 70, v * 40, 2), d = 1 - v + (n - 0.5) * 0.12; let k = mix3(a, b, sm(0.05, 0.28, d)); k = mix3(k, c, sm(0.26, 0.6, d)); return mix3(k, [0, 0, 0], Math.abs(f - 0.5) * 0.6); }); })();
    const rock = P.mat('rock', '#ffffff', { map: earthT, side: T.DoubleSide });
    const uv = (x, y) => [(x + 3.3) / 6.6, clamp((y - YB) / 1.8)];
    wall(X0, ZN, X1, ZN, 150, h, YB, uv, rock, g);
    wall(X1, ZN, X1, ZF, 64, h, YB, (x, y, z) => uv(z * 2, y), rock, g);
    wall(X0, ZN, X0, ZF, 12, h, YB, (x, y, z) => uv(z * 2, y), rock, g);
    wall(X0, ZF, X1, ZF, 150, h, YB, uv, rock, g);
    const seaM = P.mat('matte', '#114468', { roughness: 0.42, transparent: true, opacity: 0.78, side: T.DoubleSide, depthWrite: false });
    let xc = -1.5; while (h(xc, ZN) < SEA && xc < 1) xc += 0.01;
    const seaWall = P.add(buildGeo((() => { const p = []; for (let i = 0; i <= 70; i++) { const x = mix(X0, xc, i / 70); p.push(x, SEA, ZN + 0.003, x, h(x, ZN), ZN + 0.003); } return p; })(), null, Array.from({ length: 70 }, (_, i) => { const k = i * 2; return [k, k + 1, k + 2, k + 1, k + 3, k + 2]; }).flat()), seaM, g); seaWall.castShadow = false;
    const seaTop = P.add(new T.PlaneGeometry(1.7 - X0, ZN - ZF, 1, 1).rotateX(-PI / 2), seaM, g, [(X0 + 1.7) / 2, SEA, 0]); seaTop.castShadow = false;
    const riverPts = []; for (let i = 0; i <= 30; i++) { const s = i / 30, x = mix(1.55, -1.25, s), z = riverZ(x); riverPts.push([x, Math.max(h(x, z) + 0.022, SEA + 0.008), z]); }
    const river = P.tubeAlong(riverPts, 0.03, P.mat('matte', '#2a6d9c', { roughness: 0.3 }), g); river.scale.y = 1; river.castShadow = false;
    P.beads(riverPts.map((p) => [p[0], p[1] + 0.03, p[2]]), { count: 22, speed: 0.1, size: 4.5, color: '#a9d8ff', intensity: 1.2, parent: g });
    const sunPos = [-2.0, 3.6, -0.4];
    const sun = P.add(new T.SphereGeometry(0.34, 32, 24), P.glowMat('#ffd78a', 3), g, sunPos); sun.castShadow = false;
    const halo = P.own(kit.glow({ id: `${P.id}.sunGlow`, color: '#ffc46e', size: 2.6, intensity: 0.8 }), g); halo.place(sunPos);
    const vap = [[-2.5, 0.4], [-1.8, -0.5], [-1.15, 0.5], [-2.15, -0.15]].map(([x, z], i) => P.beads([[x, 0.02, z], [x + 0.06, 0.7, z], [x + 0.2, 1.4, z * 0.8], [x + 0.42, 2.05, z * 0.5]], { count: 11, speed: 0.11 + i * 0.012, size: 4.5, color: '#cfe6ff', intensity: 0.95, parent: g }));
    const blobG = new T.SphereGeometry(1, 16, 12); const lumps = []; for (let i = 0; i < 26; i++) { const a = i * 2.399, r = Math.sqrt(i / 26); lumps.push([Math.cos(a) * r * 0.85, (hash(i, 2) - 0.2) * 0.2 * (1 - r * 0.5), Math.sin(a) * r * 0.5, 0.17 + 0.2 * hash(i, 3) * (1.1 - r)]); }
    const cloudM = new T.MeshStandardMaterial({ color: '#d8dade', roughness: 1, metalness: 0 });
    const cloudG = P.group(g), cloud = inst(blobG, cloudM, 26, cloudG);
    const dark = new T.Color(); lumps.forEach((l, i) => { place(cloud, i, l[0], l[1], l[2], l[3]); dark.setRGB(0.72, 0.74, 0.78); cloud.setColorAt(i, dark); });
    const dropN = 120, drops = inst(new T.CylinderGeometry(0.006, 0.006, 0.11, 5), P.mat('matte', '#9cc8ec', { roughness: 0.3 }), dropN, g);
    const dropAt = (i) => [mix(1.15, 2.5, hash(i, 11)), mix(-0.75, 0.55, hash(i, 12))];
    const cloudX = (ph) => mix(-1.2, 1.85, sm(0.26, 0.62, ph)), cloudSize = (ph) => mix(0.2, 1, sm(0, 0.3, ph)) * (1 - 0.32 * sm(0.72, 0.98, ph));
    P.anchor('sea', g, [-2, SEA, ZN - 0.05], 1.3);
    P.anchor('vapour', g, [-1.75, 1.1, 0.2], 1);
    P.anchor('cloud', cloudG, [0, 0.1, 0.2], 1.3);
    P.anchor('rain', g, [1.8, 1.7, 0.1], 1);
    const rm = riverPts[14]; P.anchor('river', g, [rm[0], rm[1], rm[2]], 1);
    P.anchor('mountain', g, [2.05, h(2.05, -0.2), -0.2], 1.1);
    P.anchor('sun', g, sunPos, 0.9);
    const PERIOD = 14;
    return {
      radius: 3.1,
      update(m) {
        const tau = m.cycle.tau, ph = fract(tau / PERIOD + 0.5), s = cloudSize(ph);
        cloudG.position.set(cloudX(ph), 2.45, -0.15); cloudG.scale.setScalar(s * 1.45); cloudG.visible = s > 0.02;
        const rainK = tau > 0 ? sm(0.56, 0.64, ph) * (1 - sm(0.93, 0.995, ph)) : 0;
        const c = cloud.instanceColor; const gray = mix(0.74, 0.3, rainK); for (let i = 0; i < 26; i++) { dark.setRGB(gray, gray * 1.01, gray * 1.05); cloud.setColorAt(i, dark); } c.needsUpdate = true;
        for (let i = 0; i < dropN; i++) { const [x, z] = dropAt(i); const yTop = 2.35, ground = h(x, z), yy = yTop - fract(hash(i, 13) + tau * 0.75) * (yTop - ground); place(drops, i, x, yy, z, i / dropN < rainK ? 1 : 0); }
        drops.instanceMatrix.needsUpdate = true; drops.visible = rainK > 0.01;
      },
    };
  },
});

PART('tides', {
  doc: 'Earth seen from above the north pole, with the sea drawn as two exaggerated bulges, one toward the Moon and one on the far side, always in line with the Moon, computed from its position. Earth turns counterclockwise under the bulges. The Moon crawls round the same way at its true 27.3 day rate.',
  args: 'none',
  stage: 'space',
  anchors: ['earth', 'moon', 'nearBulge', 'farBulge'],
  motions: { turn: 'Earth turns under the bulges, one day in about 14 s' },
  views: { front: [0, 0], left: [-14, 8], right: [14, 8], above: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    kit.sunAt([120, 160, 620]);
    const R = 1.25, MD = 3.9, start = 0.16;
    const tilt = P.group(P.root, [-0.95, 0, 0]); tilt.rotation.x = PI / 2;
    const earth = P.own(kit.planet({ id: `${P.id}.body`, preset: 'earth', radius: R, spin: 0, spinStart: 30, segments: 96, cloudGain: 0.7, sunset: 0.22, glint: 0.25 }), tilt);
    const axis = P.group(P.root, [-0.95, 0, 0]);
    const bulge = P.add(new T.SphereGeometry(R, 96, 64), P.mat('matte', '#3c86c8', { roughness: 0.35, transparent: true, opacity: 0.5, depthWrite: false }), axis);
    bulge.scale.set(1.3, 1.01, 1.01); bulge.castShadow = false; bulge.renderOrder = 2;
    const moon = P.own(kit.planet({ id: `${P.id}.moonBody`, preset: 'moon', radius: 0.34, spin: 0, segments: 64 }));
    moon.object.rotation.x = PI / 2;
    const line = P.own(kit.orbitPath({ id: `${P.id}.orbit`, radius: MD, color: '#d6d2c6', opacity: 0.22, width: 1 }), axis);
    line.object.rotation.x = PI / 2;
    const moonA = P.anchor('moon', P.root, [0, 0, 0], 0.7);
    P.anchor('earth', P.root, [-0.95 - R * 0.28, R * 0.56, 0.9], 1.6);
    P.anchor('nearBulge', axis, [R * 1.26, 0, 0.25], 0.8);
    P.anchor('farBulge', axis, [-R * 1.26, 0, 0.25], 0.8);
    return {
      radius: 2.55,
      update(m) {
        const tau = m.turn.tau, day = tau / 14, a = start + (day / 27.3) * TAU;
        earth.spinTo(30 + day * 360);
        axis.rotation.z = a;
        const x = -0.95 + Math.cos(a) * MD, y = Math.sin(a) * MD;
        moon.place([x, y, 0]); moonA.place([x, y, 0.3]);
      },
    };
  },
});

PART('pendulum', {
  doc: 'A real brass bob on a thin rod hung from a steel stand. Its period is computed from its length, about 2.0 s at 1 m, so a longer pendulum is truly slower, and mass plays no part. It moves fastest at the bottom. Faint strobe ghosts of the bob, even in time, sit further apart at the bottom.',
  args: 'length: 0.25 to 2.5 metres, default 1.2',
  stage: 'studio',
  anchors: ['pivot', 'string', 'bob', 'lowest', 'highest'],
  motions: { swing: 'released from the high side, swings at its true period' },
  views: { front: [0, 4], left: [-34, 10], right: [34, 10], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const L = clamp(o.length ?? 1.2, 0.25, 2.5), TH = (24 * PI) / 180, per = TAU * Math.sqrt(L / 9.81);
    const topY = L * 0.55 + 0.1, poleH = L + 0.45, baseY = topY - poleH, W = Math.max(0.75, L * 0.68);
    const g = P.group();
    const steel = P.mat('steel', '#a6abb2'), dark = P.mat('matte', '#17191d', { roughness: 0.7 }), brass = P.mat('metal', '#c29a4a', { roughness: 0.26 });
    P.add(new T.BoxGeometry(W * 2 + 0.34, 0.07, 0.68), dark, g, [0, baseY - 0.035, 0]);
    for (const s of [-1, 1]) { P.add(new T.CylinderGeometry(0.022, 0.03, poleH, 20), steel, g, [s * W, baseY + poleH / 2, 0]); P.add(new T.CylinderGeometry(0.05, 0.06, 0.05, 24), steel, g, [s * W, baseY + 0.025, 0]); }
    P.add(new T.CylinderGeometry(0.02, 0.02, W * 2, 20).rotateZ(PI / 2), steel, g, [0, topY, 0]);
    P.add(new T.CylinderGeometry(0.03, 0.03, 0.07, 24).rotateZ(PI / 2), brass, g, [0, topY, 0]);
    const arm = P.group(g, [0, topY, 0]);
    P.add(new T.CylinderGeometry(0.0055, 0.0055, L, 8), steel, arm, [0, -L / 2, 0]);
    const bobR = 0.082, bobG = P.lathe([[0, 0.1], [0.012, 0.09], [0.02, 0.07], [bobR * 0.82, 0.03], [bobR, -0.01], [bobR * 0.86, -0.05], [0.03, -0.09], [0.006, -0.125], [0, -0.13]], 48);
    P.add(bobG, brass, arm, [0, -L, 0]);
    const ghostN = 7, ghosts = []; for (let i = 0; i < ghostN; i++) { const q = P.group(g, [0, topY, 0]); const mat = P.mat('metal', '#c29a4a', { roughness: 0.4, transparent: true, opacity: 0.17, depthWrite: false }); const b = P.add(bobG, mat, q, [0, -L, 0]); b.castShadow = false; ghosts.push(q); }
    const arcPts = []; for (let i = 0; i <= 40; i++) { const a = mix(-TH, TH, i / 40); arcPts.push([Math.sin(a) * L, topY - Math.cos(a) * L, 0]); }
    P.own(kit.path({ id: `${P.id}.arc`, points: arcPts, color: '#ffcc94', width: 1.3, glow: 0.5, opacity: 0.5 }), g);
    P.anchor('pivot', g, [0, topY, 0], 0.5);
    P.anchor('string', arm, [0, -L * 0.45, 0], L * 0.6);
    P.anchor('bob', arm, [0, -L, 0], 0.4);
    P.anchor('lowest', g, [0, topY - L, 0], 0.5);
    P.anchor('highest', g, [Math.sin(TH) * L, topY - Math.cos(TH) * L, 0], 0.5);
    const ang = (tau) => TH * Math.cos((TAU * Math.max(tau, 0)) / per);
    return {
      radius: Math.max(W + 0.3, (L + 0.5) * 0.72),
      update(m) {
        const tau = m.swing.tau;
        arm.rotation.z = ang(tau);
        ghosts.forEach((q, i) => { const dt = ((i + 1) * per) / 16; const on = tau - dt > 0.0; q.visible = on; q.rotation.z = ang(tau - dt); });
      },
    };
  },
});

PART('prism', {
  doc: 'A real triangular prism of flint glass on a stand. A thin white beam enters and bends at both faces by Snell\'s law, computed for each colour, and fans into the spectrum on a card, so red always bends least and violet most. The order cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['prism', 'whiteBeam', 'red', 'violet'],
  motions: { shine: 'the beam reaches the prism, passes through, then fans out, over about 3 s' },
  views: { front: [0, 7], left: [-26, 12], right: [26, 12], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const g = P.group(P.root, [-0.2, 0.55, 0]), TOP = [0, 0.72], LEFT = [-0.72, -0.53], RIGHT = [0.72, -0.53], Y = -2.1;
    const tri = P.extrude([LEFT, RIGHT, TOP], 1.3, { bevelEnabled: false });
    const glass = P.add(tri, P.mat('glass', '#d6e8ff', { opacity: 0.3, side: T.DoubleSide, roughness: 0.04 }), g); glass.castShadow = false;
    const edges = new T.LineSegments(new T.EdgesGeometry(tri), new T.LineBasicMaterial({ color: '#dfeeff', transparent: true, opacity: 0.75 })); g.add(edges);
    const dark = P.mat('paint', '#16181c'), steel = P.mat('steel', '#7d828a');
    P.add(new T.BoxGeometry(8.4, 0.08, 2.6), P.mat('matte', '#101216', { roughness: 0.55 }), g, [0.4, Y - 0.04, 0]);
    P.add(new T.CylinderGeometry(0.05, 0.05, Y * -1 - 0.53, 20), steel, g, [0, (Y - 0.53) / 2, 0]);
    P.add(new T.CylinderGeometry(0.28, 0.32, 0.05, 32), dark, g, [0, Y + 0.025, 0]);
    P.add(new T.BoxGeometry(1.1, 0.03, 0.9), dark, g, [0, -0.545, 0]);
    const norm = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
    const refract = (d, n, eta) => { const c = -(d[0] * n[0] + d[1] * n[1]), k = 1 - eta * eta * (1 - c * c); const q = eta * c - Math.sqrt(Math.max(k, 0)); return norm([eta * d[0] + q * n[0], eta * d[1] + q * n[1]]); };
    const nL = [-0.8638, 0.5038], nR = [0.8638, 0.5038], hit = [(LEFT[0] + TOP[0]) / 2, (LEFT[1] + TOP[1]) / 2];
    const inDir = norm([Math.cos((24.5 * PI) / 180), Math.sin((24.5 * PI) / 180)]);
    const toRight = (p, d) => { const v = [TOP[0] - RIGHT[0], TOP[1] - RIGHT[1]], den = d[0] * nR[0] + d[1] * nR[1], s = ((RIGHT[0] - p[0]) * nR[0] + (RIGHT[1] - p[1]) * nR[1]) / den; return [p[0] + d[0] * s, p[1] + d[1] * s]; };
    const stops = ['#ff2412', '#ff7a12', '#ffe21a', '#2fe05a', '#18a6ff', '#3a44ff', '#7a2cff'].map(rgb), lin = (v) => Math.pow(v, 2.2);
    const N = 42, X = 3.45, rays = [];
    for (let i = 0; i <= N; i++) { const f = i / N, n = mix(1.615, 1.675, f), a = toRight(hit, refract(inDir, nL.map((v) => v), 1 / n)), inD = refract(inDir, nL, 1 / n), outD = refract(inD, [-nR[0], -nR[1]], n), s = (X - a[0]) / outD[0], end = [X, a[1] + outD[1] * s], q = f * 6, j = Math.min(5, Math.floor(q)), c = mix3(stops[j], stops[j + 1], q - j); rays.push({ a, end, c: c.map(lin) }); }
    const strip = (fnA, fnB, power) => { const pos = new Float32Array((N + 1) * 6), col = [], idx = []; rays.forEach((r, i) => { col.push(r.c[0] * power, r.c[1] * power, r.c[2] * power, r.c[0] * power, r.c[1] * power, r.c[2] * power); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }); const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); m.frustumCulled = false; g.add(m); return m; };
    const fan = strip(0, 0, 0.8), inside = strip(0, 0, 0.5);
    const setStrip = (m, k, A, Bf) => { const p = m.geometry.attributes.position; rays.forEach((r, i) => { const a = A(r), b = Bf(r); p.setXYZ(i * 2, a[0], a[1], 0); p.setXYZ(i * 2 + 1, mix(a[0], b[0], k), mix(a[1], b[1], k), 0); }); p.needsUpdate = true; };
    P.add(new T.BoxGeometry(0.05, 1.9, 1.2), P.mat('matte', '#c9c7c0', { roughness: 0.9 }), g, [X + 0.03, -1.15, 0]);
    const band = new T.Mesh(buildGeo((() => { const p = []; rays.forEach((r) => p.push(X, r.end[1], 0.11, X, r.end[1], -0.11)); return p; })(), null, Array.from({ length: N }, (_, i) => { const k = i * 2; return [k, k + 1, k + 2, k + 1, k + 3, k + 2]; }).flat(), rays.flatMap((r) => [r.c[0] * 2, r.c[1] * 2, r.c[2] * 2, r.c[0] * 2, r.c[1] * 2, r.c[2] * 2])), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true }));
    g.add(band);
    const start = [hit[0] - inDir[0] * 2.5, hit[1] - inDir[1] * 2.5];
    const lamp = P.group(g, [start[0], start[1], 0]); lamp.rotation.z = Math.atan2(inDir[1], inDir[0]);
    P.add(new T.BoxGeometry(0.62, 0.3, 0.3), dark, lamp, [-0.31, 0, 0]);
    P.add(new T.CylinderGeometry(0.06, 0.08, 0.1, 24).rotateZ(-PI / 2), steel, lamp, [0.05, 0, 0]);
    P.add(new T.CylinderGeometry(0.035, 0.045, start[1] - Y, 16), steel, g, [start[0] - 0.2, (start[1] + Y) / 2, 0]);
    const beam = P.add(new T.CylinderGeometry(0.009, 0.009, 1, 10).translate(0, 0.5, 0).rotateZ(-PI / 2), P.glowMat('#ffffff', 2.6), g, [start[0] + inDir[0] * 0.08, start[1] + inDir[1] * 0.08, 0]); beam.castShadow = false; beam.rotation.z = Math.atan2(inDir[1], inDir[0]);
    const redR = rays[0], vioR = rays[N];
    P.anchor('prism', g, [0, 0.05, 0.65], 1.1);
    P.anchor('whiteBeam', g, [hit[0] - inDir[0] * 1.2, hit[1] - inDir[1] * 1.2, 0], 1);
    P.anchor('red', g, [mix(redR.a[0], redR.end[0], 0.8), mix(redR.a[1], redR.end[1], 0.8), 0], 1);
    P.anchor('violet', g, [mix(vioR.a[0], vioR.end[0], 0.8), mix(vioR.a[1], vioR.end[1], 0.8), 0], 1);
    return {
      radius: 3.1,
      update(m) {
        const u = m.shine.u, k1 = sm(0, 0.3, u), k2 = sm(0.3, 0.48, u), k3 = sm(0.48, 1, u);
        beam.visible = k1 > 0.001; beam.scale.x = Math.max(k1 * 2.42, 0.001);
        inside.visible = k2 > 0.001; fan.visible = k3 > 0.001; band.visible = k3 > 0.98;
        setStrip(inside, k2, () => hit, (r) => r.a);
        setStrip(fan, k3, (r) => r.a, (r) => r.end);
      },
    };
  },
});

PART('barMagnet', {
  doc: 'A real bar magnet with a red north end and a blue south end. Field lines are integrated from the true two-pole field, running out of north and into south. Small compass needles are set from that same field, with the red tip along the field, so none can point wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['north', 'south', 'field', 'compass'],
  motions: { flow: 'beads run along the field lines from north to south' },
  views: { front: [0, 10], left: [-30, 18], right: [30, 18], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const Nx = 0.95, B = (x, y, z) => { const a = [x - Nx, y, z], b = [x + Nx, y, z], ra = Math.hypot(...a) ** 3 + 1e-4, rb = Math.hypot(...b) ** 3 + 1e-4; return [a[0] / ra - b[0] / rb, a[1] / ra - b[1] / rb, a[2] / ra - b[2] / rb]; };
    const trace = (ang) => { const pts = []; let x = Nx + Math.cos(ang) * 0.12, y = Math.sin(ang) * 0.12; const stepB = (px, py) => { const f = B(px, py, 0), l = Math.hypot(f[0], f[1]) + 1e-6; return [f[0] / l, f[1] / l]; }; for (let i = 0; i < 2400; i++) { if (i % 4 === 0) pts.push([x, y]); const f = stepB(x, y), m1 = stepB(x + f[0] * 0.01, y + f[1] * 0.01); x += m1[0] * 0.02; y += m1[1] * 0.02; if (Math.hypot(x + Nx, y) < 0.13 || Math.hypot(x, y) > 6) break; } pts.push([x, y]); return pts; };
    const mk = (m) => m;
    const bar = P.group();
    P.add(new T.BoxGeometry(1.15, 0.44, 0.44), P.mat('paint', '#a92d24'), bar, [0.575, 0, 0]);
    P.add(new T.BoxGeometry(1.15, 0.44, 0.44), P.mat('paint', '#27488a'), bar, [-0.575, 0, 0]);
    P.add(new T.BoxGeometry(0.02, 0.445, 0.445), P.mat('steel', '#a8acb3'), bar, [0, 0, 0]);
    const angs = [24, 52, 84, 116, 146].flatMap((a) => [a, -a]).map((a) => (a * PI) / 180), paths = [];
    angs.forEach((a, i) => { const pts = trace(a).filter((_, k, arr) => k % Math.max(1, Math.floor(arr.length / 90)) === 0 || k === arr.length - 1); const line = P.own(kit.path({ id: `${P.id}.line${i}`, points: pts.map((p) => [p[0], p[1], 0]), color: '#9fc0ea', width: 1.5, glow: 0.35, opacity: 0.62, segments: 200 })); paths.push(pts); const end = pts[pts.length - 1]; if (Math.hypot(end[0], end[1]) > 5) P.own(kit.path({ id: `${P.id}.back${i}`, points: pts.map((p) => [-p[0], p[1], 0]), color: '#9fc0ea', width: 1.5, glow: 0.35, opacity: 0.62, segments: 200 })); });
    [38, 96].flatMap((a) => [a, -a]).forEach((d, i) => { const pts = trace((d * PI) / 180).filter((_, k, arr) => k % Math.max(1, Math.floor(arr.length / 70)) === 0 || k === arr.length - 1); P.own(kit.path({ id: `${P.id}.lineZ${i}`, points: pts.map((p) => [p[0], 0, p[1]]), color: '#9fc0ea', width: 1.1, glow: 0.2, opacity: 0.28, segments: 160 })); });
    const beads = [0, 1, 2, 3, 4, 5].map((i) => P.beads(paths[i + 2 > 9 ? i : i + 2].filter((_, k) => k % 6 === 0).map((p) => [p[0], p[1], 0]), { count: 9, speed: 0.1, size: 5, color: '#e6f0ff', intensity: 1.4 }));
    const spots = [[0, 1.2], [0, -1.2], [1.95, 0.95], [-1.95, 0.95], [1.95, -0.95], [-1.95, -0.95], [2.55, 0.02], [-2.55, 0.02], [0.95, 1.75], [-0.95, 1.75]];
    const brass = P.mat('metal', '#b08f4e'), dial = P.mat('matte', '#17181b'), red = P.mat('paint', '#d6382c'), pale = P.mat('paint', '#d8d9db');
    let first = null;
    spots.forEach(([x, y]) => { const c = P.group(P.root, [x, y, 0.02]); if (!first) first = c; P.add(new T.CylinderGeometry(0.17, 0.17, 0.035, 36).rotateX(PI / 2), brass, c); P.add(new T.CylinderGeometry(0.145, 0.145, 0.04, 36).rotateX(PI / 2), dial, c); const f = B(x, y, 0), nd = P.group(c, [0, 0, 0.03]); nd.rotation.z = Math.atan2(f[1], f[0]); P.add(new T.ConeGeometry(0.03, 0.13, 12).rotateZ(-PI / 2), red, nd, [0.065, 0, 0]); P.add(new T.ConeGeometry(0.03, 0.13, 12).rotateZ(PI / 2), pale, nd, [-0.065, 0, 0]); });
    P.anchor('north', bar, [0.85, 0.2, 0.2], 0.8);
    P.anchor('south', bar, [-0.85, 0.2, 0.2], 0.8);
    const fp = paths[4][Math.floor(paths[4].length * 0.5)]; P.anchor('field', P.root, [fp[0], fp[1], 0], 1.2);
    P.anchor('compass', first, [0, 0, 0.04], 0.5);
    return { radius: 2.5, update(m) { const k = sm(0, 0.25, m.flow.u); beads.forEach((b) => b.show?.(k)); } };
  },
});

PART('waterMolecule', {
  doc: 'A real water molecule in ball and stick: one oxygen and two hydrogens, sizes in true proportion, with the true 104.5 degree angle at rest and the true 0.96 angstrom bond. The vibration only moves a few degrees about that angle.',
  args: 'none',
  stage: 'studio',
  anchors: ['oxygen', 'hydrogen'],
  motions: { vibrate: 'bonds stretch and the angle flexes a little about its true value' },
  views: { front: [0, 8], left: [-34, 14], right: [34, 14], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE, PI = Math.PI, TAU = PI * 2;
    const fract = (x) => x - Math.floor(x);
    const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); const w = (a, b) => hash(p ? ((a % p) + p) % p : a, p ? ((b % p) + p) % p : b); return mix(mix(w(i, j), w(i + 1, j), u), mix(w(i, j + 1), w(i + 1, j + 1), u), v); };
    const fbm = (x, y, oct = 4, p = 0) => { let s = 0, a = 0.5, n = 0; for (let k = 0; k < oct; k++) { s += a * vn(x, y, p); n += a; x = x * 2 + (p ? 0 : 7.3); y = y * 2 + (p ? 0 : 3.1); p *= 2; a *= 0.5; } return s / n; };
    const tex = (w, h, fn) => { const d = new Uint8Array(w * h * 4); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn((i + 0.5) / w, (j + 0.5) / h), k = (j * w + i) * 4; d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = 255; } const t = new T.DataTexture(d, w, h, T.RGBAFormat); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    const lavaTex = () => { const c = ['#2a0803', '#a82306', '#ff7a18', '#ffd870'].map(rgb); return tex(256, 256, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6), r = Math.abs(fbm(u * 10 + 3, v * 10, 3, 10) - 0.5) * 2, k = clamp(0.1 + n * 0.95 - r * 0.3); return k < 0.35 ? mix3(c[0], c[1], k / 0.35) : k < 0.6 ? mix3(c[1], c[2], (k - 0.35) / 0.25) : mix3(c[2], c[3], (k - 0.6) / 0.4); }); };
    const buildGeo = (pos, uv, idx, col) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    // A vertical cut face from (ax,az) to (bx,bz), between top(x,z) and bot, with uv from world position.
    const wall = (ax, az, bx, bz, n, top, bot, uvf, mat, parent) => { const pos = [], uv = [], idx = []; for (let i = 0; i <= n; i++) { const s = i / n, x = mix(ax, bx, s), z = mix(az, bz, s), yt = top(x, z), yb = typeof bot === 'function' ? bot(x, z) : bot; pos.push(x, yt, z, x, yb, z); const a = uvf(x, yt, z), b = uvf(x, yb, z); uv.push(a[0], a[1], b[0], b[1]); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } } return P.add(buildGeo(pos, uv, idx), mat, parent); };
    // A height field with colours per vertex. keep(x,z) drops cells, so a cut can stay open.
    const land = (x0, x1, z0, z1, nx, nz, h, col, keep, parent, extra) => { const pos = [], c = [], idx = [], lin = (v) => Math.pow(v, 2.2); for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = mix(x0, x1, i / nx), z = mix(z0, z1, j / nz), y = h(x, z), k = col(x, y, z); pos.push(x, y, z); c.push(lin(k[0]), lin(k[1]), lin(k[2])); if (i < nx && j < nz && (!keep || keep(x + (x1 - x0) / nx / 2, z + (z1 - z0) / nz / 2))) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); } } return P.add(buildGeo(pos, null, idx, c), P.mat('rock', '#ffffff', { vertexColors: true, side: T.DoubleSide, ...extra }), parent); };
    const inst = (geo, mat, count, parent) => { const m = new T.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.castShadow = false; (parent || P.root).add(m); return m; };
    const dummy = new T.Object3D();
    const place = (im, i, x, y, z, s, sx, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (sx ?? 1), s, s * (sz ?? 1)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); };
    const b0 = 1.63, ang0 = (104.5 * PI) / 180, y0 = 0.42, rO = 0.62, rH = 0.34, g = P.group(P.root, [0, y0, 0]);
    P.add(new T.SphereGeometry(rO, 64, 48), P.mat('paint', '#b4342a'), g);
    const stickM = P.mat('steel', '#b9bcc2'), hM = P.mat('paint', '#e6e7ea'), stickG = new T.CylinderGeometry(0.075, 0.075, 1, 24).translate(0, -0.5, 0), H = [-1, 1].map(() => { const arm = P.group(g), st = P.add(stickG, stickM, arm), ball = P.add(new T.SphereGeometry(rH, 48, 36), hM, arm); return { arm, st, ball }; });
    const arc = []; for (let i = 0; i <= 32; i++) { const a = mix(-ang0 / 2, ang0 / 2, i / 32); arc.push([Math.sin(a) * 0.98, y0 - Math.cos(a) * 0.98, 0.02]); }
    P.own(kit.path({ id: `${P.id}.angle`, points: arc, color: '#ffcc94', width: 1.6, glow: 0.4, opacity: 0.7 }));
    P.anchor('oxygen', g, [0, 0.28, rO * 0.9], 0.9);
    const h = P.anchor('hydrogen', H[1].ball, [0, 0, rH * 0.8], 0.6);
    return {
      radius: 1.75,
      update(m) {
        const tau = m.vibrate.tau, amp = sm(0, 1, tau), a = ang0 + amp * 0.05 * Math.sin(tau * 5.2), b = b0 * (1 + amp * 0.035 * Math.sin(tau * 7.6));
        H.forEach((q, i) => { q.arm.rotation.z = (i ? 1 : -1) * (a / 2); q.st.scale.y = b; q.ball.position.set(0, -b, 0); });
      },
    };
  },
});
