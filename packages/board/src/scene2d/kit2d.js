// Canvas 2D art kit. Runs inside the sandboxed scene worker. Everything draws in a 1280 by 720 design space.
export function makeKit({ ctx: c, timing, theme, images, pxScale }) {
  const W = 1280, H = 720, TAU = Math.PI * 2, PI = Math.PI;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = {
    linear: (k) => k, inSine: (k) => 1 - Math.cos((k * PI) / 2), outSine: (k) => Math.sin((k * PI) / 2), inOutSine: (k) => 0.5 - 0.5 * Math.cos(PI * k),
    inQuad: (k) => k * k, outQuad: (k) => 1 - (1 - k) * (1 - k), inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
    inCubic: (k) => k * k * k, outCubic: (k) => 1 - (1 - k) ** 3, inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - 4 * (1 - k) ** 3),
    outBack: (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2,
  };
  const dark = theme === 'dark';
  const paper = dark ? '#14161B' : '#F4EFE6', paper2 = dark ? '#1E2128' : '#FBF8F2', ink = dark ? '#F5F0E6' : '#1B1A18', inkSoft = dark ? '#B9B3A8' : '#5E5A52';
  const moments = (timing && timing.moments) || {};
  const duration = (timing && timing.duration) || 0;
  const at = (m) => (typeof m === 'number' ? m : m == null ? null : moments[m] ?? (() => { throw new Error(`Unknown moment "${m}"`); })());
  const p = (t, m, seconds = 1, easing = 'inOutSine') => { const k = clamp01((t - at(m)) / seconds); return (typeof easing === 'function' ? easing : ease[easing] || ease.linear)(k); };
  const env = (t, from, to, fade = 0.5) => { const a = clamp01((t - at(from)) / fade); const b = to == null ? 1 : clamp01((at(to) - t) / fade); return ease.inOutSine(Math.min(a, b)); };

  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let r = Math.imul(s ^ (s >>> 15), 1 | s); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

  const rgbOf = (h) => { if (h[0] !== '#') { const m = h.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2]]; } const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const x = rgbOf(a), y = rgbOf(b); return `rgb(${Math.round(lerp(x[0], y[0], k))},${Math.round(lerp(x[1], y[1], k))},${Math.round(lerp(x[2], y[2], k))})`; };
  const alpha = (col, a) => { const x = rgbOf(col); return `rgba(${x[0]},${x[1]},${x[2]},${a})`; };
  const lighten = (col, k) => mix(col, '#ffffff', k), darken = (col, k) => mix(col, '#000000', k);

  const FONT = (size, weight = 500, family = 'Barlow') => `${weight} ${size}px ${family}, system-ui, sans-serif`;
  const MATH = (size, weight = 400) => `${weight} ${size}px Newsreader, Georgia, serif`;
  const scoped = (fn) => { c.save(); try { return fn(); } finally { c.restore(); } };
  const grad = (x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  const radial = (x, y, r0, r1, stops, fx = x, fy = y) => { const g = c.createRadialGradient(fx, fy, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  const roundRect = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

  // Sprite caches hold pictures that depend only on their key, so caching never makes a frame depend on the frames before it.
  const sprites = new Map();
  const sprite = (key, w, h, draw) => {
    let s = sprites.get(key);
    if (s) return s;
    s = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
    draw(s.getContext('2d'), s.width, s.height);
    sprites.set(key, s);
    return s;
  };

  // A contact shadow on the ground, soft on all sides.
  function shadow({ x, y, rx, ry = rx * 0.14, alpha: a = 0.38, color = '#000000' }) {
    scoped(() => { c.translate(x, y); c.scale(1, ry / rx); c.fillStyle = radial(0, 0, 0, rx, [[0, alpha(color, a)], [0.55, alpha(color, a * 0.55)], [1, alpha(color, 0)]]); c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); });
  }

  // Lighting is painted over flat colour so every part of a curved thing shares one key light from the upper left.
  function cylLight(x0, x1, y0, y1, k = 1) {
    c.fillStyle = grad(x0, 0, x1, 0, [[0, `rgba(10,14,28,${0.62 * k})`], [0.1, `rgba(10,14,28,${0.3 * k})`], [0.26, 'rgba(255,255,255,0)'], [0.36, `rgba(255,255,255,${0.42 * k})`], [0.46, 'rgba(255,255,255,0)'], [0.68, `rgba(10,14,28,${0.2 * k})`], [0.93, `rgba(10,14,28,${0.66 * k})`], [0.975, `rgba(10,14,28,${0.55 * k})`], [1, `rgba(170,200,255,${0.5 * k})`]]);
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  // ---- Flame ----
  function flameArt(x, y, L, wid, t, power, seed) {
    if (power <= 0.01) return;
    const pw = Math.sqrt(power);
    const len = L * pw * (0.93 + 0.1 * noise(t * 9 + seed) + 0.05 * noise(t * 23 + seed * 3));
    const layers = [
      { w: 1.0, l: 1.0, wob: 0.2, stops: [[0, 'rgba(255,170,70,.0)'], [0.05, 'rgba(255,140,40,.92)'], [0.5, 'rgba(255,84,16,.72)'], [1, 'rgba(180,30,6,0)']] },
      { w: 0.7, l: 0.8, wob: 0.14, stops: [[0, 'rgba(255,230,140,.95)'], [0.45, 'rgba(255,170,50,.9)'], [1, 'rgba(255,110,20,0)']] },
      { w: 0.42, l: 0.58, wob: 0.08, stops: [[0, 'rgba(255,255,240,1)'], [0.5, 'rgba(255,236,160,.95)'], [1, 'rgba(255,200,90,0)']] },
      { w: 0.2, l: 0.34, wob: 0.03, stops: [[0, 'rgba(235,245,255,1)'], [1, 'rgba(255,255,230,0)']] },
    ];
    scoped(() => {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = radial(x, y + len * 0.2, 0, len * 0.62, [[0, `rgba(255,160,70,${0.42 * pw})`], [0.45, `rgba(255,100,30,${0.1 * pw})`], [1, 'rgba(255,60,0,0)']]);
      c.beginPath(); c.arc(x, y + len * 0.2, len * 0.62, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      layers.forEach((ly, li) => {
        const LL = len * ly.l, N = 14, left = [], right = [];
        for (let i = 0; i <= N; i++) {
          const s = i / N;
          const prof = (s < 0.16 ? lerp(0.62, 1, Math.sin((s / 0.16) * PI * 0.5)) : Math.pow(Math.cos(((s - 0.16) / 0.84) * PI * 0.5), 0.9)) * wid * ly.w * (0.75 + 0.25 * pw);
          const wob = noise(s * 4.5 - t * 8 + seed + li * 7) * ly.wob * wid * s * 1.6, wob2 = noise(s * 4.5 - t * 8 + seed + li * 13 + 40) * ly.wob * wid * s * 1.6;
          left.push([x - prof + wob, y + s * LL]); right.push([x + prof + wob2, y + s * LL]);
        }
        c.beginPath(); c.moveTo(left[0][0], left[0][1]);
        for (let i = 1; i < left.length; i++) { const a = left[i - 1], b = left[i]; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
        for (let i = right.length - 1; i >= 0; i--) { const b = right[i], a = right[i + 1] || b; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
        c.closePath();
        c.fillStyle = grad(0, y, 0, y + LL, ly.stops);
        c.fill();
      });
      for (let i = 0; i < 3; i++) {
        const dy = len * (0.14 + i * 0.13), r = wid * (0.22 - i * 0.05);
        c.fillStyle = `rgba(255,255,255,${(0.5 - i * 0.12) * pw})`;
        c.beginPath(); c.moveTo(x - r, y + dy); c.quadraticCurveTo(x, y + dy - r * 0.9, x + r, y + dy); c.quadraticCurveTo(x, y + dy + r * 1.1, x - r, y + dy); c.fill();
      }
    });
  }
  function flame({ x, y, length = 180, width, angle = 0, t = 0, power = 1, seed = 1 }) {
    scoped(() => { c.translate(x, y); c.rotate(angle); flameArt(0, 0, length, width ?? length * 0.16, t, power, seed); });
  }

  // ---- Rocket ----
  const STACKS = {
    1: [{ R: 62, rt: 62, h: 720, bells: [0], bw: 44, bh: 62, fins: true }],
    2: [{ R: 58, rt: 42, h: 560, bells: [-24, 24], bw: 22, bh: 48, fins: true, collar: true }, { R: 42, rt: 42, h: 230, bells: [0], bw: 25, bh: 34 }],
    3: [{ R: 66, rt: 50, h: 440, bells: [-40, 0, 40], bw: 19, bh: 46, fins: true, collar: true }, { R: 50, rt: 37, h: 250, bells: [-17, 17], bw: 15, bh: 32, collar: true }, { R: 37, rt: 37, h: 140, bells: [0], bw: 18, bh: 26 }],
  };
  const NOSE = { 1: 280, 2: 210, 3: 170 };
  const noseOf = (n) => NOSE[n];

  function bellArt(x, st) {
    const nw = st.bw * 0.42, bw = st.bw, bh = st.bh;
    c.beginPath(); c.moveTo(x - nw, 0); c.bezierCurveTo(x - nw * 1.05, bh * 0.45, x - bw * 0.8, bh * 0.75, x - bw, bh); c.lineTo(x + bw, bh); c.bezierCurveTo(x + bw * 0.8, bh * 0.75, x + nw * 1.05, bh * 0.45, x + nw, 0); c.closePath();
    c.fillStyle = grad(x - bw, 0, x + bw, 0, [[0, '#2a2622'], [0.2, '#8a7a68'], [0.36, '#f2e6d2'], [0.5, '#a79278'], [0.8, '#463c32'], [1, '#6d7a90']]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const k = i / 4, w = lerp(nw, bw, k * k); c.beginPath(); c.moveTo(x - w, bh * k); c.quadraticCurveTo(x, bh * k + 3, x + w, bh * k); c.stroke(); }
    c.fillStyle = '#17120e'; c.beginPath(); c.ellipse(x, bh, bw, Math.max(2, bw * 0.16), 0, 0, TAU); c.fill();
  }
  function finArt(st, side) {
    const R = st.R, h = st.h, s = side;
    const top = -h * 0.2, bot = st.bh * 0.34;
    c.beginPath(); c.moveTo(s * R, top); c.bezierCurveTo(s * (R + R * 0.4), top + h * 0.06, s * (R + R * 0.86), bot - h * 0.05, s * (R + R * 0.96), bot + 8); c.lineTo(s * (R + R * 0.62), bot + 8); c.quadraticCurveTo(s * (R + R * 0.34), bot - 12, s * R, bot - 16); c.closePath();
    c.fillStyle = s < 0 ? grad(-R * 2, top, -R, bot, [[0, '#3a3f4b'], [1, '#14161c']]) : grad(R, top, R * 2, bot, [[0, '#1a1c23'], [1, '#2d313b']]);
    c.fill();
    c.strokeStyle = s < 0 ? 'rgba(220,230,255,.5)' : 'rgba(150,175,220,.35)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(s * R, top); c.bezierCurveTo(s * (R + R * 0.4), top + h * 0.06, s * (R + R * 0.86), bot - h * 0.05, s * (R + R * 0.96), bot + 8); c.stroke();
  }
  function fuelWindow(st, fuel) {
    const R = st.R, h = st.h, wx = R * 0.62, y0 = -h * 0.82, y1 = -h * 0.1, H0 = y1 - y0;
    scoped(() => {
      roundRect(-wx, y0, wx * 2, H0, wx * 0.5);
      c.fillStyle = grad(-wx, 0, wx, 0, [[0, '#23272f'], [0.5, '#3a404b'], [1, '#191c22']]); c.fill();
      c.save(); c.clip();
      const k = clamp01(fuel), level = y1 - H0 * k;
      if (k > 0.002) {
        c.fillStyle = grad(-wx, 0, wx, 0, [[0, '#0a4fa8'], [0.35, '#49b6ff'], [0.55, '#2393f0'], [1, '#07408f']]);
        c.fillRect(-wx, level, wx * 2, y1 - level);
        c.fillStyle = 'rgba(190,235,255,.85)'; c.beginPath(); c.ellipse(0, level, wx, wx * 0.09, 0, 0, TAU); c.fill();
      }
      c.fillStyle = grad(-wx, 0, wx, 0, [[0, 'rgba(255,255,255,0)'], [0.22, 'rgba(255,255,255,.16)'], [0.3, 'rgba(255,255,255,0)']]); c.fillRect(-wx, y0, wx * 2, H0);
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2;
      for (let i = 1; i < 8; i++) { const y = lerp(y0, y1, i / 8), w = i % 2 ? 10 : 18; c.beginPath(); c.moveTo(wx - w, y); c.lineTo(wx, y); c.stroke(); }
      c.restore();
      roundRect(-wx, y0, wx * 2, H0, wx * 0.5); c.strokeStyle = '#6d7482'; c.lineWidth = 3.5; c.stroke();
    });
  }
  function stageArt(st, o) {
    const { R, rt, h } = st, taper = st.collar ? h * 0.11 : 0, sc = o.scale;
    const bodyPath = () => { c.beginPath(); c.moveTo(-R, 0); c.lineTo(-R, -(h - taper)); c.lineTo(-rt, -h); c.lineTo(rt, -h); c.lineTo(R, -(h - taper)); c.lineTo(R, 0); c.closePath(); };
    for (const bx of st.bells) scoped(() => bellArt(bx, st));
    if (st.fins) { finArt(st, -1); finArt(st, 1); }
    scoped(() => {
      bodyPath(); c.clip();
      c.fillStyle = o.paint || '#F1EEE6'; c.fillRect(-R, -h, R * 2, h);
      c.fillStyle = '#17181d';
      const bh = h * 0.13;
      c.fillRect(-R, -h * 0.2 - bh, R * 0.86, bh); c.fillRect(R * 0.2, -h * 0.2 - bh * 2, R * 0.8, bh);
      c.fillRect(-R, -h * 0.2 - bh * 3, R * 0.86, bh * 0.0);
      c.fillStyle = '#e4572e'; c.fillRect(-R, -(h - taper) - 12 + (st.collar ? 0 : -h * 0.02) + 22, R * 2, 0);
      c.fillStyle = '#e4572e'; c.fillRect(-R, -h * 0.74, R * 2, Math.max(5, h * 0.016));
      c.strokeStyle = 'rgba(30,34,44,.32)'; c.lineWidth = 1.5;
      const rows = Math.max(2, Math.round(h / 90));
      for (let i = 1; i <= rows; i++) { const y = -(h - taper) * (i / (rows + 1)); c.beginPath(); c.moveTo(-R, y); c.quadraticCurveTo(0, y + R * 0.09, R, y); c.stroke(); }
      for (const phi of [-58, -22, 18, 52]) { const x = R * Math.sin((phi * PI) / 180); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, -h); c.stroke(); }
      if (sc > 0.28) {
        for (let i = 0; i <= rows + 1; i++) {
          const y = -(h - taper) * (i / (rows + 1));
          for (let a = -80; a <= 80; a += 10) {
            const s = a / 90, x = R * Math.sin((a * PI) / 180), yy = y + R * 0.09 * (1 - s * s) * 0.5 - 6;
            c.fillStyle = 'rgba(25,28,36,.5)'; c.beginPath(); c.arc(x, yy, 1.5, 0, TAU); c.fill();
            c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(x - 0.5, yy - 0.5, 0.65, 0, TAU); c.fill();
          }
        }
      }
      if (st.collar) {
        c.fillStyle = '#2b2e36'; c.fillRect(-R, -h, R * 2, taper);
        c.strokeStyle = 'rgba(190,200,220,.45)'; c.lineWidth = 2;
        for (let a = -84; a <= 84; a += 12) { const k = Math.sin((a * PI) / 180); c.beginPath(); c.moveTo(R * k, -(h - taper)); c.lineTo(rt * k, -h); c.stroke(); }
      }
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-R, -5, R * 2, 5);
      if (o.fuel != null) fuelWindow(st, o.fuel);
      cylLight(-R, R, -h, 0, 1);
      c.fillStyle = grad(0, -14, 0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); c.fillRect(-R, -14, R * 2, 14);
    });
  }
  function noseArt(r, nh) {
    scoped(() => {
      c.beginPath(); c.moveTo(-r, 0); c.bezierCurveTo(-r, -nh * 0.45, -r * 0.42, -nh * 0.85, 0, -nh); c.bezierCurveTo(r * 0.42, -nh * 0.85, r, -nh * 0.45, r, 0); c.closePath(); c.clip();
      c.fillStyle = '#F1EEE6'; c.fillRect(-r, -nh, r * 2, nh);
      c.fillStyle = '#17181d'; c.fillRect(-r, -nh, r * 2, nh * 0.13);
      c.fillStyle = '#e4572e'; c.fillRect(-r, -nh * 0.2, r * 2, 5);
      c.strokeStyle = 'rgba(30,34,44,.3)'; c.lineWidth = 1.5;
      for (const f of [0.42, 0.66]) { c.beginPath(); c.moveTo(-r, -nh * f); c.quadraticCurveTo(0, -nh * f + r * 0.08, r, -nh * f); c.stroke(); }
      cylLight(-r, r, -nh, 0, 1);
    });
  }
  // A stack in units where the whole rocket, nose to base of the bottom stage, is 1000 long.
  function rocket({ x, y, length = 400, angle = 0, stages = 2, from = 0, fuel, flame: fl = 0, t = 0, seed = 2, paint, flameLength = 1 }) {
    const stack = STACKS[stages], sc = length / 1000, fuels = Array.isArray(fuel) ? fuel : [fuel], flames = Array.isArray(fl) ? fl : [fl];
    return scoped(() => {
      c.translate(x, y); c.rotate(angle); c.scale(sc, sc);
      const low = stack[from];
      flameArtFor(low, t, flames[from] ?? (from === 0 ? flames[0] : 0), seed + from, flameLength);
      let yy = 0, lastR = low.R;
      for (let i = from; i < stack.length; i++) {
        const st = stack[i];
        scoped(() => { c.translate(0, yy); stageArt(st, { scale: sc, fuel: fuels[i] ?? null, paint }); });
        yy -= st.h; lastR = st.rt;
      }
      if (stack.length) scoped(() => { c.translate(0, yy); noseArt(lastR, noseOf(stages)); });
    });
  }
  function flameArtFor(st, t, power, seed, flameLength = 1) {
    if (!power || power <= 0.01) return;
    st.bells.forEach((bx, i) => flameArt(bx, st.bh + 2, (st.h * 0.28 + 190) * flameLength, st.bw * 1.05, t, power, seed + i * 3.7));
  }
  // One stage on its own, for separation. Same scale as the rocket it came from.
  function rocketStage({ x, y, length = 400, angle = 0, stages = 3, index = 0, fuel, flame: fl = 0, t = 0, seed = 5, pivot = 0 }) {
    const st = STACKS[stages][index], sc = length / 1000;
    scoped(() => {
      c.translate(x, y); c.rotate(angle); c.scale(sc, sc); c.translate(0, st.h * pivot);
      flameArtFor(st, t, fl, seed);
      stageArt(st, { scale: sc, fuel: fuel ?? null });
    });
  }
  const stageHeights = (stages, length) => STACKS[stages].map((s) => s.h * (length / 1000));
  const stageRadii = (stages, length) => STACKS[stages].map((s) => s.R * (length / 1000));

  // ---- Sky, ground, space ----
  function sky({ top, bottom, sun, glow } = {}) {
    const t0 = top || (dark ? '#141d3c' : '#5fa6e8'), b0 = bottom || (dark ? '#e0795a' : '#e3f1fb');
    c.fillStyle = grad(0, 0, 0, H, [[0, t0], [0.72, b0], [1, b0]]); c.fillRect(0, 0, W, H);
    if (sun) { const col = dark ? '255,170,110' : '255,245,210'; c.fillStyle = radial(sun.x, sun.y, 0, 520, [[0, `rgba(${col},.75)`], [0.25, `rgba(${col},.22)`], [1, `rgba(${col},0)`]]); c.fillRect(0, 0, W, H); }
  }
  function space({ seed = 4, dx = 0, dy = 0, count = 900, band = true } = {}) {
    c.fillStyle = '#04050a'; c.fillRect(0, 0, W, H);
    const scale = Math.max(1, Math.min(2, pxScale));
    const s = sprite(`stars${seed}:${count}:${scale}`, W * scale, H * scale, (g, w, h) => {
      const r = rng(seed);
      if (band) {
        g.save(); g.translate(w * 0.55, h * 0.45); g.rotate(-0.5);
        for (let i = 0; i < 26; i++) { const px = (r() - 0.5) * w * 1.3, py = (r() - 0.5) * h * 0.34, rr = (60 + r() * 170) * scale, col = r() < 0.5 ? '90,110,170' : '150,120,120'; const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, `rgba(${col},.055)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
        g.restore();
        // The sprite tiles when it slides, so the band must fade out before the edges or the seam shows.
        g.save(); g.globalCompositeOperation = 'destination-in'; g.translate(w / 2, h / 2); g.scale(1, h / w);
        const fade = g.createRadialGradient(0, 0, 0, 0, 0, w / 2); fade.addColorStop(0, '#000'); fade.addColorStop(0.6, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(-w, -w, w * 2, w * 2); g.restore();
      }
      for (let i = 0; i < count; i++) {
        const x = r() * w, y = r() * h, m = r(), rad = (m > 0.985 ? 1.5 : m > 0.9 ? 1 : 0.55) * scale, tint = r();
        const col = tint < 0.2 ? '255,214,180' : tint < 0.42 ? '180,205,255' : '255,255,255', a = 0.28 + r() * 0.72;
        if (m > 0.985) { const gr = g.createRadialGradient(x, y, 0, x, y, rad * 3.4); gr.addColorStop(0, `rgba(${col},.4)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - rad * 3.4, y - rad * 3.4, rad * 6.8, rad * 6.8); }
        g.fillStyle = `rgba(${col},${a})`; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
    });
    const ox = ((dx % W) + W) % W, oy = ((dy % H) + H) % H;
    for (const ax of [ox - W, ox]) for (const ay of [oy - H, oy]) c.drawImage(s, ax, ay, W, H);
  }
  const stars = space;
  function ground({ y = 600, kind = 'grass', seed = 3, scroll = 0 } = {}) {
    const P = { grass: [dark ? '#2c4a2a' : '#6da348', dark ? '#16261a' : '#3f7030'], dirt: ['#9a7650', '#6a4c30'], sand: ['#e0c188', '#b8935a'], stone: ['#8f8e88', '#5c5b57'] }[kind];
    c.fillStyle = grad(0, y, 0, H, [[0, P[0]], [1, P[1]]]); c.fillRect(0, y, W, H - y);
    const r = rng(seed), n = 340;
    scoped(() => {
      c.beginPath(); c.rect(0, y - 16, W, H - y + 16); c.clip();
      for (let i = 0; i < n; i++) {
        const k = r(), py = y + k * k * (H - y) + 1, bx = r() * 1400, px = (((bx - scroll * (0.6 + k)) % 1400) + 1400) % 1400 - 60, h = 4 + 15 * k + r() * 5, lean = (r() - 0.5) * 7, tone = r();
        c.strokeStyle = tone < 0.5 ? alpha(lighten(P[0], 0.22), 0.8) : alpha(darken(P[1], 0.22), 0.8); c.lineWidth = 1 + k * 1.5;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + lean * 0.2, py - h * 0.6, px + lean, py - h); c.stroke();
      }
    });
    c.fillStyle = grad(0, y - 34, 0, y + 10, [[0, 'rgba(255,255,255,0)'], [0.75, dark ? 'rgba(255,180,140,.12)' : 'rgba(255,255,255,.26)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(0, y - 34, W, 44);
  }
  function road({ y = 600, height = 120, scroll = 0, shoulder = true } = {}) {
    if (shoulder) { c.fillStyle = dark ? '#272a22' : '#7a8a5c'; c.fillRect(0, y - 16, W, 16); }
    c.fillStyle = grad(0, y, 0, y + height, [[0, dark ? '#2b2d33' : '#4a4d53'], [1, dark ? '#16171b' : '#2c2e33']]); c.fillRect(0, y, W, height);
    const r = rng(77);
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 300; i++) { const bx = r() * 1400, py = y + r() * height, px = (((bx - scroll) % 1400) + 1400) % 1400 - 60; c.fillRect(px, py, 1 + r() * 3, 1.4); }
    c.fillStyle = 'rgba(0,0,0,.2)';
    for (let i = 0; i < 180; i++) { const bx = r() * 1400, py = y + r() * height, px = (((bx - scroll) % 1400) + 1400) % 1400 - 60; c.fillRect(px, py, 1 + r() * 4, 1.4); }
    c.fillStyle = '#d7d2c6'; c.fillRect(0, y, W, 3);
    const dashY = y + height * 0.62, gap = 170, off = ((scroll % gap) + gap) % gap;
    c.fillStyle = dark ? '#c8b57a' : '#efe7cf';
    for (let x = -gap - off; x < W + gap; x += gap) c.fillRect(x, dashY, 90, 6);
  }
  function cloud({ x, y, w = 240, seed = 1, alpha: a = 1, tint } = {}) {
    const s = sprite(`cloud${seed}:${dark ? 1 : 0}:${tint || ''}`, 640, 300, (g, sw, sh) => {
      const r = rng(seed * 97 + 11), lit = tint || (dark ? '#f2bfa8' : '#ffffff'), shade = dark ? '#3f3d57' : '#b4c4d9';
      const puffs = [];
      for (let i = 0; i < 22; i++) { const k = r(), px = sw * (0.14 + k * 0.72), arch = Math.sin(k * PI), rad = (28 + r() * 42) * (0.7 + arch * 0.75); puffs.push([px, sh * 0.74 - arch * sh * 0.34 * r() - rad * 0.28, rad]); }
      puffs.sort((m, n) => m[1] - n[1]);
      for (const [px, py, rad] of puffs) { const gr = g.createRadialGradient(px - rad * 0.28, py - rad * 0.42, rad * 0.1, px, py, rad); gr.addColorStop(0, lit); gr.addColorStop(0.68, lit); gr.addColorStop(0.88, alpha(mix(lit, shade, 0.12), 0.75)); gr.addColorStop(1, alpha(mix(lit, shade, 0.2), 0)); g.fillStyle = gr; g.beginPath(); g.arc(px, py, rad, 0, TAU); g.fill(); }
      g.globalCompositeOperation = 'source-atop';
      const sg = g.createLinearGradient(0, sh * 0.3, 0, sh * 0.82); sg.addColorStop(0, alpha(shade, 0)); sg.addColorStop(1, alpha(shade, 0.85)); g.fillStyle = sg; g.fillRect(0, 0, sw, sh);
      g.globalCompositeOperation = 'destination-out';
      const f = g.createLinearGradient(0, sh * 0.74, 0, sh * 0.92); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = f; g.fillRect(0, sh * 0.74, sw, sh * 0.26);
    });
    scoped(() => { c.globalAlpha *= a; c.drawImage(s, x - w / 2, y - (w * 300) / 640 / 2, w, (w * 300) / 640); });
  }

  // ---- Earth, mapped per pixel from a real photo ----
  const tex = {};
  const texData = (name) => {
    if (tex[name]) return tex[name];
    const im = images && images[name]; if (!im) throw new Error(`The image "${name}" did not reach the frame`);
    const k = new OffscreenCanvas(im.width, im.height); const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    tex[name] = { w: k.width, h: k.height, d: g.getImageData(0, 0, k.width, k.height).data };
    return tex[name];
  };
  const sphereTables = new Map();
  const LIGHT = (() => { const v = [-0.34, -0.42, 0.84], n = Math.hypot(...v); return v.map((x) => x / n); })();
  function sphereTable(size) {
    if (sphereTables.has(size)) return sphereTables.get(size);
    const n = size * size, U = new Float32Array(n), V = new Float32Array(n), S = new Float32Array(n), L = new Float32Array(n), A = new Uint8Array(n), SP = new Float32Array(n);
    const R = size / 2 - 1, tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i + 0.5 - size / 2) / R, y = (j + 0.5 - size / 2) / R, d2 = x * x + y * y, id = j * size + i;
      if (d2 > 1.03) continue;
      const dd = Math.min(d2, 1), z = Math.sqrt(1 - dd), rx = x * ct + y * st, ry = -x * st + y * ct;
      U[id] = Math.atan2(rx, z) / TAU + 0.5; V[id] = Math.acos(clamp(ry, -1, 1)) / PI;
      const dot = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2];
      S[id] = Math.max(0, dot); L[id] = Math.pow(1 - z, 3);
      const hz = dot * 2 * z - LIGHT[2]; SP[id] = Math.pow(Math.max(0, hz), 28);
      A[id] = 255 * clamp01((1 - Math.sqrt(d2)) * R + 0.5);
    }
    const out = { U, V, S, L, A, SP };
    sphereTables.set(size, out);
    return out;
  }
  function bakeEarth(size, rotDeg, cloudGain) {
    const key = `earth${size}:${Math.round(rotDeg * 4)}:${cloudGain}`;
    const hit = sprites.get(key); if (hit) return hit;
    for (const k of [...sprites.keys()]) if (k.startsWith(`earth${size}:`)) sprites.delete(k);
    const day = texData('earth-day'), cl = texData('earth-clouds'), T = sphereTable(size), rot = Math.round(rotDeg * 4) / 4 / 360;
    const s = new OffscreenCanvas(size, size); const g = s.getContext('2d'); const im = g.createImageData(size, size), o = im.data, n = size * size;
    const dw = day.w, dh = day.h, dd = day.d, cw = cl.w, ch = cl.h, cd = cl.d;
    for (let i = 0; i < n; i++) {
      const a = T.A[i]; if (!a) continue;
      let u = T.U[i] + rot; u -= Math.floor(u);
      const v = T.V[i], fx = u * dw - 0.5, fy = Math.min(v * dh - 0.5, dh - 1.001), x0 = (fx + dw) % dw | 0, y0 = fy < 0 ? 0 : fy | 0, tx = fx - Math.floor(fx), ty = fy < 0 ? 0 : fy - y0, x1 = (x0 + 1) % dw, y1 = Math.min(y0 + 1, dh - 1);
      const i00 = (y0 * dw + x0) * 4, i10 = (y0 * dw + x1) * 4, i01 = (y1 * dw + x0) * 4, i11 = (y1 * dw + x1) * 4;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
      let r = dd[i00] * wa + dd[i10] * wb + dd[i01] * wc + dd[i11] * wd, gg = dd[i00 + 1] * wa + dd[i10 + 1] * wb + dd[i01 + 1] * wc + dd[i11 + 1] * wd, b = dd[i00 + 2] * wa + dd[i10 + 2] * wb + dd[i01 + 2] * wc + dd[i11 + 2] * wd;
      const gx = u * cw - 0.5, gy = Math.max(0, Math.min(v * ch - 0.5, ch - 1.001)), cx = (gx + cw) % cw | 0, cy = gy | 0, cx1 = (cx + 1) % cw, sx = gx - Math.floor(gx), sy = gy - cy;
      let cv = ((cd[(cy * cw + cx) * 4] * (1 - sx) + cd[(cy * cw + cx1) * 4] * sx) * (1 - sy) + (cd[((cy + 1) * cw + cx) * 4] * (1 - sx) + cd[((cy + 1) * cw + cx1) * 4] * sx) * sy) / 255; cv = clamp01((cv - 0.12) * 1.25) * cloudGain;
      const ocean = b > r * 1.25 ? 1 : 0;
      r = r * 0.95 + (255 - r) * cv; gg = gg * 0.98 + (255 - gg) * cv; b = b * 1.04 + (255 - b) * cv;
      const sh = T.S[i], lit = 0.05 + 1.02 * Math.pow(sh, 0.72), limb = T.L[i], spec = ocean * (1 - cv) * T.SP[i] * 70;
      r = r * lit + limb * 26 * lit + spec; gg = gg * lit + limb * 70 * lit + spec; b = b * lit + limb * 170 * lit + spec;
      o[i * 4] = r > 255 ? 255 : r; o[i * 4 + 1] = gg > 255 ? 255 : gg; o[i * 4 + 2] = b > 255 ? 255 : b; o[i * 4 + 3] = a;
    }
    g.putImageData(im, 0, 0);
    sprites.set(key, s);
    return s;
  }
  function earth({ x, y, r, rot = 0, clouds = 1, atmosphere = 1 }) {
    const want = r * 2 * pxScale, size = [192, 320, 512, 768, 1024].find((v) => v >= want) || 1024;
    scoped(() => {
      if (atmosphere > 0) {
        const lx = x + LIGHT[0] * r * 0.06, ly = y + LIGHT[1] * r * 0.06, ro = r * 1.11;
        c.fillStyle = radial(lx, ly, r * 0.96, ro, [[0, `rgba(110,170,255,${0.6 * atmosphere})`], [0.28, `rgba(80,140,255,${0.26 * atmosphere})`], [1, 'rgba(70,120,255,0)']]);
        c.beginPath(); c.arc(lx, ly, ro, 0, TAU); c.fill();
      }
      c.drawImage(bakeEarth(size, rot, clouds), x - r, y - r, r * 2, r * 2);
    });
  }

  // ---- Bodies drawn from gradients only ----
  function sun({ x, y, r = 70, rays = true }) {
    scoped(() => {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = radial(x, y, r * 0.5, r * 4.4, [[0, 'rgba(255,190,90,.65)'], [0.35, 'rgba(255,140,50,.18)'], [1, 'rgba(255,100,20,0)']]); c.beginPath(); c.arc(x, y, r * 4.4, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      if (rays) { for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r0 = r * 1.06, r1 = r * (1.38 + (i % 2) * 0.22); c.fillStyle = 'rgba(255,214,120,.65)'; c.beginPath(); c.moveTo(x + Math.cos(a - 0.08) * r0, y + Math.sin(a - 0.08) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.lineTo(x + Math.cos(a + 0.08) * r0, y + Math.sin(a + 0.08) * r0); c.fill(); } }
      c.fillStyle = radial(x, y, 0, r, [[0, '#fffbe6'], [0.55, '#ffe59a'], [0.86, '#ffb545'], [1, '#f58a23']]); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    });
  }
  const bodyShade = (x, y, r) => { c.fillStyle = radial(x - r * 0.36, y - r * 0.42, 0, r * 1.72, [[0, 'rgba(0,0,10,0)'], [0.42, 'rgba(0,0,10,.06)'], [0.72, 'rgba(0,0,10,.5)'], [1, 'rgba(0,0,10,.9)']]); c.fillRect(x - r, y - r, r * 2, r * 2); };
  function moon({ x, y, r = 60, seed = 9 }) {
    scoped(() => {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      c.fillStyle = grad(x - r, y - r, x + r, y + r, [[0, '#d9d6cf'], [1, '#a7a39b']]); c.fillRect(x - r, y - r, r * 2, r * 2);
      const q = rng(seed);
      for (let i = 0; i < 7; i++) { const a = q() * TAU, d = q() * r * 0.85, cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, rr = r * (0.18 + q() * 0.3); c.fillStyle = 'rgba(95,94,98,.32)'; c.beginPath(); c.ellipse(cx, cy, rr, rr * 0.8, a, 0, TAU); c.fill(); }
      for (let i = 0; i < 26; i++) { const a = q() * TAU, d = Math.sqrt(q()) * r, cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, rr = r * (0.02 + q() * q() * 0.1); c.fillStyle = 'rgba(70,68,70,.55)'; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,250,.55)'; c.beginPath(); c.arc(cx + rr * 0.28, cy + rr * 0.28, rr * 0.82, 0, TAU); c.globalCompositeOperation = 'source-atop'; c.fill(); c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(95,92,92,.75)'; c.beginPath(); c.arc(cx, cy, rr * 0.8, 0, TAU); c.fill(); }
      bodyShade(x, y, r);
    });
  }
  const PLANETS = {
    mars: { bands: ['#c9683a', '#b5552c', '#d2794a', '#a84a26', '#c9683a'], warp: 0.2, cap: true }, jupiter: { bands: ['#d8b98d', '#b07a50', '#ecd7b4', '#a9683f', '#efe0c4', '#b8835a', '#dcc29a'], warp: 0.03, spot: true },
    venus: { bands: ['#e8d4a2', '#d9bd85', '#f0e0b8', '#d4b67c'], warp: 0.12 }, neptune: { bands: ['#3b64d6', '#2f53bd', '#4d7be6', '#2a48a8'], warp: 0.05 }, uranus: { bands: ['#a8e0e4', '#94d3d8', '#b9e9ec'], warp: 0.02 }, mercury: { bands: ['#a9a39a', '#8f8a82', '#b7b1a7'], warp: 0.3 }, saturn: { bands: ['#e4cf9d', '#c8a96e', '#efe0b7', '#bd9a5e', '#e8d6a8'], warp: 0.02, rings: true },
  };
  function planet({ x, y, r = 80, kind = 'mars', seed = 3, rot = 0 }) {
    if (kind === 'moon') return moon({ x, y, r, seed });
    if (kind === 'earth') return earth({ x, y, r, rot });
    if (kind === 'sun') return sun({ x, y, r });
    const P = PLANETS[kind] || PLANETS.mars;
    const ringArt = (front) => { if (!P.rings) return; scoped(() => { c.translate(x, y); c.rotate(-0.28); c.beginPath(); if (front) c.rect(-r * 3, 0, r * 6, r * 3); else c.rect(-r * 3, -r * 3, r * 6, r * 3); c.clip(); for (let i = 0; i < 9; i++) { const k = i / 8; c.strokeStyle = `rgba(${i % 3 === 1 ? '150,120,80' : '228,208,160'},${i === 5 ? 0.15 : 0.72})`; c.lineWidth = r * 0.07; c.beginPath(); c.ellipse(0, 0, r * (1.3 + k * 0.85), r * (1.3 + k * 0.85) * 0.28, 0, 0, TAU); c.stroke(); } }); };
    ringArt(false);
    scoped(() => {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      c.translate(x, y); c.rotate(-0.28);
      const n = rng(seed), rows = 28, h = (r * 2) / rows;
      for (let i = 0; i < rows; i++) { const k = (i / (rows - 1)) * (P.bands.length - 1), a = Math.floor(k), col = mix(P.bands[a], P.bands[Math.min(a + 1, P.bands.length - 1)], k - a); c.fillStyle = col; c.fillRect(-r * 1.1, -r + i * h - 0.5, r * 2.2, h + 1); }
      for (let i = 0; i < 40; i++) { const px = ((n() + rot * 0.05) % 1) * r * 2.2 - r * 1.1, py = (n() - 0.5) * r * 2; c.fillStyle = `rgba(${n() < 0.5 ? '255,255,255' : '40,20,10'},${0.05 + n() * 0.09})`; c.beginPath(); c.ellipse(px, py, r * (0.1 + n() * 0.35), r * (0.015 + P.warp * n() * 0.3), 0, 0, TAU); c.fill(); }
      if (P.spot) { c.fillStyle = '#b4532f'; c.beginPath(); c.ellipse(r * 0.28, r * 0.28, r * 0.2, r * 0.11, 0, 0, TAU); c.fill(); }
      if (P.cap) { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(0, -r * 0.97, r * 0.4, r * 0.11, 0, 0, TAU); c.fill(); }
      c.setTransform(c.getTransform()); c.rotate(0.28); c.translate(-x, -y);
      bodyShade(x, y, r);
    });
    ringArt(true);
  }

  // ---- Ball, with seams that are real curves on a sphere so spin reads ----
  const seamsBasket = (() => {
    const lines = [];
    const ring = (fn) => { const pts = []; for (let i = 0; i <= 64; i++) pts.push(fn((i / 64) * TAU)); lines.push(pts); };
    ring((a) => [Math.cos(a), 0, Math.sin(a)]);
    ring((a) => [0, Math.cos(a), Math.sin(a)]);
    for (const s of [-1, 1]) ring((a) => { const y = Math.cos(a), z = Math.sin(a), x = s * (0.72 - 0.34 * z * z - 0.0 * y); const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; });
    return lines;
  })();
  function ball({ x, y, r = 30, spin = 0, kind = 'basketball', tilt = 0.5 }) {
    const P = { basketball: ['#f28a30', '#c9581a', '#6b2c0c', '#201209'], soccer: ['#fbfaf5', '#d5d2c8', '#6d6a64', '#16161a'], tennis: ['#d9e64b', '#a9bb2c', '#58641a', '#f5f5ea'], plain: ['#e8574a', '#b43127', '#5f1610', '#7c211a'] }[kind] || ['#f28a30', '#c9581a', '#6b2c0c', '#201209'];
    scoped(() => {
      c.fillStyle = radial(x, y, r * 0.05, r * 1.04, [[0, lighten(P[0], 0.28)], [0.42, P[0]], [0.82, P[1]], [1, P[2]]], x - r * 0.38, y - r * 0.42);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
      const cs = Math.cos(spin), ss = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
      const pr = ([a, b, d]) => { const a1 = a * cs - b * ss, b1 = a * ss + b * cs, b2 = b1 * ct - d * st, d2 = b1 * st + d * ct; return [a1, b2, d2]; };
      c.strokeStyle = P[3]; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = Math.max(1.2, r * 0.055);
      for (const line of seamsBasket) { c.beginPath(); let pen = false; for (const pt of line) { const q = pr(pt); if (q[2] > -0.02) { const sx = x + q[0] * r, sy = y + q[1] * r; if (pen) c.lineTo(sx, sy); else { c.moveTo(sx, sy); pen = true; } } else pen = false; } c.stroke(); }
      c.fillStyle = radial(x + r * 0.2, y + r * 0.24, r * 0.4, r * 1.2, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,.2)'], [1, 'rgba(0,0,0,.55)']], x - r * 0.3, y - r * 0.34);
      c.fillRect(x - r, y - r, r * 2, r * 2);
      c.fillStyle = radial(x - r * 0.38, y - r * 0.44, 0, r * 0.5, [[0, 'rgba(255,255,255,.62)'], [1, 'rgba(255,255,255,0)']]);
      c.fillRect(x - r, y - r, r * 2, r * 2);
      c.strokeStyle = 'rgba(255,240,215,.5)'; c.lineWidth = Math.max(1, r * 0.04); c.beginPath(); c.arc(x, y, r - c.lineWidth * 0.5, 2.6, 4.1); c.stroke();
      c.restore();
    });
  }

  // ---- Hand and person ----
  function hand({ x, y, s = 40, angle = 0, skin = '#d9a07a', flip = 1 }) {
    scoped(() => {
      c.translate(x, y); c.rotate(angle); c.scale(s * flip, s);
      c.lineJoin = 'round';
      c.beginPath(); c.moveTo(-1.15, -0.38); c.quadraticCurveTo(-0.5, -0.5, 0.05, -0.3); c.quadraticCurveTo(0.6, -0.16, 1.2, -0.52); c.quadraticCurveTo(1.52, -0.68, 1.56, -0.42); c.quadraticCurveTo(1.42, 0.06, 0.76, 0.22); c.quadraticCurveTo(0, 0.46, -1.15, 0.36); c.closePath();
      c.fillStyle = grad(0, -0.6, 0, 0.5, [[0, lighten(skin, 0.2)], [0.55, skin], [1, darken(skin, 0.24)]]); c.fill();
      c.strokeStyle = alpha(darken(skin, 0.45), 0.7); c.lineWidth = 0.035; c.stroke();
      c.lineWidth = 0.028; c.strokeStyle = alpha(darken(skin, 0.45), 0.55);
      for (const k of [0, 0.13, 0.26]) { c.beginPath(); c.moveTo(0.42 + k, -0.15 - k * 0.5); c.quadraticCurveTo(0.76 + k, -0.1 - k * 0.45, 1.26 + k * 0.5, -0.36 + k * 0.5); c.stroke(); }
      c.beginPath(); c.moveTo(-0.34, -0.18); c.quadraticCurveTo(-0.08, -0.74, 0.44, -0.8); c.quadraticCurveTo(0.68, -0.8, 0.56, -0.58); c.quadraticCurveTo(0.26, -0.44, 0.1, -0.12); c.closePath();
      c.fillStyle = grad(0, -0.8, 0, -0.1, [[0, lighten(skin, 0.14)], [1, darken(skin, 0.08)]]); c.fill(); c.strokeStyle = alpha(darken(skin, 0.45), 0.7); c.lineWidth = 0.03; c.stroke();
    });
  }
  const limb = (pts, w0, w1, col, light) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], k0 = i / (pts.length - 1), k1 = (i + 1) / (pts.length - 1), wa = lerp(w0, w1, k0), wb = lerp(w0, w1, k1), dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      c.fillStyle = grad(a[0] + nx * wa, a[1] + ny * wa, a[0] - nx * wa, a[1] - ny * wa, [[0, darken(col, 0.3)], [0.5, col], [0.84, light || lighten(col, 0.2)], [1, col]]);
      c.beginPath(); c.moveTo(a[0] + nx * wa, a[1] + ny * wa); c.lineTo(b[0] + nx * wb, b[1] + ny * wb); c.lineTo(b[0] - nx * wb, b[1] - ny * wb); c.lineTo(a[0] - nx * wa, a[1] - ny * wa); c.closePath(); c.fill();
      c.beginPath(); c.arc(b[0], b[1], wb, 0, TAU); c.fill();
      if (i === 0) { c.beginPath(); c.arc(a[0], a[1], wa, 0, TAU); c.fill(); }
    }
  };
  // Feet at x, y. Pass reach to bend the near arm so the palm sits exactly at that point. Returns the palm point.
  function person({ x, y, h = 300, face = 1, reach, look = 0, skin = '#d9a07a', shirt = '#2f6fb0', pants = '#2c3442', hair = '#2b1d14', shoe = '#e9e4da', handOpen = true }) {
    const u = h / 7.4;
    return scoped(() => {
      const hip = [x, y - h * 0.5], neck = [x, y - h * 0.83], kneeF = [x + face * u * 0.28, y - h * 0.26], footF = [x + face * u * 0.36, y - u * 0.24], kneeB = [x - face * u * 0.12, y - h * 0.26], footB = [x - face * u * 0.34, y - u * 0.24];
      shadow({ x: x + 10, y: y + 2, rx: h * 0.3, ry: h * 0.035, alpha: 0.42 });
      const shoulderB = [x - face * u * 0.55, neck[1] + u * 0.2];
      limb([shoulderB, [shoulderB[0] - face * u * 0.2, shoulderB[1] + h * 0.14], [shoulderB[0] - face * u * 0.1, shoulderB[1] + h * 0.28]], u * 0.17, u * 0.12, darken(shirt, 0.22));
      c.fillStyle = darken(skin, 0.15); c.beginPath(); c.arc(shoulderB[0] - face * u * 0.1, shoulderB[1] + h * 0.3, u * 0.17, 0, TAU); c.fill();
      limb([[hip[0] - face * u * 0.2, hip[1]], kneeB, footB], u * 0.3, u * 0.17, darken(pants, 0.2));
      limb([[hip[0] + face * u * 0.2, hip[1]], kneeF, footF], u * 0.31, u * 0.17, pants);
      const shoeArt = (fx, tone) => { c.fillStyle = grad(0, y - u * 0.4, 0, y, [[0, tone], [1, darken(tone, 0.3)]]); c.beginPath(); c.moveTo(fx - face * u * 0.24, y - u * 0.36); c.quadraticCurveTo(fx + face * u * 0.18, y - u * 0.38, fx + face * u * 0.3, y - u * 0.18); c.quadraticCurveTo(fx + face * u * 0.62, y - u * 0.14, fx + face * u * 0.6, y); c.lineTo(fx - face * u * 0.28, y); c.closePath(); c.fill(); c.fillStyle = darken(tone, 0.55); c.fillRect(Math.min(fx - face * u * 0.28, fx + face * u * 0.6), y - u * 0.06, u * 0.88, u * 0.06); };
      shoeArt(footB[0], darken(shoe, 0.15)); shoeArt(footF[0], shoe);
      const sw = u * 0.82, hw = u * 0.58;
      c.beginPath(); c.moveTo(x - sw * 0.5, neck[1] - u * 0.04); c.lineTo(x + sw * 0.5, neck[1] - u * 0.04); c.quadraticCurveTo(x + sw * 1.04, neck[1], x + sw * 1.02, neck[1] + u * 0.42); c.quadraticCurveTo(x + sw * 0.96, hip[1] - h * 0.12, x + hw, hip[1] + u * 0.14); c.lineTo(x - hw, hip[1] + u * 0.14); c.quadraticCurveTo(x - sw * 0.96, hip[1] - h * 0.12, x - sw * 1.02, neck[1] + u * 0.42); c.quadraticCurveTo(x - sw * 1.04, neck[1], x - sw * 0.5, neck[1] - u * 0.04); c.closePath();
      c.fillStyle = grad(x - sw, 0, x + sw, 0, [[0, face > 0 ? darken(shirt, 0.32) : lighten(shirt, 0.16)], [0.4, shirt], [0.7, lighten(shirt, 0.1)], [1, face > 0 ? lighten(shirt, 0.22) : darken(shirt, 0.3)]]); c.fill();
      c.fillStyle = alpha(darken(pants, 0.35), 1); c.fillRect(x - hw, hip[1] + u * 0.04, hw * 2, u * 0.13);
      c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + face * u * 0.1, neck[1] + u * 0.4); c.quadraticCurveTo(x + face * u * 0.32, hip[1] - h * 0.1, x + face * u * 0.08, hip[1]); c.stroke();
      c.fillStyle = darken(skin, 0.14); c.fillRect(x - u * 0.17, neck[1] - u * 0.3, u * 0.34, u * 0.42);
      scoped(() => {
        const hy = neck[1] - u * 0.62; c.translate(x, hy); c.rotate(-face * look); c.scale(face, 1);
        c.fillStyle = radial(u * 0.05, 0, u * 0.1, u * 0.62, [[0, lighten(skin, 0.2)], [0.65, skin], [1, darken(skin, 0.2)]], u * 0.14, -u * 0.14); c.beginPath(); c.ellipse(0, 0, u * 0.45, u * 0.53, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(u * 0.43, -u * 0.08); c.quadraticCurveTo(u * 0.58, u * 0.04, u * 0.42, u * 0.08); c.fillStyle = skin; c.fill();
        c.fillStyle = hair; c.beginPath(); c.moveTo(-u * 0.5, u * 0.12); c.quadraticCurveTo(-u * 0.6, -u * 0.62, u * 0.08, -u * 0.6); c.quadraticCurveTo(u * 0.48, -u * 0.56, u * 0.47, -u * 0.18); c.quadraticCurveTo(u * 0.18, -u * 0.34, -u * 0.08, -u * 0.24); c.quadraticCurveTo(-u * 0.2, -u * 0.02, -u * 0.26, u * 0.14); c.closePath(); c.fill();
        c.fillStyle = darken(skin, 0.1); c.beginPath(); c.ellipse(-u * 0.14, u * 0.02, u * 0.08, u * 0.12, 0, 0, TAU); c.fill();
        c.fillStyle = '#20150e'; c.beginPath(); c.ellipse(u * 0.27, -u * 0.05, u * 0.042, u * 0.058, 0, 0, TAU); c.fill();
        c.strokeStyle = alpha(darken(skin, 0.6), 0.8); c.lineWidth = u * 0.03; c.lineCap = 'round'; c.beginPath(); c.moveTo(u * 0.16, u * 0.26); c.quadraticCurveTo(u * 0.28, u * 0.32, u * 0.36, u * 0.23); c.stroke();
      });
      const shoulder = [x + face * u * 0.56, neck[1] + u * 0.22], upper = h * 0.17, fore = h * 0.16;
      const tgt = reach ? [reach.x - face * u * 0.42, reach.y + u * 0.08] : [shoulder[0] + face * u * 0.2, shoulder[1] + h * 0.3];
      const dx = tgt[0] - shoulder[0], dy = tgt[1] - shoulder[1], dist = clamp(Math.hypot(dx, dy), 1, upper + fore - 0.5), baseA = Math.atan2(dy, dx), bend = Math.acos(clamp((upper * upper + dist * dist - fore * fore) / (2 * upper * dist), -1, 1));
      const ea = baseA + face * bend, elbow = [shoulder[0] + Math.cos(ea) * upper, shoulder[1] + Math.sin(ea) * upper], wrist = [shoulder[0] + (dx / Math.hypot(dx, dy)) * dist, shoulder[1] + (dy / Math.hypot(dx, dy)) * dist];
      limb([shoulder, elbow], u * 0.21, u * 0.15, lighten(shirt, 0.04));
      limb([elbow, wrist], u * 0.13, u * 0.1, skin);
      const palm = { x: wrist[0] + face * u * 0.42, y: wrist[1] - u * 0.08 };
      if (handOpen) hand({ x: palm.x, y: palm.y + u * 0.08, s: u * 0.42, angle: 0, skin, flip: face });
      return { hand: palm, shoulder: { x: shoulder[0], y: shoulder[1] } };
    });
  }

  // ---- Gears with a real involute profile ----
  const inv = (a) => Math.tan(a) - a;
  // shift moves teeth outward on a small gear and inward on its large mate, keeping the centre distance, so a 10 tooth pinion is not undercut.
  function gearOutline({ teeth: z, module: m, shift = 0, backlash = 0.05, angle = 0, pressure = (20 * PI) / 180 }) {
    const rp = (m * z) / 2, rb = rp * Math.cos(pressure), ra = rp + m * (0.85 + shift), rf = Math.min(rp - m * (1.1 - shift), rb - 0.06 * m), s = m * (PI / 2 + 2 * shift * Math.tan(pressure) - backlash), pitch = TAU / z, pts = [];
    const half0 = s / (2 * rp) + inv(pressure);
    const half = (r) => { if (r < rb) { const k = (rb - r) / (rb - rf); return half0 * (1 + 0.4 * k * k); } const ar = Math.acos(rb / r); return half0 - inv(ar); };
    const N = 7;
    for (let i = 0; i < z; i++) {
      const a0 = angle + i * pitch, tipH = half(ra), rootH = half(rf);
      const rise = [];
      for (let k = 0; k < 4; k++) { const r = lerp(rf, rb, k / 4); rise.push([r, half(r)]); }
      for (let k = 0; k <= N; k++) { const r = lerp(rb, ra, k / N); rise.push([r, half(r)]); }
      for (const [r, h] of rise) pts.push([Math.cos(a0 - h) * r, Math.sin(a0 - h) * r]);
      for (let k = 1; k < 4; k++) { const b = a0 + lerp(-tipH, tipH, k / 4); pts.push([Math.cos(b) * ra, Math.sin(b) * ra]); }
      for (let j = rise.length - 1; j >= 0; j--) { const [r, h] = rise[j]; pts.push([Math.cos(a0 + h) * r, Math.sin(a0 + h) * r]); }
      const next = a0 + pitch, g0 = a0 + rootH, g1 = next - rootH;
      for (let k = 1; k < 5; k++) { const b = lerp(g0, g1, k / 5); pts.push([Math.cos(b) * rf, Math.sin(b) * rf]); }
    }
    return { pts, rp, ra, rf, rb, pitch };
  }
  function gear({ x, y, teeth, module: m = 20, angle = 0, shift = 0, backlash = 0.05, color = '#aeb6c2', spokes = 5, bore = 0.2, mark = true, markColor = '#e4572e', lit = null, litColor = '#ffb020', shadow: sh = true }) {
    const G = gearOutline({ teeth, module: m, shift, backlash, angle }), { pts, rf, ra, rp } = G;
    const trace = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
    scoped(() => {
      c.translate(x, y);
      if (sh) scoped(() => { c.translate(5, 9); trace(); c.fillStyle = 'rgba(0,0,0,.2)'; c.fill(); });
      trace();
      c.fillStyle = grad(-ra * 0.8, -ra, ra * 0.8, ra, [[0, lighten(color, 0.2)], [0.3, color], [0.55, darken(color, 0.16)], [0.8, darken(color, 0.38)], [1, darken(color, 0.16)]]);
      c.fill();
      if (lit) {
        scoped(() => {
          trace(); c.clip();
          for (const [idx, k] of lit) {
            if (k <= 0) continue;
            const a = angle + idx * G.pitch, w = G.pitch * 0.5;
            c.fillStyle = alpha(litColor, 0.92 * k); c.beginPath(); c.moveTo(Math.cos(a - w) * rf, Math.sin(a - w) * rf); c.lineTo(Math.cos(a - w) * ra * 1.1, Math.sin(a - w) * ra * 1.1); c.lineTo(Math.cos(a + w) * ra * 1.1, Math.sin(a + w) * ra * 1.1); c.lineTo(Math.cos(a + w) * rf, Math.sin(a + w) * rf); c.closePath(); c.fill();
          }
        });
      }
      if (mark) scoped(() => {
        trace(); c.clip();
        const a = angle, w = G.pitch * 0.5; c.fillStyle = markColor; c.beginPath(); c.moveTo(Math.cos(a - w) * rf, Math.sin(a - w) * rf); c.lineTo(Math.cos(a - w) * ra * 1.1, Math.sin(a - w) * ra * 1.1); c.lineTo(Math.cos(a + w) * ra * 1.1, Math.sin(a + w) * ra * 1.1); c.lineTo(Math.cos(a + w) * rf, Math.sin(a + w) * rf); c.closePath(); c.fill();
      });
      trace(); c.lineJoin = 'round';
      c.strokeStyle = grad(-ra, -ra, ra, ra, [[0, 'rgba(60,60,66,.75)'], [0.45, 'rgba(40,40,46,.6)'], [1, 'rgba(0,0,0,.8)']]); c.lineWidth = 1.8; c.stroke();
      const rimIn = rf - m * 0.5, rimOut = rf - m * 0.08;
      c.beginPath(); c.arc(0, 0, rimOut, 0, TAU);
      c.strokeStyle = grad(-rimOut, -rimOut, rimOut, rimOut, [[0, 'rgba(255,255,255,.55)'], [1, 'rgba(0,0,0,.42)']]); c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(0, 0, rimIn, 0, TAU);
      c.fillStyle = grad(-rimIn, -rimIn, rimIn, rimIn, [[0, darken(color, 0.34)], [0.5, darken(color, 0.16)], [1, lighten(color, 0.16)]]); c.fill();
      if (c.createConicGradient) { const cg = c.createConicGradient(-0.7, 0, 0); for (const [o, q] of [[0, 'rgba(255,255,255,.34)'], [0.12, 'rgba(255,255,255,0)'], [0.25, 'rgba(0,0,0,.14)'], [0.38, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,.28)'], [0.62, 'rgba(255,255,255,0)'], [0.75, 'rgba(0,0,0,.14)'], [0.88, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.34)']]) cg.addColorStop(o, q); c.fillStyle = cg; c.fill(); }
      c.strokeStyle = grad(-rimIn, -rimIn, rimIn, rimIn, [[0, 'rgba(0,0,0,.6)'], [1, 'rgba(255,255,255,.65)']]); c.lineWidth = 2.5; c.stroke();
      const hub = Math.max(m * 1.6, rimIn * 0.36);
      if (spokes > 0) {
        for (let i = 0; i < spokes; i++) {
          const a = angle + (i + 0.5) * (TAU / spokes), span = (TAU / spokes) * 0.34, r0 = hub + m * 0.4, r1 = rimIn - m * 0.36;
          if (r1 - r0 < m * 0.4) continue;
          const holeR = (r1 - r0) / 2, rc = (r0 + r1) / 2, cx = Math.cos(a) * rc, cy = Math.sin(a) * rc;
          c.save(); c.translate(cx, cy);
          c.beginPath(); c.arc(0, 0, Math.min(holeR, rc * Math.sin(span)), 0, TAU); c.clip();
          c.fillStyle = grad(-holeR, -holeR, holeR, holeR, [[0, mix(paper, '#000000', 0.62)], [0.5, mix(paper, '#000000', 0.2)], [1, paper]]); c.fillRect(-holeR, -holeR, holeR * 2, holeR * 2);
          c.restore();
          c.beginPath(); c.arc(cx, cy, Math.min(holeR, rc * Math.sin(span)), 0, TAU);
          c.strokeStyle = grad(cx - holeR, cy - holeR, cx + holeR, cy + holeR, [[0, 'rgba(0,0,0,.55)'], [1, 'rgba(255,255,255,.7)']]); c.lineWidth = 2; c.stroke();
        }
      }
      c.beginPath(); c.arc(0, 0, hub, 0, TAU);
      c.fillStyle = radial(0, 0, hub * 0.2, hub, [[0, lighten(color, 0.42)], [0.7, lighten(color, 0.1)], [1, darken(color, 0.22)]], -hub * 0.3, -hub * 0.36); c.fill();
      c.strokeStyle = grad(-hub, -hub, hub, hub, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(0,0,0,.5)']]); c.lineWidth = 2; c.stroke();
      const br = hub * bore * 2;
      c.beginPath(); c.arc(0, 0, br, 0, TAU); c.fillStyle = '#16171c'; c.fill();
      c.strokeStyle = grad(-br, -br, br, br, [[0, 'rgba(0,0,0,.8)'], [1, 'rgba(255,255,255,.75)']]); c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#16171c'; scoped(() => { c.rotate(angle + PI); c.fillRect(br - 2, -br * 0.28, br * 0.45, br * 0.56); });
      if (mark) { c.strokeStyle = markColor; c.lineWidth = m * 0.28; c.lineCap = 'round'; c.beginPath(); c.moveTo(Math.cos(angle) * (hub + 3), Math.sin(angle) * (hub + 3)); c.lineTo(Math.cos(angle) * (rimIn - 1), Math.sin(angle) * (rimIn - 1)); c.stroke(); }
      for (let i = 0; i < 6; i++) { const a = angle + (i * TAU) / 6 + 0.3; const bx = Math.cos(a) * hub * 0.74, by = Math.sin(a) * hub * 0.74, br2 = hub * 0.075; c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.arc(bx, by, br2, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(bx - 0.5, by - 0.5, br2 * 0.5, 0, TAU); c.fill(); }
    });
    return G;
  }

  // ---- Bicycle. Geometry in wheel radii, rear axle at the origin, x forward, y down. ----
  const BIKE = { wb: 2.94, bb: [1.22, 0.2], st: [0.78, -1.26], tt: [0.81, -1.17], ht0: [2.42, -1.34], ht1: [2.54, -1.0], ax: [2.94, 0], seat: [0.68, -1.56], stem: [2.37, -1.52], crank: 0.5, ring: 0.3 };
  const tube = (a, b, w, col) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
    const hl = ny < 0 ? 1 : -1;
    c.lineCap = 'round';
    c.strokeStyle = darken(col, 0.42); c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    c.strokeStyle = col; c.lineWidth = w * 0.8; c.beginPath(); c.moveTo(a[0] + nx * hl * w * 0.08, a[1] + ny * hl * w * 0.08); c.lineTo(b[0] + nx * hl * w * 0.08, b[1] + ny * hl * w * 0.08); c.stroke();
    c.strokeStyle = lighten(col, 0.55); c.lineWidth = w * 0.2; c.beginPath(); c.moveTo(a[0] + nx * hl * w * 0.24, a[1] + ny * hl * w * 0.24); c.lineTo(b[0] + nx * hl * w * 0.24, b[1] + ny * hl * w * 0.24); c.stroke();
  };
  function wheelArt(x, y, R, angle, o = {}) {
    const tireW = R * 0.085, rimR = R - tireW * 1.06, hubR = R * 0.075;
    scoped(() => {
      c.translate(x, y);
      c.beginPath(); c.arc(0, 0, R - tireW / 2, 0, TAU); c.lineWidth = tireW; c.strokeStyle = grad(-R, -R, R, R, [[0, '#4a4b50'], [0.5, '#232327'], [1, '#121216']]); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1.5;
      const nT = 64; for (let i = 0; i < nT; i++) { const a = angle + (i / nT) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3)); c.lineTo(Math.cos(a) * (R - 0.4), Math.sin(a) * (R - 0.4)); c.stroke(); }
      c.beginPath(); c.arc(0, 0, rimR, 0, TAU); c.lineWidth = R * 0.036; c.strokeStyle = grad(-R, -R, R, R, [[0, '#f6f7f8'], [0.45, '#a9adb4'], [1, '#6a6e76']]); c.stroke();
      c.lineWidth = Math.max(0.9, R * 0.0085); const nS = 28;
      for (let i = 0; i < nS; i++) {
        const lace = i % 2 ? 1 : -1, a = angle + (i / nS) * TAU, a0 = a + lace * 0.42;
        c.strokeStyle = i % 2 ? 'rgba(205,208,214,.95)' : 'rgba(170,174,182,.95)';
        c.beginPath(); c.moveTo(Math.cos(a0) * hubR, Math.sin(a0) * hubR); c.lineTo(Math.cos(a) * (rimR - 1), Math.sin(a) * (rimR - 1)); c.stroke();
      }
      c.strokeStyle = o.spokeColor || '#e4572e'; c.lineWidth = Math.max(2.4, R * 0.024); c.lineCap = 'round';
      c.beginPath(); c.moveTo(Math.cos(angle) * hubR, Math.sin(angle) * hubR); c.lineTo(Math.cos(angle) * (rimR - 1), Math.sin(angle) * (rimR - 1)); c.stroke();
      c.fillStyle = radial(0, 0, 0, hubR, [[0, '#f4f5f7'], [0.6, '#9fa3ab'], [1, '#55585f']], -hubR * 0.3, -hubR * 0.3); c.beginPath(); c.arc(0, 0, hubR, 0, TAU); c.fill();
      c.fillStyle = '#2b2c30'; c.beginPath(); c.arc(0, 0, hubR * 0.32, 0, TAU); c.fill();
    });
  }
  function sprocketArt(x, y, r, teeth, angle, col, o = {}) {
    const tH = o.toothH ?? Math.max(2.6, r * 0.09), a2 = TAU / teeth;
    scoped(() => {
      c.translate(x, y);
      c.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a = angle + i * a2;
        const pts = [[r - tH * 0.55, a - a2 * 0.5], [r - tH * 0.55, a - a2 * 0.28], [r + tH, a - a2 * 0.12], [r + tH, a + a2 * 0.12], [r - tH * 0.55, a + a2 * 0.28]];
        for (const [rr, b] of pts) c.lineTo(Math.cos(b) * rr, Math.sin(b) * rr);
      }
      c.closePath();
      c.fillStyle = grad(-r, -r, r, r, [[0, lighten(col, 0.45)], [0.5, col], [1, darken(col, 0.4)]]); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.8; c.stroke();
      if (o.arms) {
        const nA = 5, inner = r * 0.74;
        scoped(() => {
          c.beginPath(); c.arc(0, 0, inner, 0, TAU); c.clip();
          c.fillStyle = o.backColor || 'rgba(0,0,0,0)';
          for (let i = 0; i < nA; i++) {
            const a0 = angle + (i / nA) * TAU + 0.16, a1 = angle + ((i + 1) / nA) * TAU - 0.16, r0 = inner * 0.36;
            c.save(); c.globalCompositeOperation = 'source-over'; c.beginPath(); c.arc(0, 0, inner, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.closePath(); c.fillStyle = o.holeColor || 'rgba(16,18,24,.78)'; c.fill(); c.restore();
          }
        });
      }
      c.beginPath(); c.arc(0, 0, r * (o.arms ? 0.3 : 0.45), 0, TAU); c.fillStyle = radial(0, 0, 0, r * 0.45, [[0, '#eff1f4'], [1, '#6e727a']], -r * 0.1, -r * 0.1); c.fill();
    });
  }
  function chainLoop(rearX, rearY, rs, ringX, ringY, rc) {
    const d = Math.hypot(ringX - rearX, ringY - rearY), base = Math.atan2(ringY - rearY, ringX - rearX), off = Math.asin((rc - rs) / d);
    const topA = base - PI / 2 - off, botA = base + PI / 2 + off;
    const top0 = [rearX + Math.cos(topA) * rs, rearY + Math.sin(topA) * rs], top1 = [ringX + Math.cos(topA) * rc, ringY + Math.sin(topA) * rc], bot1 = [ringX + Math.cos(botA) * rc, ringY + Math.sin(botA) * rc], bot0 = [rearX + Math.cos(botA) * rs, rearY + Math.sin(botA) * rs];
    const ringSweep = ((botA - topA) % TAU + TAU) % TAU, rearSweep = ((topA - botA) % TAU + TAU) % TAU;
    const len1 = Math.hypot(top1[0] - top0[0], top1[1] - top0[1]), len2 = rc * ringSweep, len3 = Math.hypot(bot0[0] - bot1[0], bot0[1] - bot1[1]), len4 = rs * rearSweep, total = len1 + len2 + len3 + len4;
    // Arc length runs clockwise on screen: along the top from cog to ring, round the ring, back along the bottom, round the cog.
    const at = (s) => {
      s = ((s % total) + total) % total;
      if (s < len1) { const k = s / len1; return [lerp(top0[0], top1[0], k), lerp(top0[1], top1[1], k), Math.atan2(top1[1] - top0[1], top1[0] - top0[0])]; }
      s -= len1;
      if (s < len2) { const a = topA + s / rc; return [ringX + Math.cos(a) * rc, ringY + Math.sin(a) * rc, a + PI / 2]; }
      s -= len2;
      if (s < len3) { const k = s / len3; return [lerp(bot1[0], bot0[0], k), lerp(bot1[1], bot0[1], k), Math.atan2(bot0[1] - bot1[1], bot0[0] - bot1[0])]; }
      s -= len3;
      const a = botA + s / rs; return [rearX + Math.cos(a) * rs, rearY + Math.sin(a) * rs, a + PI / 2];
    };
    return { at, total, top0, top1, bot0, bot1, topA, botA };
  }
  // x, y: ground point under the rear axle. wheel: rear wheel angle. crank: crank angle. Both clockwise positive. Returns the points a scene needs to attach labels and arrows.
  function bicycle({ x, y, R = 130, wheel = 0, frontWheel, crank = 0, ringTeeth = 36, cogTeeth = 12, frame = '#c8362a', chainGlow = 0, chainHot = '#ffb020', foot = 0, showRider = false, cog = null }) {
    const ax = [x, y - R], pt = (q) => [ax[0] + q[0] * R, ax[1] + q[1] * R], bb = pt(BIKE.bb), st = pt(BIKE.st), tt = pt(BIKE.tt), ht0 = pt(BIKE.ht0), ht1 = pt(BIKE.ht1), axF = pt(BIKE.ax), seat = pt(BIKE.seat), stem = pt(BIKE.stem);
    const rc = BIKE.ring * R, rs = (rc * cogTeeth) / ringTeeth, w = R * 0.066, cogA = cog ?? wheel;
    const fw = frontWheel ?? wheel, crankLen = BIKE.crank * R;
    const pedalAt = (a) => [bb[0] + Math.cos(a) * crankLen, bb[1] + Math.sin(a) * crankLen];
    const nearA = crank, farA = crank + PI, pedalN = pedalAt(nearA), pedalF = pedalAt(farA);
    return scoped(() => {
      shadow({ x: ax[0], y: y + 3, rx: R * 1.08, ry: R * 0.09, alpha: 0.5 }); shadow({ x: axF[0], y: y + 3, rx: R * 1.08, ry: R * 0.09, alpha: 0.5 });
      shadow({ x: (ax[0] + axF[0]) / 2, y: y + 5, rx: R * 1.9, ry: R * 0.11, alpha: 0.24 });
      // Far crank and pedal, then wheels, sit behind the frame.
      c.strokeStyle = '#55585f'; c.lineCap = 'round'; c.lineWidth = R * 0.05; c.beginPath(); c.moveTo(bb[0], bb[1]); c.lineTo(pedalF[0], pedalF[1]); c.stroke();
      scoped(() => { c.fillStyle = '#2d2e33'; roundRect(pedalF[0] - R * 0.15, pedalF[1] - R * 0.027, R * 0.3, R * 0.054, 2); c.fill(); });
      wheelArt(ax[0], ax[1], R, wheel); wheelArt(axF[0], axF[1], R, fw);
      tube(ax, tt, w * 0.56, frame); tube(ax, bb, w * 0.66, frame);
      tube(tt, ht0, w * 0.92, frame); tube(ht1, bb, w * 1.12, frame); tube(bb, st, w * 0.96, frame);
      tube(st, seat, w * 0.66, '#b6b9bf');
      tube(ht1, axF, w * 0.76, '#2a2c32');
      tube(ht0, ht1, w * 1.28, frame);
      for (const q of [tt, ht0, ht1]) { c.fillStyle = darken(frame, 0.3); c.beginPath(); c.arc(q[0], q[1], w * 0.64, 0, TAU); c.fill(); c.fillStyle = lighten(frame, 0.35); c.beginPath(); c.arc(q[0] - w * 0.14, q[1] - w * 0.16, w * 0.26, 0, TAU); c.fill(); }
      c.fillStyle = '#26272c'; c.beginPath(); c.arc(bb[0], bb[1], w * 0.98, 0, TAU); c.fill();
      // Saddle
      scoped(() => {
        c.translate(seat[0], seat[1]); const s = R * 0.3;
        c.beginPath(); c.moveTo(-s * 1.0, -s * 0.2); c.quadraticCurveTo(-s * 0.78, -s * 0.46, -s * 0.3, -s * 0.36); c.quadraticCurveTo(s * 0.36, -s * 0.24, s * 1.05, -s * 0.26); c.quadraticCurveTo(s * 1.18, -s * 0.16, s * 1.0, -s * 0.08); c.quadraticCurveTo(s * 0.4, -s * 0.08, s * 0.0, s * 0.1); c.quadraticCurveTo(-s * 0.7, s * 0.12, -s * 1.0, -s * 0.2); c.closePath();
        c.fillStyle = grad(0, -s * 0.46, 0, s * 0.12, [[0, '#5b4a3c'], [0.5, '#2e2520'], [1, '#14100d']]); c.fill();
      });
      // Bars: stem from the head tube, a drop bar running forward and curling back.
      tube(ht0, stem, w * 0.68, '#b6b9bf');
      const barF = [stem[0] + R * 0.14, stem[1] - R * 0.03];
      tube(stem, barF, w * 0.62, '#b6b9bf');
      scoped(() => {
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w * 0.72; c.strokeStyle = '#1d1e22';
        c.beginPath(); c.moveTo(barF[0], barF[1]); c.quadraticCurveTo(barF[0] + R * 0.26, barF[1] - R * 0.02, barF[0] + R * 0.24, barF[1] + R * 0.14); c.quadraticCurveTo(barF[0] + R * 0.22, barF[1] + R * 0.28, barF[0] + R * 0.02, barF[1] + R * 0.24); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = w * 0.16; c.beginPath(); c.moveTo(barF[0], barF[1] - w * 0.16); c.quadraticCurveTo(barF[0] + R * 0.25, barF[1] - R * 0.03, barF[0] + R * 0.22, barF[1] + R * 0.12); c.stroke();
      });
      // Drive side sits nearest the viewer.
      sprocketArt(ax[0], ax[1], rs, cogTeeth, cogA, '#aeb2ba', { toothH: Math.max(2.2, rs * 0.12) });
      const chain = chainLoop(ax[0], ax[1], rs, bb[0], bb[1], rc), pitch = (TAU * rc) / ringTeeth;
      if (chainGlow > 0) {
        c.strokeStyle = alpha(chainHot, 0.5 * chainGlow); c.lineWidth = R * 0.075; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath(); for (let s = 0; s <= chain.total; s += 4) { const q = chain.at(s); if (s === 0) c.moveTo(q[0], q[1]); else c.lineTo(q[0], q[1]); } c.closePath(); c.stroke();
      }
      sprocketArt(bb[0], bb[1], rc, ringTeeth, crank, '#c4c8cf', { arms: true, toothH: Math.max(2.4, rc * 0.075) });
      const nL = 2 * Math.round(chain.total / pitch / 2), step = chain.total / nL, phase = (crank * rc) % (step * 2);
      for (let i = 0; i < nL; i++) {
        const q = chain.at(i * step + phase), odd = i % 2;
        scoped(() => {
          c.translate(q[0], q[1]); c.rotate(q[2]);
          const hl = step * 0.62, hw = R * (odd ? 0.021 : 0.026);
          c.fillStyle = odd ? '#7e828b' : (chainGlow > 0.5 ? mix('#2a2b30', chainHot, 0.55) : '#2a2b30');
          roundRect(-hl, -hw, hl * 2, hw * 2, Math.min(hw, 1.6)); c.fill();
          c.fillStyle = 'rgba(255,255,255,.65)'; c.fillRect(-hl * 0.5, -hw * 0.75, hl, Math.max(0.6, hw * 0.3));
        });
      }
      // Near crank and pedal.
      scoped(() => {
        c.lineCap = 'round'; c.strokeStyle = grad(bb[0], bb[1], pedalN[0], pedalN[1], [[0, '#d9dbdf'], [1, '#8a8e95']]); c.lineWidth = R * 0.07; c.beginPath(); c.moveTo(bb[0], bb[1]); c.lineTo(pedalN[0], pedalN[1]); c.stroke();
        c.fillStyle = '#16171b'; c.beginPath(); c.arc(bb[0], bb[1], R * 0.05, 0, TAU); c.fill();
        c.fillStyle = '#e4572e'; c.beginPath(); c.arc(pedalN[0], pedalN[1], R * 0.035, 0, TAU); c.fill();
      });
      if (foot > 0) scoped(() => {
        c.globalAlpha *= foot; c.translate(pedalN[0], pedalN[1] - R * 0.03); const s = R * 0.34;
        c.fillStyle = grad(0, -s * 3.4, 0, -s * 0.3, [[0, 'rgba(58,74,102,0)'], [0.55, '#3a4a66'], [1, '#2e3a52']]);
        c.beginPath(); c.moveTo(-s * 1.0, -s * 3.4); c.lineTo(-s * 0.56, -s * 0.34); c.lineTo(s * 0.1, -s * 0.34); c.lineTo(-s * 0.2, -s * 3.4); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-s * 0.62, -s * 0.38); c.quadraticCurveTo(s * 0.0, -s * 0.5, s * 0.22, -s * 0.28); c.quadraticCurveTo(s * 0.84, -s * 0.24, s * 0.88, 0); c.lineTo(-s * 0.68, 0); c.closePath();
        c.fillStyle = grad(0, -s * 0.5, 0, 0, [[0, '#f1ece2'], [1, '#b6ad9e']]); c.fill();
        c.fillStyle = '#26221c'; c.fillRect(-s * 0.68, -s * 0.06, s * 1.56, s * 0.06);
        c.globalAlpha = 1;
      });
      scoped(() => { c.fillStyle = '#26272c'; roundRect(pedalN[0] - R * 0.17, pedalN[1] - R * 0.03, R * 0.34, R * 0.06, 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(pedalN[0] - R * 0.15, pedalN[1] - R * 0.024, R * 0.3, R * 0.012); });
      return { rearAxle: { x: ax[0], y: ax[1] }, frontAxle: { x: axF[0], y: axF[1] }, bb: { x: bb[0], y: bb[1] }, pedal: { x: pedalN[0], y: pedalN[1] }, seat: { x: seat[0], y: seat[1] }, bar: { x: barF[0], y: barF[1] }, chainTop: { x: (chain.top0[0] + chain.top1[0]) / 2, y: (chain.top0[1] + chain.top1[1]) / 2 }, chainBottom: { x: (chain.bot0[0] + chain.bot1[0]) / 2, y: (chain.bot0[1] + chain.bot1[1]) / 2 }, contact: { x: ax[0], y }, frontContact: { x: axF[0], y }, ringR: rc, cogR: rs, ratio: ringTeeth / cogTeeth };
    });
  }

  // ---- Chocolate ----
  function chocolate({ x, y, w, h, cols = 4, rows = 1, gap = 0, fill = () => 0, fillColor = '#E9A83A', glow = () => 0, wrapper = false }) {
    const pw = (w - gap * (cols - 1)) / cols, ph = (h - gap * (rows - 1)) / rows;
    shadow({ x: x + w / 2, y: y + h + 8, rx: w * 0.6, ry: 22, alpha: dark ? 0.7 : 0.34 });
    const base = '#5a3220', edge = '#2f170c';
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const px = x + q * (pw + gap), py = y + r * (ph + gap), k = clamp01(fill(q, r)), g = clamp01(glow(q, r));
      const body = mix(base, fillColor, k), hi = mix('#8a553a', lighten(fillColor, 0.5), k), lo = mix('#3a1d11', darken(fillColor, 0.45), k);
      scoped(() => {
        if (g > 0) { c.shadowColor = alpha(fillColor, 0.85 * g); c.shadowBlur = 34 * g * pxScale; }
        roundRect(px, py, pw, ph, 7); c.fillStyle = mix(edge, darken(fillColor, 0.55), k); c.fill();
        c.shadowBlur = 0;
        const b = Math.min(pw, ph) * 0.1, ix = px + b, iy = py + b, iw = pw - b * 2, ih = ph - b * 2;
        c.fillStyle = hi; c.beginPath(); c.moveTo(px + 3, py + 3); c.lineTo(px + pw - 3, py + 3); c.lineTo(ix + iw, iy); c.lineTo(ix, iy); c.closePath(); c.fill();
        c.fillStyle = mix(hi, body, 0.55); c.beginPath(); c.moveTo(px + 3, py + 3); c.lineTo(ix, iy); c.lineTo(ix, iy + ih); c.lineTo(px + 3, py + ph - 3); c.closePath(); c.fill();
        c.fillStyle = lo; c.beginPath(); c.moveTo(px + pw - 3, py + 3); c.lineTo(px + pw - 3, py + ph - 3); c.lineTo(ix + iw, iy + ih); c.lineTo(ix + iw, iy); c.closePath(); c.fill();
        c.fillStyle = mix('#2c150b', darken(fillColor, 0.4), k); c.beginPath(); c.moveTo(px + 3, py + ph - 3); c.lineTo(px + pw - 3, py + ph - 3); c.lineTo(ix + iw, iy + ih); c.lineTo(ix, iy + ih); c.closePath(); c.fill();
        roundRect(ix, iy, iw, ih, 4);
        c.fillStyle = grad(ix, iy, ix + iw, iy + ih, [[0, lighten(body, 0.14)], [0.55, body], [1, darken(body, 0.18)]]); c.fill();
        c.fillStyle = grad(ix, iy, ix + iw * 0.5, iy + ih * 0.6, [[0, 'rgba(255,255,255,.24)'], [0.5, 'rgba(255,255,255,.04)'], [1, 'rgba(255,255,255,0)']]); c.fill();
        scoped(() => {
          c.translate(ix + iw / 2, iy + ih / 2); const d = Math.min(iw, ih) * 0.24;
          c.strokeStyle = mix('rgba(35,16,8,.6)', 'rgba(120,70,10,.6)', k); c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -d); c.lineTo(d, 0); c.lineTo(0, d); c.lineTo(-d, 0); c.closePath(); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(1.5, -d + 1.5); c.lineTo(d + 1, 1); c.stroke();
        });
      });
    }
  }

  // ---- Arrows and marks ----
  function arrow({ x1, y1, x2, y2, color = '#e8452a', width = 12, head, outline = true, alpha: a = 1 }) {
    const dx = x2 - x1, dy = y2 - y1, n = Math.hypot(dx, dy); if (n < 0.5) return;
    const hl = Math.min(head ?? width * 2.4, n * 0.72), hw = hl * 0.62, sw = Math.min(width, hl * 0.72);
    scoped(() => {
      c.globalAlpha *= a; c.translate(x1, y1); c.rotate(Math.atan2(dy, dx));
      const trace = () => { c.beginPath(); c.moveTo(0, -sw / 2); c.lineTo(n - hl, -sw / 2); c.lineTo(n - hl, -hw); c.lineTo(n, 0); c.lineTo(n - hl, hw); c.lineTo(n - hl, sw / 2); c.lineTo(0, sw / 2); c.closePath(); };
      if (outline) { trace(); c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke(); }
      trace();
      const nx = Math.sin(Math.atan2(dy, dx)), up = Math.cos(Math.atan2(dy, dx)) >= 0 ? 1 : -1;
      c.fillStyle = grad(0, -hw * up, 0, hw * up, [[0, lighten(color, 0.32)], [0.5, color], [1, darken(color, 0.28)]]); c.fill(); void nx;
    });
  }
  function curvedArrow({ x, y, r, from, to, color = '#2a6fd6', width = 7, head = 22, alpha: a = 1 }) {
    if (Math.abs(to - from) < 0.01) return;
    const dir = to > from ? 1 : -1, hA = head / r;
    scoped(() => {
      c.globalAlpha *= a; c.lineCap = 'round';
      const trace = () => { c.beginPath(); c.arc(x, y, r, from, to - dir * hA, dir < 0); };
      trace(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = width + 3; c.stroke();
      trace(); c.strokeStyle = color; c.lineWidth = width; c.stroke();
      const tip = [x + Math.cos(to) * r, y + Math.sin(to) * r], back = to - dir * hA, bx = x + Math.cos(back) * r, by = y + Math.sin(back) * r, nx = Math.cos(back), ny = Math.sin(back), hw = head * 0.56;
      c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(bx + nx * hw, by + ny * hw); c.lineTo(bx - nx * hw, by - ny * hw); c.closePath(); c.lineJoin = 'round'; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.stroke(); c.fillStyle = color; c.fill();
    });
  }
  function label(text, { x, y, align = 'left', size = 28, weight = 600, chip = true, color, to, alpha: a = 1, family } = {}) {
    if (a <= 0.01) return;
    scoped(() => {
      c.globalAlpha *= a;
      c.font = family === 'math' ? MATH(size, 500) : FONT(size, weight);
      const w = c.measureText(text).width, padX = chip ? 13 : 0, padY = chip ? 7 : 0, hh = size * 1.12;
      let lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      lx = clamp(lx, 12 + padX, W - 12 - padX - w);
      const ly = clamp(y, 12 + padY + hh / 2, H - 12 - padY - hh / 2);
      const bx = lx - padX, by = ly - hh / 2 - padY, bw = w + padX * 2, bh = hh + padY * 2;
      if (to) {
        const sx = clamp(to.x, bx, bx + bw), sy = clamp(to.y, by, by + bh);
        c.strokeStyle = alpha(paper2, 0.85); c.lineWidth = 4.5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(to.x, to.y); c.stroke();
        c.strokeStyle = chip ? ink : (color || ink); c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy); c.lineTo(to.x, to.y); c.stroke();
        c.fillStyle = alpha(paper2, 0.85); c.beginPath(); c.arc(to.x, to.y, 6.5, 0, TAU); c.fill();
        c.fillStyle = chip ? ink : (color || ink); c.beginPath(); c.arc(to.x, to.y, 4.5, 0, TAU); c.fill();
      }
      if (chip) { roundRect(bx, by, bw, bh, 8); c.fillStyle = alpha(paper2, 0.94); c.fill(); c.strokeStyle = alpha(ink, 0.16); c.lineWidth = 1; c.stroke(); }
      c.fillStyle = color || ink; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(text, lx, ly + 1);
    });
  }
  function readout({ x, y, label: lb, value, unit, align = 'left', size = 44, w, alpha: a = 1 }) {
    if (a <= 0.01) return;
    scoped(() => {
      c.globalAlpha *= a;
      c.font = FONT(size, 600); const vw = c.measureText(String(value)).width; c.font = FONT(26, 500); const uw = unit ? c.measureText(` ${unit}`).width : 0, lw = lb ? c.measureText(lb).width : 0;
      const cw = w ?? Math.max(vw + uw, lw) + 36, ch = (lb ? 34 : 0) + size * 1.16 + 22, bx = align === 'right' ? x - cw : x;
      roundRect(bx, y, cw, ch, 12); c.fillStyle = alpha(paper2, 0.95); c.fill(); c.strokeStyle = alpha(ink, 0.14); c.lineWidth = 1; c.stroke();
      c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      if (lb) { c.fillStyle = inkSoft; c.font = FONT(26, 500); c.fillText(lb, bx + 18, y + 34); }
      c.fillStyle = ink; c.font = FONT(size, 600); c.fillText(String(value), bx + 18, y + (lb ? 34 : 4) + size * 1.06);
      if (unit) { c.fillStyle = inkSoft; c.font = FONT(26, 500); c.fillText(` ${unit}`, bx + 18 + vw, y + (lb ? 34 : 4) + size * 1.06); }
    });
  }
  function gauge({ x, y, r = 118, value = 0, min = 0, max = 12, ticks = [0, 4, 8, 12], minor = 1, label: lb = 'Speed', unit = '', marks = [], format = (v) => v.toFixed(1), alpha: a = 1 }) {
    if (a <= 0.01) return;
    const A0 = PI * 0.75, A1 = PI * 2.25, ang = (v) => lerp(A0, A1, clamp01((v - min) / (max - min)));
    scoped(() => {
      c.globalAlpha *= a; c.translate(x, y);
      const cw = r * 2.5, cTop = -r * 1.42, ch = r * 2.96;
      c.fillStyle = 'rgba(0,0,0,.28)'; roundRect(-cw / 2 + 3, cTop + 6, cw, ch, 16); c.fill();
      roundRect(-cw / 2, cTop, cw, ch, 16); c.fillStyle = grad(0, cTop, 0, cTop + ch, [[0, paper2], [1, dark ? '#171a20' : '#EAE3D5']]); c.fill(); c.strokeStyle = alpha(ink, 0.18); c.lineWidth = 1.2; c.stroke();
      c.lineCap = 'butt'; c.strokeStyle = alpha(ink, 0.22); c.lineWidth = 7; c.beginPath(); c.arc(0, 0, r, A0, A1); c.stroke();
      c.lineCap = 'round'; c.strokeStyle = '#e8652a'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, r, A0, Math.max(A0 + 0.001, ang(value))); c.stroke();
      c.lineCap = 'butt'; c.strokeStyle = alpha(ink, 0.7); c.lineWidth = 1.6;
      if (minor) for (let v = min; v <= max + 1e-6; v += minor) { const q = ang(v); c.beginPath(); c.moveTo(Math.cos(q) * (r - 14), Math.sin(q) * (r - 14)); c.lineTo(Math.cos(q) * (r - 5), Math.sin(q) * (r - 5)); c.stroke(); }
      c.lineWidth = 3; c.fillStyle = ink; c.font = FONT(25, 600); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const v of ticks) { const q = ang(v); c.beginPath(); c.moveTo(Math.cos(q) * (r - 20), Math.sin(q) * (r - 20)); c.lineTo(Math.cos(q) * (r - 4), Math.sin(q) * (r - 4)); c.stroke(); c.fillText(String(v), Math.cos(q) * (r - 42), Math.sin(q) * (r - 42)); }
      for (const m of marks) { const q = ang(m.at); c.strokeStyle = '#e4371e'; c.lineWidth = 4; c.beginPath(); c.moveTo(Math.cos(q) * (r - 12), Math.sin(q) * (r - 12)); c.lineTo(Math.cos(q) * (r + 12), Math.sin(q) * (r + 12)); c.stroke(); }
      c.fillStyle = inkSoft; c.font = FONT(26, 500); c.fillText(lb, 0, cTop + 24);
      const q = ang(value), nl = r - 24;
      scoped(() => {
        c.translate(2, 3); c.fillStyle = 'rgba(0,0,0,.24)'; c.rotate(q); c.beginPath(); c.moveTo(-20, -5); c.lineTo(nl, -1); c.lineTo(nl, 1); c.lineTo(-20, 5); c.closePath(); c.fill();
      });
      scoped(() => { c.rotate(q); c.fillStyle = grad(0, -5, 0, 5, [[0, lighten(ink, 0.2)], [1, ink]]); c.beginPath(); c.moveTo(-20, -5); c.lineTo(nl, -1.2); c.lineTo(nl, 1.2); c.lineTo(-20, 5); c.closePath(); c.fill(); });
      c.fillStyle = radial(0, 0, 0, 11, [[0, '#d7dade'], [1, '#2a2c31']], -3, -3); c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.fill();
      c.fillStyle = ink; c.font = FONT(50, 600); c.fillText(format(value), 0, r * 0.92);
      if (unit) { c.fillStyle = inkSoft; c.font = FONT(26, 500); c.fillText(unit, 0, r * 1.3); }
    });
  }
  // Numerator and denominator stacked over a real rule, in Newsreader. x is the centre, y the rule. Returns the width it took.
  function fraction({ x, y, num, den, size = 72, color = ink, alpha: a = 1, align = 'center' }) {
    return scoped(() => {
      c.globalAlpha *= a; c.font = MATH(size, 500); c.fillStyle = color; c.textBaseline = 'alphabetic'; c.textAlign = 'center';
      const w = Math.max(c.measureText(String(num)).width, c.measureText(String(den)).width) + size * 0.3, cx = align === 'left' ? x + w / 2 : x;
      c.fillText(String(num), cx, y - size * 0.16);
      c.fillText(String(den), cx, y + size * 0.74);
      c.fillRect(cx - w / 2, y - size * 0.035, w, Math.max(2, size * 0.055));
      return w;
    });
  }
  // parts: strings and {n,d} fractions in a row, centred on x with the rules on line y.
  function formula({ x, y, parts, size = 92, color = ink, alpha: a = 1 }) {
    return scoped(() => {
      c.globalAlpha *= a; c.font = MATH(size, 500);
      const gap = size * 0.34, widths = parts.map((q) => (typeof q === 'string' ? c.measureText(q).width : Math.max(c.measureText(String(q.n)).width, c.measureText(String(q.d)).width) + size * 0.3));
      const total = widths.reduce((s, v) => s + v, 0) + gap * (parts.length - 1); let cx = x - total / 2;
      parts.forEach((q, i) => {
        if (typeof q === 'string') { c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(q, cx, y + size * 0.27); }
        else fraction({ x: cx + widths[i] / 2, y, num: q.n, den: q.d, size, color });
        cx += widths[i] + gap;
      });
      return { left: x - total / 2, right: x + total / 2 };
    });
  }
  function weight({ x, y, s = 60, text }) {
    scoped(() => {
      c.translate(x, y);
      c.beginPath(); c.arc(0, -s * 0.72, s * 0.22, 0, TAU); c.lineWidth = s * 0.1; c.strokeStyle = '#3b3e46'; c.stroke();
      c.beginPath(); c.moveTo(-s * 0.38, -s * 0.56); c.lineTo(s * 0.38, -s * 0.56); c.lineTo(s * 0.62, 0); c.lineTo(-s * 0.62, 0); c.closePath();
      c.fillStyle = grad(-s * 0.6, 0, s * 0.6, 0, [[0, '#23252b'], [0.34, '#747883'], [0.56, '#3f424a'], [1, '#191a1f']]); c.fill();
      if (text) { c.fillStyle = '#F2EFE8'; c.font = FONT(s * 0.34, 600); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, -s * 0.26); }
    });
  }

  // ---- A few more common things ----
  function tree({ x, y, h = 220, seed = 1, kind = 'round' }) {
    const q = rng(seed * 53 + 1), fol = dark ? ['#2f5a3a', '#183626', '#4a7a50'] : ['#4f9a4a', '#2c6a35', '#83c464'];
    shadow({ x: x + h * 0.08, y: y + 2, rx: h * 0.32, ry: h * 0.04, alpha: 0.32 });
    scoped(() => {
      const tw = h * 0.05;
      c.beginPath(); c.moveTo(x - tw * 1.3, y); c.quadraticCurveTo(x - tw * 0.6, y - h * 0.2, x - tw * 0.7, y - h * 0.46); c.lineTo(x + tw * 0.7, y - h * 0.46); c.quadraticCurveTo(x + tw * 0.6, y - h * 0.2, x + tw * 1.3, y); c.closePath();
      c.fillStyle = grad(x - tw, 0, x + tw, 0, [[0, '#7a5534'], [0.5, '#5a3c22'], [1, '#2f1f12']]); c.fill();
      if (kind === 'pine') {
        for (let i = 0; i < 4; i++) { const k = i / 4, yy = y - h * (0.22 + k * 0.6), wv = h * (0.34 - k * 0.2); c.beginPath(); c.moveTo(x - wv, yy); c.lineTo(x, yy - h * 0.34); c.lineTo(x + wv, yy); c.quadraticCurveTo(x, yy + h * 0.04, x - wv, yy); c.fillStyle = grad(x - wv, 0, x + wv, 0, [[0, fol[2]], [0.45, fol[0]], [1, fol[1]]]); c.fill(); }
        return;
      }
      const blobs = [];
      for (let i = 0; i < 14; i++) { const a = q() * TAU, d = Math.sqrt(q()) * h * 0.26; blobs.push([x + Math.cos(a) * d * 1.05, y - h * 0.66 + Math.sin(a) * d * 0.95, h * (0.1 + q() * 0.09)]); }
      blobs.sort((m, n) => n[1] + n[0] * 0.2 - (m[1] + m[0] * 0.2));
      for (const [bx, by, br] of blobs) { c.fillStyle = radial(bx, by, br * 0.1, br, [[0, fol[2]], [0.55, fol[0]], [1, fol[1]]], bx - br * 0.36, by - br * 0.42); c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill(); }
    });
  }
  function house({ x, y, w = 240, h = 180, wall = '#E9DCC4', roof = '#A8452F', door = '#4d6f8a' }) {
    shadow({ x: x + 12, y: y + 3, rx: w * 0.68, ry: w * 0.05, alpha: 0.32 });
    scoped(() => {
      const wh = h * 0.62, L = x - w / 2, R = x + w / 2, T = y - wh;
      c.fillStyle = grad(L, 0, R, 0, [[0, lighten(wall, 0.25)], [1, darken(wall, 0.16)]]); c.fillRect(L, T, w, wh);
      c.strokeStyle = 'rgba(80,60,40,.14)'; c.lineWidth = 1.4; for (let yy = T + 14; yy < y; yy += 14) { c.beginPath(); c.moveTo(L, yy); c.lineTo(R, yy); c.stroke(); }
      c.fillStyle = grad(0, T, 0, T + 16, [[0, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(L, T, w, 16);
      c.beginPath(); c.moveTo(L - w * 0.08, T + 2); c.lineTo(x, y - h); c.lineTo(R + w * 0.08, T + 2); c.closePath(); c.fillStyle = grad(L, y - h, R, T, [[0, lighten(roof, 0.2)], [1, darken(roof, 0.26)]]); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 1.2; for (let k = 0.2; k < 1; k += 0.2) { const yy = lerp(y - h, T, k), half = lerp(0, w * 0.58, k); c.beginPath(); c.moveTo(x - half, yy); c.lineTo(x + half, yy); c.stroke(); }
      const dw = w * 0.17, dh = wh * 0.62; c.fillStyle = grad(x - dw / 2, 0, x + dw / 2, 0, [[0, lighten(door, 0.2)], [1, darken(door, 0.24)]]); c.fillRect(x - dw / 2, y - dh, dw, dh);
      c.fillStyle = '#e9c46a'; c.beginPath(); c.arc(x + dw * 0.32, y - dh * 0.48, 2.8, 0, TAU); c.fill();
      for (const s of [-1, 1]) { const wx = x + s * w * 0.3, sz = w * 0.15, wy = T + wh * 0.22; c.fillStyle = grad(wx, wy, wx + sz, wy + sz, [[0, '#d4ecf7'], [1, '#6e9ab4']]); c.fillRect(wx - sz / 2, wy, sz, sz); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(wx - sz / 2, wy, sz, sz); c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx, wy + sz); c.moveTo(wx - sz / 2, wy + sz / 2); c.lineTo(wx + sz / 2, wy + sz / 2); c.stroke(); }
    });
  }
  function car({ x, y, w = 320, color = '#2f6fb0', face = 1, wheel = 0 }) {
    const h = w * 0.3, R = w * 0.1;
    shadow({ x, y: y + 2, rx: w * 0.56, ry: w * 0.045, alpha: 0.44 });
    scoped(() => {
      c.translate(x, y); c.scale(face, 1);
      c.beginPath(); c.moveTo(-w * 0.48, -R * 0.45); c.quadraticCurveTo(-w * 0.5, -h * 0.6, -w * 0.42, -h * 0.68); c.lineTo(-w * 0.3, -h * 0.76); c.quadraticCurveTo(-w * 0.2, -h * 1.16, -w * 0.08, -h * 1.17); c.lineTo(w * 0.1, -h * 1.17); c.quadraticCurveTo(w * 0.2, -h * 1.1, w * 0.26, -h * 0.74); c.quadraticCurveTo(w * 0.46, -h * 0.68, w * 0.49, -h * 0.42); c.lineTo(w * 0.5, -R * 0.45); c.closePath();
      c.fillStyle = grad(0, -h * 1.2, 0, 0, [[0, lighten(color, 0.3)], [0.45, color], [0.56, darken(color, 0.12)], [1, darken(color, 0.4)]]); c.fill();
      c.fillStyle = grad(0, -h * 1.1, 0, -h * 0.76, [[0, '#cfe6f2'], [1, '#54717f']]);
      c.beginPath(); c.moveTo(-w * 0.27, -h * 0.76); c.quadraticCurveTo(-w * 0.19, -h * 1.08, -w * 0.08, -h * 1.09); c.lineTo(-w * 0.02, -h * 1.09); c.lineTo(-w * 0.02, -h * 0.76); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(w * 0.01, -h * 0.76); c.lineTo(w * 0.01, -h * 1.09); c.lineTo(w * 0.09, -h * 1.09); c.quadraticCurveTo(w * 0.17, -h * 1.04, w * 0.22, -h * 0.76); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -h * 0.75); c.lineTo(0, -R * 0.5); c.stroke();
      c.fillStyle = '#ffe9a8'; c.beginPath(); c.ellipse(w * 0.475, -h * 0.5, w * 0.018, h * 0.08, 0, 0, TAU); c.fill(); c.fillStyle = '#d7362b'; c.fillRect(-w * 0.49, -h * 0.54, w * 0.016, h * 0.14);
      c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(-w * 0.38, -h * 0.62, w * 0.74, h * 0.035);
      for (const wx of [-w * 0.29, w * 0.29]) { c.fillStyle = darken(color, 0.62); c.beginPath(); c.arc(wx, -R * 0.82, R * 1.16, PI, 0); c.fill(); c.fillStyle = radial(wx, -R, 0, R, [[0, '#2a2a2e'], [1, '#111114']]); c.beginPath(); c.arc(wx, -R, R, 0, TAU); c.fill(); c.fillStyle = radial(wx, -R, 0, R * 0.56, [[0, '#f0f1f3'], [1, '#8b8e95']], wx - R * 0.14, -R * 1.14); c.beginPath(); c.arc(wx, -R, R * 0.56, 0, TAU); c.fill(); c.strokeStyle = '#4d4f55'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = wheel + (i * TAU) / 5; c.beginPath(); c.moveTo(wx, -R); c.lineTo(wx + Math.cos(a) * R * 0.5, -R + Math.sin(a) * R * 0.5); c.stroke(); } }
    });
  }
  function water({ y = 500, t = 0, height }) {
    const hh = height ?? H - y;
    c.fillStyle = grad(0, y, 0, y + hh, [[0, dark ? '#274d70' : '#5bb0dc'], [1, dark ? '#0b1f33' : '#1a5d91']]); c.fillRect(0, y, W, hh);
    for (let i = 0; i < 9; i++) {
      const k = i / 9, yy = y + k * k * hh + 5, amp = 2 + k * 5, wav = 60 + k * 90, speed = 0.8 + k;
      c.strokeStyle = `rgba(255,255,255,${0.32 - k * 0.2})`; c.lineWidth = 1 + k * 1.6;
      c.beginPath(); for (let x = -10; x <= W + 10; x += 14) { const v = yy + Math.sin(x / wav + t * speed + i * 1.7) * amp; if (x < 0) c.moveTo(x, v); else c.lineTo(x, v); } c.stroke();
    }
  }
  function mountains({ y = 520, h = 240, seed = 3, tone = dark ? '#3b4563' : '#7e93ad', snow = true, scroll = 0 } = {}) {
    const s = sprite(`mtn${seed}:${h}:${tone}:${snow}`, 2600, h + 8, (g, sw, sh) => {
      const q = rng(seed * 31 + 7), peaks = []; let x0 = -100;
      while (x0 < sw / 2 + 100) { peaks.push([x0, 0.45 + q() * 0.55, 150 + q() * 180]); x0 += 90 + q() * 170; }
      const ridge = [...peaks, ...peaks.map(([a, b, d]) => [a + sw / 2, b, d])];
      for (const [px, k, wd] of ridge) {
        const top = sh - k * h, base = sh, L = px - wd, R = px + wd;
        const gr = g.createLinearGradient(L, 0, R, 0); gr.addColorStop(0, lighten(tone, 0.18)); gr.addColorStop(0.5, tone); gr.addColorStop(0.5, darken(tone, 0.24)); gr.addColorStop(1, darken(tone, 0.34));
        g.fillStyle = gr; g.beginPath(); g.moveTo(L, base); g.lineTo(px - wd * 0.3, top + (base - top) * 0.34); g.lineTo(px, top); g.lineTo(px + wd * 0.4, top + (base - top) * 0.38); g.lineTo(R, base); g.closePath(); g.fill();
        if (snow && k > 0.68) { g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.moveTo(px, top); g.lineTo(px - wd * 0.14, top + (base - top) * 0.15); g.lineTo(px - wd * 0.05, top + (base - top) * 0.2); g.lineTo(px + wd * 0.04, top + (base - top) * 0.14); g.lineTo(px + wd * 0.17, top + (base - top) * 0.17); g.closePath(); g.fill(); }
      }
    });
    const off = ((scroll % 1300) + 1300) % 1300;
    c.drawImage(s, -off, y - h - 8 + 8);
  }

  return {
    ctx: c, W, H, TAU, theme, dark, ink, inkSoft, paperColor: paper, pxScale,
    moments, duration, at, p, env, clamp01, clamp, lerp, ease, rng, noise, mix, alpha, lighten, darken, font: FONT, mathFont: MATH, scoped, linear: grad, radial, roundRect, cylLight,
    paper({ tone } = {}) { c.fillStyle = radial(W / 2, H * 0.42, 100, 900, [[0, tone || paper2], [1, tone ? darken(tone, 0.08) : paper]]); c.fillRect(0, 0, W, H); },
    shadow, flame, rocket, rocketStage, stageHeights, stageRadii, noseHeight: (stages, length) => NOSE[stages] * (length / 1000), sky, space, stars, ground, road, cloud, earth, sun, moon, planet, ball, hand, person, gear, gearOutline, bicycle, chocolate, arrow, curvedArrow, label, readout, gauge, fraction, formula, weight, tree, house, car, water, mountains,
  };
}
