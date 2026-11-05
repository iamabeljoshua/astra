PART('lungs', {
  doc: 'A human chest seen from the front: windpipe with cartilage rings, two bronchi branching inside two lobed lungs, a domed diaphragm, ribs behind. The body\'s right lung is on the viewer\'s left with three lobes, the body\'s left lung is on the viewer\'s right with two lobes and the notch for the heart. On the way in the diaphragm flattens and moves down and the lungs swell, so that cannot be set backwards.',
  args: 'none',
  stage: 'studio',
  anchors: ['windpipe', 'bronchus', 'leftLung', 'rightLung', 'diaphragm'],
  motions: { breathe: 'one slow breath every 5 s: in, diaphragm down and flat, lungs swell, then out, the reverse', airIn: 'beads travel in through the windpipe and out along the bronchi into both lungs, and rest during the out breath' },
  views: { front: [0, 4], left: [-26, 8], right: [26, 8], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const rnd = kit.rng(11);
    const seg2 = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, h = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - x0 - dx * h, py - y0 - dy * h); };
    const groove = (d, x, y, line, depth) => smax(d, -Math.max(seg2(x, y, line[0], line[1], line[2], line[3]) - 0.022, -(d + depth)), 0.035);
    const bodyR = blob([[-0.92, 1.78, 0, -1.16, 0.75, 0.05, 0.28, 0.74], [-1.16, 0.75, 0.05, -1.42, -0.75, 0, 0.74, 0.98], [-0.86, 0.55, 0.1, -0.88, -0.95, 0.05, 0.42, 0.66], [-1.72, -0.6, 0, -1.92, -1.42, 0, 0.56, 0.26]], 0.24);
    const bodyL = blob([[0.9, 1.72, 0, 1.08, 0.75, 0.05, 0.26, 0.66], [1.08, 0.75, 0.05, 1.34, -0.8, 0, 0.66, 0.88], [0.82, 0.55, 0.05, 0.9, -1.15, 0.1, 0.36, 0.52], [1.62, -0.7, 0, 1.82, -1.62, 0, 0.5, 0.24]], 0.22);
    const mediastinum = blob([[0, 2.4, 0, 0, -2.4, 0, 0.5, 0.5]], 0);
    const lungR = (x, y, z) => {
      let d = bodyR(x, y, z);
      d = smax(d, 1.95 - Math.hypot(x + 1.15, y + 3.05, z), 0.1);
      d = smax(d, -mediastinum(x, y, z), 0.1);
      d = groove(d, x, y, [-2.45, -0.32, -0.82, -1.3], 0.34);
      d = groove(d, x, y, [-2.45, -0.14, -0.55, 0.2], 0.3);
      return d;
    };
    const lungL = (x, y, z) => {
      let d = bodyL(x, y, z);
      d = smax(d, 1.95 - Math.hypot(x - 1.15, y + 3.28, z), 0.1);
      d = smax(d, -mediastinum(x, y, z), 0.1);
      d = smax(d, 0.74 - Math.hypot(x - 0.22, y + 0.46, (z - 0.25) * 0.8), 0.12);
      d = groove(d, x, y, [2.3, 1.05, 0.8, -1.5], 0.34);
      return d;
    };
    const c1 = paint('#b77f76'), c2 = paint('#94544f');
    const lungTint = (x, y, z, c) => { c.copy(c1).lerp(c2, clamp(0.5 + 0.5 * Math.sin(x * 9 + y * 7 + z * 8))* 0.28); };
    const lungMat = tissue(14, 0.55, { transparent: true, opacity: 0.56, depthWrite: false, roughness: 0.46 });
    const swellR = P.group(P.root, [-0.45, 1.9, 0]), swellL = P.group(P.root, [0.45, 1.9, 0]);
    const innerR = P.group(swellR, [0.45, -1.9, 0]), innerL = P.group(swellL, [-0.45, -1.9, 0]);
    const meshR = P.add(carve(lungR, lungTint, [-2.75, -2.1, -1.2], [-0.35, 2.2, 1.2], 0.042), lungMat, innerR);
    const meshL = P.add(carve(lungL, lungTint, [0.35, -2.2, -1.1], [2.65, 2.15, 1.1], 0.042), lungMat, innerL);
    meshR.renderOrder = 3; meshL.renderOrder = 3; meshR.castShadow = false; meshL.castShadow = false;

    const cartilage = P.mat('wet', '#d6c6ae', { roughness: 0.42 });
    const wall = P.mat('wet', '#ab8f85', { roughness: 0.5 });
    const treeMat = P.mat('wet', '#ecd8c6', { roughness: 0.4, emissive: new T.Color('#5d4238'), emissiveIntensity: 0.5 });
    const line = (pts) => new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const tracheaCurve = line([[0, 2.72, 0], [0, 2, 0], [0, 1.08, 0]]);
    P.add(new T.TubeGeometry(tracheaCurve, 24, 0.185, 20), wall);
    const rings = []; for (let u = 0.03; u < 0.99; u += 0.078) rings.push(u);
    ringAlong(tracheaCurve, rings, 0.195, 0.031, cartilage);
    const lumen = P.add(new T.CircleGeometry(0.17, 24), new T.MeshBasicMaterial({ color: '#070404' }), P.root, [0, 2.72, 0], [-Math.PI / 2, 0, 0]);
    lumen.castShadow = false;
    const mainR = [[0, 1.12, 0], [-0.17, 0.92, 0], [-0.44, 0.56, 0], [-0.72, 0.28, 0.02]];
    const mainL = [[0, 1.12, 0], [0.25, 0.97, 0], [0.62, 0.74, 0], [0.98, 0.44, 0.02]];
    [[mainR, 0.155], [mainL, 0.125]].forEach(([pts, r]) => {
      const c = line(pts);
      P.add(new T.TubeGeometry(c, 20, r, 16), wall);
      const us = []; for (let u = 0.12; u < 0.99; u += 0.14) us.push(u);
      ringAlong(c, us, r + 0.008, 0.024, cartilage);
    });
    const carina = P.add(new T.SphereGeometry(0.18, 20, 14), wall, P.root, [0, 1.09, 0]);
    carina.scale.set(1, 0.72, 0.95);

    const tips = [];
    const grow = (p, dir, len, r, gen, field, parent, chain) => {
      const bend = dir.clone().add(new T.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.7)).normalize();
      let L = len;
      let end = p.clone().addScaledVector(bend, L);
      for (let k = 0; k < 3 && field(end.x, end.y, end.z) > -0.1; k++) { L *= 0.62; end = p.clone().addScaledVector(bend, L); }
      const mid = p.clone().lerp(end, 0.5).addScaledVector(dir, 0.02);
      const curve = new T.CatmullRomCurve3([p, mid, end]);
      P.add(new T.TubeGeometry(curve, 5, r, 6), treeMat, parent);
      const next = [...chain, [end.x, end.y, end.z]];
      if (gen === 0) { tips.push(next); return; }
      const side = new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(bend).normalize();
      const spread = 0.42 + rnd() * 0.3;
      grow(end, bend.clone().applyAxisAngle(side, spread).normalize(), len * 0.76, r * 0.72, gen - 1, field, parent, next);
      grow(end, bend.clone().applyAxisAngle(side, -spread * 0.9).normalize(), len * 0.7, r * 0.7, gen - 1, field, parent, []);
    };
    const v = (x, y, z) => new T.Vector3(x, y, z);
    const lobarR = [[-0.2, 1, 0.05], [-0.8, 0.5, 0.25], [-0.42, -1, 0.1]];
    const lobarL = [[0.4, 0.92, 0.05], [0.42, -1, 0.05]];
    const beginBranches = (tipPt, dirs, field, parent, main) => dirs.forEach((d) => {
      const before = tips.length;
      grow(v(...tipPt), v(...d).normalize(), 0.62, 0.075, 4, field, parent, []);
      if (tips.length > before) tips[before] = [...main, ...tips[before]];
    });
    beginBranches(mainR[3], lobarR, lungR, innerR, mainR);
    beginBranches(mainL[3], lobarL, lungL, innerL, mainL);
    const beadPaths = tips.filter((t) => t.length > 6).map((t) => [[0, 2.68, 0], [0, 1.9, 0], ...t]);
    const flows = beadPaths.map((pts, i) => beadsOnTop(P.beads(pts, { count: 12, speed: 0.2 + i * 0.008, size: 15, color: '#8fd0ff', intensity: 2.2 })));

    const dome = (x, y, z) => smin(Math.hypot(x + 1.15, y + 3.05, z) - 1.93, Math.hypot(x - 1.15, y + 3.28, z) - 1.93, 0.45);
    const diaField = (x, y, z) => Math.max(Math.abs(dome(x, y, z)) - 0.045, -2.02 - y);
    const muscle = paint('#713a36'), tendon = paint('#a4917b');
    const diaTint = (x, y, z, c) => { c.copy(muscle).lerp(tendon, clamp(1.15 - Math.hypot(x / 1.6, z / 0.9))); };
    const diaPivot = P.group(P.root, [0, -2.02, 0]);
    const diaInner = P.group(diaPivot, [0, 2.02, 0]);
    P.add(carve(diaField, diaTint, [-3.15, -2.1, -2], [3.15, -1, 2], 0.045), tissue(6, 0.22, { side: T.DoubleSide, roughness: 0.72, clearcoat: 0.2 }), diaInner);

    const ribs = P.group(P.root);
    const bone = P.mat('matte', '#5d564b', { roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const y0 = 2.05 - i * 0.42;
      const Rx = 1.25 + 1.5 * Math.sqrt(clamp((2.45 - y0) / 3.7));
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 8; k++) { const a = -2.7 + (k / 8) * 2.95; pts.push([s * Math.sin(a + Math.PI / 2 + Math.PI / 2 * 0) * 0 + s * Rx * Math.cos(a), y0 - 0.32 + (k / 8) * -0.22 + 0.32 * Math.cos((k / 8) * 1.2), Math.sin(a) * 1.5]); }
        const c = line(pts);
        P.add(new T.TubeGeometry(c, 26, 0.034, 6), bone, ribs);
      }
    }
    const spine = line([[0, 2.0, -1.5], [0, 0.4, -1.55], [0, -2.0, -1.4]]);
    P.add(new T.TubeGeometry(spine, 30, 0.14, 10), bone, ribs);

    P.anchor('windpipe', P.root, [0.17, 1.95, 0.16], 0.8);
    P.anchor('bronchus', P.root, [0.6, 0.76, 0.1], 0.7);
    P.anchor('rightLung', innerR, [-1.55, 0.25, 0.75], 1.9);
    P.anchor('leftLung', innerL, [1.5, 0.15, 0.68], 1.9);
    P.anchor('diaphragm', diaInner, [0.05, -1.38, 0.9], 1.5);
    return {
      radius: 2.85,
      update(m) {
        const phase = (m.breathe.tau / 5) * Math.PI * 2;
        const s = 0.5 - 0.5 * Math.cos(phase);
        [swellR, swellL].forEach((g, i) => { g.scale.set(1 + 0.05 * s, 1 + 0.13 * s, 1 + 0.07 * s); g.position.x = (i ? 0.45 : -0.45); });
        diaPivot.scale.set(1 + 0.02 * s, 1 - 0.42 * s, 1);
        ribs.scale.set(1 + 0.03 * s, 1, 1 + 0.045 * s);
        const inward = m.breathe.tau > 0 ? clamp(Math.sin(phase) * 5 + 0.4) : 1;
        const k = m.airIn.tau > 0 ? clamp(m.airIn.tau * 1.5) * inward : 0;
        flows.forEach((f) => f.show(k));
      },
    };
  },
});

PART('alveoli', {
  doc: 'A close-up of a grape-like cluster of air sacs, cut open, with a fine capillary wrapped round the open sac and red blood cells moving through it. Oxygen always passes from the sac into the blood, carbon dioxide always the other way, and each cell goes from dark to bright red along the flow, so the exchange cannot be set backwards.',
  args: 'none',
  stage: 'studio',
  anchors: ['sac', 'capillary', 'bloodCell', 'oxygen', 'carbonDioxide'],
  motions: { flow: 'blood moves through the capillary, turning from dark to bright red, while oxygen beads cross into it and carbon dioxide beads cross out' },
  views: { front: [0, 6], left: [-24, 10], right: [24, 10], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const sacs = [[0, -0.15, 0, 1.12], [-1.55, 0.55, -0.25, 0.8], [1.55, 0.5, -0.2, 0.82], [-1.3, -1.15, -0.3, 0.74], [1.32, -1.2, -0.25, 0.76], [-0.1, 1.42, -0.35, 0.72], [0, -1.65, -0.45, 0.6], [-0.75, 0.85, -0.75, 0.62], [0.8, 0.9, -0.8, 0.62]];
    const CUT = 0.26;
    const outerS = (x, y, z) => sacs.reduce((d, s) => smin(d, Math.hypot(x - s[0], y - s[1], z - s[2]) - s[3], 0.09), 1e9);
    const innerS = (x, y, z) => sacs.reduce((d, s) => Math.min(d, Math.hypot(x - s[0], y - s[1], z - s[2]) - (s[3] - 0.075)), 1e9);
    const duct = blob([[-0.1, 1.9, -0.35, -0.1, 3.05, -0.35, 0.34, 0.34]], 0);
    const ductIn = blob([[-0.1, 1.5, -0.35, -0.1, 3.3, -0.35, 0.26, 0.26]], 0);
    const field = (x, y, z) => {
      let d = smin(outerS(x, y, z), duct(x, y, z), 0.14);
      d = smax(d, -innerS(x, y, z), 0.025);
      d = Math.max(d, -ductIn(x, y, z));
      return Math.max(d, z - CUT, y - 2.85);
    };
    const skin = paint('#a8615e'), inside = paint('#a86a68'), rim = paint('#e2b5a8');
    const tint = (x, y, z, c, nz) => { if (z > CUT - 0.012) c.copy(rim); else c.copy(innerS(x, y, z) > -0.03 && innerS(x, y, z) < 0.05 ? inside : skin); };
    P.add(carve(field, tint, [-2.6, -2.5, -1.6], [2.6, 2.95, 0.34], 0.034), tissue(7, 0.16, { roughness: 0.55, clearcoat: 0.25 }));

    const n = 150, h0 = sacs[0], R = 1.08;
    const curvePts = [[-3.1, -1.75, 0.34], [-2.35, -1.45, 0.42]];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = Math.PI * 1.1 + u * Math.PI * 3.1, rr = 1.0 + 0.16 * u + 0.03 * Math.sin(u * 34);
      if (i % 5 === 0) curvePts.push([h0[0] + Math.cos(a) * rr, h0[1] + Math.sin(a) * rr, CUT + 0.1 + 0.05 * Math.sin(u * 22)]);
    }
    curvePts.push([1.9, 1.35, 0.3], [2.5, 1.65, 0.3], [3.15, 1.75, 0.2]);
    const curve = new T.CatmullRomCurve3(curvePts.map((p) => new T.Vector3(p[0], p[1], p[2])), false, 'centripetal');
    const tubeGeo = new T.TubeGeometry(curve, 320, 0.098, 12);
    const cols = new Float32Array(tubeGeo.attributes.position.count * 3), dark = paint('#3c2a56'), bright = paint('#c5362e'), cc = new T.Color();
    for (let i = 0; i < tubeGeo.attributes.position.count; i++) { const u = Math.floor(i / 13) / 320; cc.copy(dark).lerp(bright, clamp((u - 0.12) / 0.6)); cols.set([cc.r, cc.g, cc.b], i * 3); }
    tubeGeo.setAttribute('color', new T.BufferAttribute(cols, 3));
    const glass = P.add(tubeGeo, P.mat('wet', '#ffffff', { vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false, roughness: 0.3 }));
    glass.renderOrder = 4; glass.castShadow = false;
    [[[-2.5, 1.3, -0.55], [-1.7, 1.42, -0.1], [-1.05, 1.0, -0.08], [-0.62, 0.42, 0.05], [-1.0, -0.05, 0.1], [-1.72, -0.3, 0.1], [-2.15, -0.7, 0], [-1.62, -1.72, -0.2]], [[2.4, -0.2, -0.35], [1.85, -0.28, 0.05], [1.2, -0.1, 0.12], [1.25, -0.78, 0.2], [1.85, -1.25, 0.12], [1.5, -1.92, -0.3]]].forEach((pts, i) => {
      P.tubeAlong(pts, 0.055, P.mat('wet', i ? '#9c3a3a' : '#5a3c64', { roughness: 0.45 }));
    });
    const prof = []; for (let i = 0; i <= 12; i++) { const a = i / 12, rr = 0.082 * a, th = 0.016 + 0.022 * Math.sin(a * Math.PI) ** 0.6 * (0.45 + 0.75 * a); prof.push(new T.Vector2(Math.max(rr, 0.0001), th)); }
    const back = prof.slice().reverse().map((p) => new T.Vector2(p.x, -p.y));
    const cellGeo = new T.LatheGeometry([...prof, ...back], 18);
    const COUNT = 30, cells = new T.InstancedMesh(cellGeo, P.mat('wet', '#ffffff', { roughness: 0.42 }), COUNT);
    cells.frustumCulled = false; cells.renderOrder = 2; P.root.add(cells);
    const dummy = new T.Object3D(), col = new T.Color(), cellDark = paint('#4a1e3e'), cellBright = paint('#d83a2e');
    const place = (i, tau) => {
      const u = ((i / COUNT) + 0.03 * Math.sin(i * 2.4) + tau * 0.05) % 1;
      const p = curve.getPointAt(u), q = curve.getTangentAt(Math.min(u + 0.01, 1));
      dummy.position.copy(p);
      dummy.scale.setScalar(1);
      dummy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), q.clone().cross(new T.Vector3(0.3, 0.7, 0.6)).normalize());
      dummy.updateMatrix(); cells.setMatrixAt(i, dummy.matrix);
      col.copy(cellDark).lerp(cellBright, clamp((u - 0.14) / 0.55)); cells.setColorAt(i, col);
      return p;
    };
    const o2Angles = [0.25, 1.45, 2.65, 3.85, 5.05], co2Angles = [0.85, 2.05, 3.25, 4.45, 5.65];
    const lane = (a0, inward) => {
      const ins = new T.Vector3(h0[0] + Math.cos(a0) * 0.3, h0[1] + Math.sin(a0) * 0.3, -0.05), out = new T.Vector3(h0[0] + Math.cos(a0) * 1.04, h0[1] + Math.sin(a0) * 1.04, CUT + 0.1);
      return inward ? [ins, out] : [out, ins];
    };
    const lanes = [...o2Angles.map((a) => ({ l: lane(a, true), o2: true })), ...co2Angles.map((a) => ({ l: lane(a, false), o2: false }))];
    const PER = 3, gas = new T.InstancedMesh(new T.SphereGeometry(0.062, 14, 10), P.mat('wet', '#ffffff', { roughness: 0.25, emissive: new T.Color('#ffffff'), emissiveIntensity: 0.12 }), lanes.length * PER);
    gas.frustumCulled = false; gas.material.depthTest = false; gas.renderOrder = 6; P.root.add(gas);
    const cO2 = paint('#6cc4ff'), cCO2 = paint('#f0a040');
    lanes.forEach((x, i) => { for (let j = 0; j < PER; j++) gas.setColorAt(i * PER + j, x.o2 ? cO2 : cCO2); });
    const moveGas = (tau, k) => lanes.forEach((x, i) => { for (let j = 0; j < PER; j++) {
      const u = (j / PER + tau * 0.22 + i * 0.13) % 1;
      dummy.position.lerpVectors(x.l[0], x.l[1], u); dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(k * Math.min(1, Math.min(u, 1 - u) * 9)); dummy.updateMatrix(); gas.setMatrixAt(i * PER + j, dummy.matrix);
    } });
    const atA = o2Angles[1], atB = co2Angles[3];
    P.anchor('sac', P.root, [h0[0] - 0.12, h0[1] - 0.18, -0.55], 1.3);
    P.anchor('capillary', P.root, [-1.72, -1.03, 0.42], 0.9);
    const cellAnchor = P.anchor('bloodCell', P.root, [0, 0, 0], 0.6);
    P.anchor('oxygen', P.root, [h0[0] + Math.cos(atA) * 0.68, h0[1] + Math.sin(atA) * 0.68, 0.1], 0.8);
    P.anchor('carbonDioxide', P.root, [h0[0] + Math.cos(atB) * 0.68, h0[1] + Math.sin(atB) * 0.68, 0.1], 0.8);
    return {
      radius: 2.9,
      update(m) {
        let p0 = null;
        for (let i = 0; i < COUNT; i++) { const p = place(i, m.flow.tau); if (i === 9) p0 = p; }
        cells.instanceMatrix.needsUpdate = true; if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
        cellAnchor.place([p0.x, p0.y, p0.z]);
        const k = m.flow.tau > 0 ? clamp(m.flow.tau * 1.5) : 0;
        moveGas(m.flow.tau, k); gas.instanceMatrix.needsUpdate = true;
      },
    };
  },
});

PART('heart', {
  doc: 'A real human heart cut open facing the viewer: four chambers with thick muscle walls, the wall of the body\'s left ventricle thicker, valves, aorta arching up, vena cava, pulmonary artery. The body\'s right side, on the viewer\'s left, carries blue-side blood. The body\'s left side, on the viewer\'s right, carries red-side blood. Atria squeeze before ventricles, valves open and shut with them, and blood runs one true path, none of which a recipe can set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['rightAtrium', 'rightVentricle', 'leftAtrium', 'leftVentricle', 'aorta', 'venaCava', 'pulmonaryArtery', 'valve'],
  motions: { beat: 'a beat about every 1.2 s: atria squeeze first, then ventricles, with valves opening and shutting', flow: 'beads run veins to right atrium, right ventricle, pulmonary artery, and lung veins to left atrium, left ventricle, aorta' },
  views: { front: [0, 4], left: [-20, 6], right: [20, 6], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const CUT = 0.12;
    const shift = P.group(P.root, [-0.05, -0.5, 0]);
    const muscle = blob([[-0.5, 0.05, 0, 0.55, -1.42, 0, 0.64, 0.4], [0.55, 0.15, -0.02, 0.8, -1.62, 0, 0.82, 0.28], [-0.55, 0.15, 0, 0.7, 0.2, 0, 0.66, 0.72], [-0.98, 1.08, 0, -0.92, 0.62, 0, 0.58, 0.58], [0.5, 1.12, -0.05, 1.02, 1.12, -0.05, 0.46, 0.48]], 0.26);
    const vR = blob([[-1.0, 1.2, 0, -1.0, 2.62, 0, 0.27, 0.27], [-1.25, 0.55, 0, -1.25, -1.42, 0, 0.27, 0.27]], 0.05);
    const vL = blob([[-0.08, 0.7, 0, -0.08, 2.0, 0, 0.28, 0.28], [-0.08, 2.0, 0, 0.2, 2.5, 0, 0.28, 0.28], [0.2, 2.5, 0, 0.8, 2.6, 0, 0.28, 0.28], [0.8, 2.6, 0, 1.26, 2.2, 0, 0.28, 0.27], [1.26, 2.2, 0, 1.36, 1.5, 0, 0.27, 0.25], [0.02, 2.5, 0, 0.0, 3.08, 0, 0.1, 0.09], [0.4, 2.65, 0, 0.42, 3.12, 0, 0.09, 0.08], [0.78, 2.68, 0, 0.84, 3.1, 0, 0.09, 0.08], [1.1, 1.28, 0, 2.08, 1.44, 0, 0.14, 0.13], [1.1, 0.95, 0, 2.08, 0.82, 0, 0.14, 0.13]], 0.05);
    const cavR = blob([[-1.0, 1.1, -0.1, -0.92, 0.72, -0.1, 0.42, 0.42], [-0.5, 0.05, -0.1, 0.24, -1.05, -0.1, 0.34, 0.13], [-0.34, 0.1, -0.05, -0.3, 0.72, -0.02, 0.2, 0.2], [-0.84, 0.72, -0.05, -0.6, 0.15, -0.05, 0.19, 0.19], [-1.0, 1.2, 0, -1.0, 2.8, 0, 0.2, 0.2], [-1.25, 0.72, 0, -1.25, -1.6, 0, 0.2, 0.2], [-1.25, 0.6, 0, -1.0, 0.85, 0, 0.18, 0.18]], 0.07);
    const cavL = blob([[0.5, 1.12, -0.1, 1.05, 1.12, -0.1, 0.33, 0.33], [0.64, 0.0, -0.1, 0.8, -1.25, -0.1, 0.37, 0.14], [0.68, 1.0, -0.05, 0.64, 0.12, -0.05, 0.17, 0.17], [0.46, 0.02, -0.05, 0.02, 0.62, -0.02, 0.2, 0.2], [-0.08, 0.6, 0, -0.08, 2.0, 0, 0.21, 0.21], [-0.08, 2.0, 0, 0.2, 2.5, 0, 0.21, 0.21], [0.2, 2.5, 0, 0.8, 2.6, 0, 0.21, 0.21], [0.8, 2.6, 0, 1.26, 2.2, 0, 0.21, 0.2], [1.26, 2.2, 0, 1.38, 1.3, 0, 0.2, 0.19], [0.02, 2.5, 0, 0.0, 3.3, 0, 0.06, 0.06], [0.4, 2.65, 0, 0.42, 3.3, 0, 0.055, 0.055], [0.78, 2.68, 0, 0.86, 3.3, 0, 0.055, 0.055], [1.1, 1.28, 0, 2.3, 1.46, 0, 0.09, 0.09], [1.1, 0.95, 0, 2.3, 0.8, 0, 0.09, 0.09]], 0.05);
    const pap = blob([[-0.12, -0.92, -0.06, -0.38, -0.36, -0.03, 0.1, 0.035], [0.78, -1.2, -0.06, 0.72, -0.5, -0.03, 0.13, 0.04]], 0);
    const field = (x, y, z) => {
      let d = smin(muscle(x, y, z), smin(vR(x, y, z), vL(x, y, z), 0.05), 0.07);
      d = smax(d, -cavR(x, y, z), 0.035);
      d = smax(d, -cavL(x, y, z), 0.035);
      d = smin(d, pap(x, y, z), 0.05);
      return smax(d, z - CUT, 0.035);
    };
    const cMuscle = paint('#9c4a42'), cOuter = paint('#7f3a33'), cFat = paint('#b0935f'), cBlue = paint('#4a5ca0'), cRed = paint('#c23a34'), cWallB = paint('#8995bd'), cWallR = paint('#d29a8c');
    const tint = (x, y, z, c) => {
      const onCut = z > CUT - 0.03, inR = cavR(x, y, z) < 0.05, inL = cavL(x, y, z) < 0.05;
      if (onCut) {
        const m = muscle(x, y, z);
        if (m < -0.015) c.copy(cMuscle).multiplyScalar(0.82 + 0.3 * Math.sin((x * 0.6 + y) * 26 + Math.sin(x * 7) * 2) ** 2);
        else if (vR(x, y, z) < 0.02) c.copy(cWallB); else c.copy(cWallR);
        return;
      }
      if (inR) { c.copy(cBlue); return; }
      if (inL) { c.copy(cRed); return; }
      if (vR(x, y, z) < 0.03) { c.copy(cBlue).lerp(cWallB, 0.25); return; }
      if (vL(x, y, z) < 0.03) { c.copy(cRed).lerp(cWallR, 0.35); return; }
      c.copy(cOuter).lerp(cFat, clamp(1 - Math.abs(y - 0.62) * 3.5) * 0.7);
    };
    const weight = (x, y) => {
      const s = (a, b, v) => { const q = clamp((v - a) / (b - a)); return q * q * (3 - 2 * q); };
      const vessel = s(-1.0, -1.18, x) + s(1.35, 1.6, x);
      return [s(0.45, 0.8, y) * (1 - s(1.45, 1.8, y)) * (1 - Math.min(1, vessel)), (1 - s(0.15, 0.5, y)) * (1 - s(-1.02, -1.18, x))];
    };
    const deform = { uC0: { value: new T.Vector3(0, 1.05, -0.1) }, uC1: { value: new T.Vector3(0.2, -0.45, -0.1) }, uS: { value: new T.Vector2(1, 1) } };
    const heartMat = tissue(9, 0.14, { roughness: 0.5 }, deform);
    P.add(carve(field, tint, [-1.65, -2.15, -1.05], [2.2, 3.22, 0.2], 0.029, weight), heartMat, shift);

    const paPts = [[-0.32, 0.62, 0.02], [-0.25, 0.95, 0.16], [0.24, 1.45, 0.42], [0.72, 1.72, 0.42], [1.2, 1.86, 0.34], [1.92, 1.98, 0.22]];
    const paCurve = new T.CatmullRomCurve3(paPts.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const paS = paCurve.getPoints(9).map((p) => [p.x, p.y, p.z]);
    const paOut = blob(paS.slice(1).map((p, i) => [...paS[i], ...p, 0, 0]), 0);
    const zAt = (x) => { const k = clamp((x + 0.3) / 0.6); return 0.12 + k * 0.3 - clamp((x - 0.9) / 1) * 0.16; };
    const paField = (x, y, z) => Math.max(Math.max(paOut(x, y, z) - 0.25, 0.17 - paOut(x, y, z)), z - zAt(x), y > 0 ? 0.66 - y : 1);
    const paTint = (x, y, z, c) => { if (z > zAt(x) - 0.015) c.copy(cWallB); else c.copy(paOut(x, y, z) < 0.21 ? cBlue : paint('#4d5c94')); };
    P.add(carve(paField, paTint, [-0.75, 0.5, -0.1], [2.05, 2.4, 0.75], 0.03), tissue(10, 0.3, { roughness: 0.46 }), shift);
    P.tubeAlong([[0.42, 1.5, 0.05], [0.2, 1.5, -0.42], [-0.6, 1.56, -0.5], [-1.9, 1.62, -0.42]], 0.17, P.mat('wet', '#4a5a92', { roughness: 0.5 }), shift);

    const leafMat = P.mat('wet', '#dccbb2', { roughness: 0.4 });
    const flapGeo = (len, w) => { const s = new T.Shape(); s.moveTo(-w / 2, 0); s.quadraticCurveTo(-w * 0.42, len * 0.7, 0, len); s.quadraticCurveTo(w * 0.42, len * 0.7, w / 2, 0); s.closePath(); return new T.ExtrudeGeometry(s, { depth: 0.024, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -0.012); };
    const valves = [];
    const addValve = (x, y, deg, hw, len, kind) => {
      const g = P.group(shift, [x, y, CUT - 0.03]);
      g.rotation.z = (deg * Math.PI) / 180;
      const geo = flapGeo(len, 0.2);
      const sides = [-1, 1].map((s) => { const h = P.group(g, [s * hw, 0, 0]); P.add(geo, leafMat, h); return { h, s }; });
      valves.push({ sides, kind, closeAng: Math.atan2(hw * 0.94, len), g });
      return g;
    };
    addValve(-0.72, 0.5, 158, 0.19, 0.27, 'av');
    addValve(0.66, 0.5, 182, 0.17, 0.26, 'av');
    addValve(-0.32, 0.56, -3, 0.195, 0.2, 'sl');
    addValve(0.06, 0.58, 33, 0.2, 0.2, 'sl');
    const cordMat = P.mat('wet', '#d8c7ae', { roughness: 0.5 });
    const cords = [];
    [[0, 0, [-0.38, -0.34, CUT - 0.06]], [0, 1, [-0.38, -0.34, CUT - 0.06]], [1, 0, [0.72, -0.48, CUT - 0.06]], [1, 1, [0.72, -0.48, CUT - 0.06]]].forEach(([v, s, to]) => {
      const m = P.add(new T.CylinderGeometry(0.009, 0.009, 1, 5), cordMat, shift);
      cords.push({ m, v, s, to: new T.Vector3(...to) });
    });
    const beadOpt = (color) => ({ count: 26, speed: 0.1, size: 12, color, intensity: 1.7, parent: shift });
    const b0 = [[-0.95, 0.95, 0.03], [-0.72, 0.46, 0.03], [-0.42, -0.08, 0.03], [-0.02, -0.72, 0.03], [-0.34, -0.1, 0.05], [-0.33, 0.45, 0.05], [-0.25, 0.95, 0.28], [0.24, 1.45, 0.5], [0.72, 1.72, 0.5], [1.2, 1.86, 0.42], [2.0, 1.99, 0.3]];
    const r0 = [[0.78, 1.12, 0.03], [0.66, 0.5, 0.03], [0.7, -0.25, 0.03], [0.78, -0.95, 0.03], [0.5, -0.2, 0.05], [0.25, 0.28, 0.05], [-0.06, 0.8, 0.05], [-0.08, 1.95, 0.05], [0.2, 2.5, 0.05], [0.8, 2.6, 0.05], [1.26, 2.2, 0.05], [1.37, 1.2, 0.05]];
    const flows = [
      P.beads([[-1.0, 2.85, 0.03], [-1.0, 1.7, 0.03], ...b0], beadOpt('#8ea6ff')),
      P.beads([[-1.25, -1.6, 0.03], [-1.25, 0.25, 0.03], [-1.08, 0.7, 0.03], ...b0], beadOpt('#8ea6ff')),
      P.beads([[2.22, 1.47, 0.03], [1.4, 1.32, 0.03], ...r0], beadOpt('#ff8169')),
      P.beads([[2.22, 0.79, 0.03], [1.4, 0.93, 0.03], ...r0], beadOpt('#ff8169')),
    ].map(beadsOnTop);
    P.anchor('rightAtrium', shift, [-0.95, 1.0, 0.0], 0.8);
    P.anchor('rightVentricle', shift, [-0.28, -0.32, 0.0], 0.85);
    P.anchor('leftAtrium', shift, [0.86, 1.14, 0.0], 0.8);
    P.anchor('leftVentricle', shift, [0.72, -0.5, 0.0], 0.85);
    P.anchor('aorta', shift, [0.55, 2.56, 0.0], 0.9);
    P.anchor('venaCava', shift, [-1.0, 2.15, 0.0], 0.85);
    P.anchor('pulmonaryArtery', shift, [0.92, 1.8, 0.35], 0.85);
    P.anchor('valve', shift, [0.66, 0.42, CUT], 0.55);
    const bump = (f, a, b) => (f > a && f < b ? Math.sin((Math.PI * (f - a)) / (b - a)) : 0);
    const q = new T.Vector3(), up = new T.Vector3(0, 1, 0), dir = new T.Vector3();
    return {
      radius: 2.95,
      update(m) {
        const f = m.beat.tau > 0 ? (m.beat.tau / 1.2) % 1 : 0.8;
        const atria = m.beat.tau > 0 ? bump(f, 0, 0.24) : 0, vent = m.beat.tau > 0 ? bump(f, 0.22, 0.62) : 0;
        deform.uS.value.set(1 - 0.075 * atria, 1 - 0.1 * vent);
        const avOpen = 1 - clamp(vent * 3), slOpen = clamp(vent * 3);
        for (const v of valves) {
          const open = v.kind === 'av' ? avOpen : slOpen;
          for (const { h, s } of v.sides) h.rotation.z = s * (v.closeAng * (1 - open) - 0.08 * open) * 1;
        }
        shift.updateMatrixWorld(true);
        for (const c of cords) {
          const flap = valves[c.v].sides[c.s].h;
          q.set(0, 0.26, 0); flap.localToWorld(q); shift.worldToLocal(q);
          dir.subVectors(c.to, q);
          c.m.position.copy(q).addScaledVector(dir, 0.5);
          c.m.scale.set(1, dir.length(), 1);
          c.m.quaternion.setFromUnitVectors(up, dir.normalize());
        }
        const k = m.flow.tau > 0 ? clamp(m.flow.tau * 1.5) : 0;
        flows.forEach((x) => x.show(k));
      },
    };
  },
});

PART('animalCell', {
  doc: 'A cut-open animal cell with no cell wall: thin membrane, nucleus with nucleolus and double envelope, bean-shaped mitochondria with folded inner membranes, rough endoplasmic reticulum folded round the nucleus and studded with ribosomes, a Golgi stack of curved plates, and lysosomes in tinted cytoplasm. Each anchor sits on its true organelle.',
  args: 'none',
  stage: 'studio',
  anchors: ['membrane', 'nucleus', 'mitochondrion', 'reticulum', 'golgi', 'ribosome', 'lysosome'],
  motions: { drift: 'slow living motion of the organelles, the camera does not zoom' },
  views: { front: [0, 8], left: [-26, 12], right: [26, 12], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const CUT = 0.4;
    const bodyF = blob([[-0.7, 0.2, 0, 0.8, -0.2, 0, 2.3, 2.25], [0.5, 0.9, -0.1, -0.3, -0.9, -0.1, 2.1, 2.1]], 0.5);
    const memF = (x, y, z) => { const b = bodyF(x, y, z) + 0.035 * Math.sin(x * 3.1 + y * 2.3) * Math.sin(y * 2.7 - z * 2); return Math.max(Math.abs(b) - 0.065, z - CUT); };
    const cMem = paint('#d8b48e'), cCyt = paint('#7c5a57'), cRim = paint('#efd5ad');
    const memTint = (x, y, z, c) => { const b = bodyF(x, y, z); if (z > CUT - 0.012) c.copy(cRim); else c.copy(b < -0.01 ? cCyt : cMem); };
    P.add(carve(memF, memTint, [-3.5, -3.1, -3], [3.5, 3.1, 0.5], 0.05), tissue(5, 0.2, { roughness: 0.6, clearcoat: 0.3 }));
    const NC = [-0.45, 0.1, -0.35], NR = 1.12;
    const nucF = (x, y, z) => {
      const dd = Math.hypot(x - NC[0], y - NC[1], z - NC[2]) - NR;
      const outer = Math.abs(dd) - 0.022, inner = Math.abs(dd + 0.1) - 0.022;
      const pore = Math.abs(Math.sin(Math.atan2(y - NC[1], x - NC[0]) * 9)) > 0.97 ? 1 : -1;
      const nucleolus = Math.hypot(x - NC[0] - 0.22, y - NC[1] - 0.2, (z - NC[2]) * 0.92) - 0.36 + 0.03 * Math.sin(x * 19) * Math.sin(y * 17);
      return Math.max(Math.min(Math.min(outer, Math.max(inner, -pore)), nucleolus), z - 0.1);
    };
    const cEnv = paint('#a46f85'), cIn = paint('#4e3058'), cNl = paint('#7d2f55'), cCut = paint('#d8a8bb');
    const nucTint = (x, y, z, c) => {
      const dd = Math.hypot(x - NC[0], y - NC[1], z - NC[2]) - NR;
      if (Math.hypot(x - NC[0] - 0.22, y - NC[1] - 0.2, z - NC[2]) < 0.42) { c.copy(cNl); return; }
      if (z > 0.08) { c.copy(cCut); return; }
      c.copy(dd < -0.1 ? cIn : cEnv);
    };
    const drift = [];
    const addDrift = (g, seed, amp) => { drift.push({ g, base: g.position.clone(), rot: g.rotation.z, seed, amp }); return g; };
    const nucG = addDrift(P.group(P.root), 0.7, 0.02);
    P.add(carve(nucF, nucTint, [-1.72, -1.15, -1.55], [0.82, 1.35, 0.14], 0.032), tissue(10, 0.3, { roughness: 0.5 }), nucG);
    const chrom = P.mat('wet', '#83557f', { roughness: 0.5 });
    const rn = kit.rng(5);
    for (let i = 0; i < 7; i++) {
      const pts = []; let a = rn() * 6.28, r = 0.3 + rn() * 0.55;
      for (let k = 0; k < 6; k++) { pts.push([NC[0] + Math.cos(a) * r, NC[1] + Math.sin(a) * r, -0.55 + rn() * 0.4]); a += 0.45 + rn() * 0.3; r += (rn() - 0.5) * 0.14; }
      P.add(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p))), 24, 0.02, 6), chrom, nucG);
    }
    const erG = addDrift(P.group(P.root), 2.1, 0.018);
    const erMat = P.mat('wet', '#8d6b9c', { roughness: 0.42 });
    const erPts = [];
    [1.32, 1.56, 1.8].forEach((rr, band) => {
      const arc = [];
      for (let k = 0; k <= 14; k++) { const a = -2.5 + band * 0.08 + (k / 14) * 3.05; const wav = rr + 0.08 * Math.sin(k * 1.9 + band); arc.push([NC[0] + Math.cos(a) * wav, NC[1] + Math.sin(a) * wav, -0.35 + 0.1 * Math.sin(k * 1.1 + band * 2)]); }
      const c = new T.CatmullRomCurve3(arc.map((p) => new T.Vector3(...p)));
      const mesh = P.add(new T.TubeGeometry(c, 120, 0.075, 10), erMat, erG);
      void mesh;
      erPts.push(c);
    });
    [[1.32, 0.15], [1.56, 0.5], [1.32, 0.55]].forEach(([rr, u0], i) => { erPts.push(null); void rr; void u0; void i; });
    const ERC = erPts.filter(Boolean);
    const COUNT = 330, ribo = new T.InstancedMesh(new T.IcosahedronGeometry(0.03, 1), P.mat('wet', '#d9c2dc', { roughness: 0.5 }), COUNT);
    ribo.frustumCulled = false; erG.add(ribo);
    const dd0 = new T.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const c = ERC[i % ERC.length], u = rn(), p = c.getPointAt(u), t0 = c.getTangentAt(u), side = rn() > 0.5 ? 1 : -1;
      const nrm = new T.Vector3(-t0.y, t0.x, 0).normalize().multiplyScalar(side * 0.088).add(new T.Vector3(0, 0, (rn() - 0.3) * 0.08));
      dd0.position.copy(p).add(nrm); dd0.updateMatrix(); ribo.setMatrixAt(i, dd0.matrix);
    }
    const free = new T.InstancedMesh(new T.IcosahedronGeometry(0.026, 1), ribo.material, 60);
    free.frustumCulled = false; P.root.add(free);
    for (let i = 0; i < 60; i++) { const a = rn() * 6.28, r = 1.7 + rn() * 1.2; dd0.position.set(0.3 + Math.cos(a) * r, Math.sin(a) * r * 0.85, -0.5 + rn() * 0.6); dd0.updateMatrix(); free.setMatrixAt(i, dd0.matrix); }
    const beanLine = [[-0.42, -0.08, 0, -0.14, 0.09, 0, 0.14, 0.14], [-0.14, 0.09, 0, 0.14, 0.09, 0, 0.17, 0.17], [0.14, 0.09, 0, 0.42, -0.08, 0, 0.14, 0.14]];
    const bean = blob(beanLine, 0.1);
    const beanF = (x, y, z) => {
      const dd = bean(x, y, z);
      const shell = Math.abs(dd + 0.0) - 0.017, inner = Math.abs(dd + 0.045) - 0.012;
      const fin = Math.abs(Math.abs(((x * 7.5 % 1) + 1) % 1 - 0.5) - 0.25) - 0.075;
      const alt = ((Math.floor(x * 7.5 + 100) % 2) === 0) ? y - 0.1 : -(y - 0.04);
      const cristae = Math.max(Math.max(dd + 0.045, fin), alt - 0.18);
      return Math.max(Math.min(Math.min(shell, inner), cristae), z - 0.03);
    };
    const cO = paint('#b56a3e'), cI = paint('#6f3722'), cF = paint('#e2a770');
    const beanTint = (x, y, z, c) => { const dd = bean(x, y, z); if (dd < -0.06 && z > -0.05) c.copy(cF); else c.copy(z > 0.015 ? cF : dd > -0.02 ? cO : cI); };
    const beanGeo = carve(beanF, beanTint, [-0.62, -0.32, -0.26], [0.62, 0.32, 0.06], 0.0135);
    const beanMat = tissue(14, 0.1, { roughness: 0.45 });
    const mitos = [[1.7, -0.7, -0.05, 0.3, 1.35], [0.85, -1.75, -0.05, -0.45, 1.25], [-1.55, -1.55, -0.1, 0.7, 1.3], [-2.05, 1.05, -0.1, 1.2, 1.2], [2.25, 0.5, -0.1, 1.5, 1.05]];
    const mitoGroups = mitos.map(([x, y, z, rz, s], i) => { const g = addDrift(P.group(P.root, [x, y, z]), 3 + i, 0.05); g.rotation.z = rz; g.scale.setScalar(s); P.add(beanGeo, beanMat, g); return g; });
    const golgiG = addDrift(P.group(P.root, [1.25, 1.62, -0.1]), 9.2, 0.03);
    golgiG.rotation.z = -0.75;
    const golgiMat = P.mat('wet', '#c4984e', { roughness: 0.4 });
    for (let i = 0; i < 5; i++) {
      const rr = 0.45 + i * 0.14, half = 0.95 - i * 0.05, pts = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 - half + (k / 10) * half * 2; pts.push(new T.Vector3(Math.cos(a) * rr, Math.sin(a) * rr - 0.75, 0.015 * Math.sin(k))); }
      const m = P.add(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, 0.052, 10), golgiMat, golgiG);
      m.scale.z = 2.6;
      [-1, 1].forEach((s) => { const a = Math.PI / 2 + s * (half + 0.1); P.add(new T.SphereGeometry(0.07, 12, 9), golgiMat, golgiG, [Math.cos(a) * rr, Math.sin(a) * rr - 0.75, 0]); });
    }
    const lumpF = blob([[-0.05, 0, 0, 0.05, 0.03, 0, 0.13, 0.13], [0.02, -0.06, 0.04, 0.02, -0.06, 0.04, 0.08, 0.08], [0, 0.08, -0.03, 0, 0.08, -0.03, 0.07, 0.07]], 0.05);
    const lumpTint = (x, y, z, c) => c.set('#65406f').lerp(paint('#2f1c3a'), clamp(0.5 + 0.5 * Math.sin(x * 40) * Math.sin(y * 37)) * 0.8);
    const lumpGeo = carve(lumpF, lumpTint, [-0.24, -0.24, -0.2], [0.24, 0.24, 0.2], 0.018);
    const lumpMat = tissue(18, 0.3, { roughness: 0.34 });
    const lys = [[0.75, 0.15, 0.05], [2.6, -1.2, -0.05], [-0.15, -2.15, -0.05], [-2.55, -0.3, -0.05], [-0.75, 2.05, 0.05]].map((p, i) => { const g = addDrift(P.group(P.root, p), 5 + i * 1.4, 0.06); P.add(lumpGeo, lumpMat, g); return g; });
    P.anchor('membrane', P.root, [2.08, -2.16, 0.32], 1);
    P.anchor('nucleus', nucG, [-0.82, -0.25, -0.2], 1.3);
    P.anchor('mitochondrion', mitoGroups[0], [0, 0.05, 0.03], 0.75);
    P.anchor('reticulum', erG, [NC[0] + Math.cos(-0.9) * 1.56, NC[1] + Math.sin(-0.9) * 1.56, -0.3], 0.8);
    P.anchor('golgi', golgiG, [0, -0.03, 0.05], 0.8);
    P.anchor('ribosome', erG, [0, 0, 0], 0.5);
    { const m = new T.Matrix4(); ribo.getMatrixAt(2 + 3 * 40, m); const v = new T.Vector3().setFromMatrixPosition(m); P.anchors.ribosome.place([v.x, v.y, v.z]); }
    P.anchor('lysosome', lys[0], [0, 0, 0.1], 0.5);
    return {
      radius: 3.25,
      update(m) {
        const t = m.drift.tau;
        drift.forEach((d) => {
          d.g.position.set(d.base.x + Math.sin(t * 0.33 + d.seed) * d.amp, d.base.y + Math.cos(t * 0.27 + d.seed * 1.7) * d.amp, d.base.z);
          d.g.rotation.z = d.rot + Math.sin(t * 0.21 + d.seed) * 0.04;
        });
      },
    };
  },
});

PART('dnaHelix', {
  doc: 'A true right-handed DNA double helix with about 10.5 base pairs a turn, a major and a minor groove, and base-pair rungs in four colours, A always with T and C always with G. On unzip a fork opens from the top down and a new strand builds on each exposed strand, each new base the true partner of the old one, so the pairing cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['backbone', 'basePair', 'fork', 'newStrand'],
  motions: { spin: 'the helix turns slowly about its axis', unzip: 'over about 8 s a fork opens from the top down and new gold strands build on both exposed strands, then each pair twists up as a new helix' },
  views: { front: [0, 4], left: [-30, 10], right: [30, 10], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const SEQ = 'ATGCGTACCTGAAGTCGATTCAGGCTAACGTTGCAT'.split(''), N = SEQ.length, PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
    const COL = { A: paint('#c4634c'), T: paint('#d2a955'), G: paint('#5a8fc2'), C: paint('#5fa883') };
    const R = 0.82, RISE = 0.158, TURN = (2 * Math.PI) / 10.5, GROOVE = (140 * Math.PI) / 180;
    const spinG = P.group(P.root);
    const yOf = (i) => ((N - 1) / 2 - i) * RISE;
    const smooth = (v) => { const q = clamp(v); return q * q * (3 - 2 * q); };
    const points = (f) => {
      const old = [[], []], fresh = [[], []], shown = [[], []];
      for (let i = 0; i < N; i++) {
        const y = yOf(i), th = -i * TURN;
        const open = smooth((f - i) / 6), wind = smooth((f - i - 16) / 18), side = [-1, 1];
        [0, 1].forEach((s) => {
          const a = th - (s ? GROOVE : 0);
          const hx = R * Math.cos(a), hz = -R * Math.sin(a);
          const cx = side[s] * 1.62, base = s ? Math.PI : 0, rr = 0.62;
          const phi = base + wind * (y * (TURN / RISE));
          const dirOut = side[s];
          const fx = cx + dirOut * rr * Math.cos(wind * y * (TURN / RISE)), fz = -dirOut * rr * Math.sin(wind * y * (TURN / RISE));
          const nx = cx - dirOut * rr * Math.cos(wind * y * (TURN / RISE)), nz = dirOut * rr * Math.sin(wind * y * (TURN / RISE));
          old[s][i] = [hx + (fx - hx) * open, y, hz + (fz - hz) * open];
          fresh[s][i] = [nx, y, nz];
          shown[s][i] = smooth((f - i - 5) / 2.4);
          void phi;
        });
      }
      return { old, fresh, shown };
    };
    const beadGeo = new T.SphereGeometry(0.085, 12, 9), linkGeo = new T.CylinderGeometry(0.052, 0.052, 1, 8), rungGeo = new T.CapsuleGeometry(0.058, 1, 3, 8);
    const SUB = 3, LINKS = (N - 1) * SUB;
    const oldMat = P.mat('wet', '#858a94', { roughness: 0.42 }), newMat = P.mat('wet', '#d9ac62', { roughness: 0.36 });
    const inst = (geo, mat, n) => { const m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = true; spinG.add(m); return m; };
    const oldBeads = inst(beadGeo, oldMat, 2 * N), newBeads = inst(beadGeo, newMat, 2 * N), oldLinks = inst(linkGeo, oldMat, 2 * LINKS), newLinks = inst(linkGeo, newMat, 2 * LINKS);
    const rungs = inst(rungGeo, P.mat('wet', '#ffffff', { roughness: 0.42 }), 4 * N);
    for (let i = 0; i < N; i++) [0, 1].forEach((s) => {
      const letter = s ? PAIR[SEQ[i]] : SEQ[i];
      rungs.setColorAt(s * N + i, COL[letter]);
      rungs.setColorAt((s + 2) * N + i, COL[PAIR[letter]]);
    });
    const d = new T.Object3D(), Y = new T.Vector3(0, 1, 0), dv = new T.Vector3();
    const put = (m, i, p, s) => { d.position.set(p[0], p[1], p[2]); d.quaternion.identity(); d.scale.setScalar(s); d.updateMatrix(); m.setMatrixAt(i, d.matrix); };
    const span = (m, i, a, b, cap, w) => {
      dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = dv.length();
      d.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      if (len < 1e-5) { d.scale.setScalar(0); d.updateMatrix(); m.setMatrixAt(i, d.matrix); return; }
      d.quaternion.setFromUnitVectors(Y, dv.divideScalar(len)); d.scale.set(w, Math.max(len / cap, 0.0001), w); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    };
    const catm = (Q, i, f) => { const a = Q[Math.max(i - 1, 0)], b = Q[i], c = Q[Math.min(i + 1, N - 1)], e = Q[Math.min(i + 2, N - 1)], f2 = f * f, f3 = f2 * f; return [0, 1, 2].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - e[k]) * f2 + (-a[k] + 3 * b[k] - 3 * c[k] + e[k]) * f3)); };
    const mid = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const backboneA = P.anchor('backbone', spinG, [0, 0, 0], 1.1), pairA = P.anchor('basePair', spinG, [0, 0, 0], 1), forkA = P.anchor('fork', spinG, [0, 0, 0], 1.3), newA = P.anchor('newStrand', spinG, [0, 0, 0], 1.3);
    return {
      radius: 3,
      update(m) {
        spinG.rotation.y = -m.spin.tau * 0.5;
        const f = m.unzip.tau * 5.5;
        const { old, fresh, shown } = points(f);
        [0, 1].forEach((s) => {
          for (let i = 0; i < N; i++) {
            put(oldBeads, s * N + i, old[s][i], 1);
            const k = shown[s][i]; const flyIn = [fresh[s][i][0], fresh[s][i][1] + (1 - k) * 0.5, fresh[s][i][2]];
            put(newBeads, s * N + i, flyIn, k);
            const open = smooth((f - i) / 6);
            const other = old[1 - s][i], meet = [0, 0, 0].map((_, q) => (old[s][i][q] + other[q]) / 2);
            const partner = fresh[s][i], endOpen = mid(old[s][i], partner, 0.48);
            const target = mid(meet, endOpen, open);
            span(rungs, s * N + i, old[s][i], mid(old[s][i], target, 0.96), 1.12, 1);
            if (k > 0.001) span(rungs, (s + 2) * N + i, flyIn, mid(flyIn, mid(partner, old[s][i], 0.48), k), 1.12, k); else span(rungs, (s + 2) * N + i, flyIn, flyIn, 1, 0);
          }
          for (let n = 0; n < LINKS; n++) {
            const i = Math.floor(n / SUB), a = (n % SUB) / SUB, b = a + 1 / SUB;
            span(oldLinks, s * LINKS + n, catm(old[s], i, a), catm(old[s], i, b), 1, 1);
            const k = Math.min(shown[s][i], shown[s][Math.min(i + 1, N - 1)]);
            if (k > 0.5) span(newLinks, s * LINKS + n, catm(fresh[s], i, a), catm(fresh[s], i, b), 1, 1); else span(newLinks, s * LINKS + n, [0, 99, 0], [0, 99, 0], 1, 0);
          }
        });
        [oldBeads, newBeads, oldLinks, newLinks, rungs].forEach((x) => { x.instanceMatrix.needsUpdate = true; });
        if (rungs.instanceColor) rungs.instanceColor.needsUpdate = true;
        const mi = Math.floor(N * 0.72), up = Math.floor(N * 0.35);
        backboneA.place(old[0][mi]);
        pairA.place(mid(mid(old[0][up], old[1][up], 0.5), mid(old[0][up], fresh[0][up], 0.5), smooth((f - up) / 6)));
        const fi = Math.min(N - 1, Math.max(0, Math.round(f - 2)));
        forkA.place(mid(old[0][fi], old[1][fi], 0.5));
        newA.place(fresh[0][Math.max(1, Math.min(N - 2, Math.round(f - 12)))]);
      },
    };
  },
});

PART('plantLeaf', {
  doc: 'A real plant in cut-away soil: veined leaves on a stem, branching roots. Sun rays land on the leaf, carbon dioxide beads enter the leaf, water beads rise from the roots up the stem, oxygen beads leave the leaf, sugar beads travel down from the leaf. Every direction is fixed, so none can be set backwards.',
  args: 'none',
  stage: 'studio',
  anchors: ['leaf', 'stem', 'root', 'sunlight', 'carbonDioxide', 'oxygen', 'water'],
  motions: { photosynthesis: 'sun rays light the leaf, carbon dioxide goes in, water rises, oxygen leaves, sugar travels down' },
  views: { front: [0, 6], left: [-24, 10], right: [24, 10], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const rn = kit.rng(4);
    const shift = P.group(P.root, [0, 0.3, 0]);
    const soilTop = (x, z) => -1.55 + 0.05 * Math.sin(x * 4.1 + z * 2) + 0.03 * Math.sin(x * 9 + 1.5);
    const soilF = (x, y, z) => { const box = Math.max(Math.abs(x) - 2.5, Math.abs(z + 0.5) - 0.9, -2.95 - y); return Math.max(box, y - soilTop(x, z) ) + 0.012 * Math.sin(x * 21) * Math.sin(y * 19 + z * 11); };
    const soilA = paint('#3b2a1f'), soilB = paint('#5a4230');
    const soilTint = (x, y, z, c) => { c.copy(soilA).lerp(soilB, clamp(0.5 + 0.5 * Math.sin(x * 13 + y * 17) * Math.sin(y * 23 - x * 7))); };
    P.add(carve(soilF, soilTint, [-2.6, -3.05, -1.5], [2.6, -1.4, 0.46], 0.05), tissue(16, 0.6, { roughness: 0.95, clearcoat: 0 }), shift);

    const TX = 96, tex = new Uint8Array(TX * TX * 4);
    const dark = paint('#3f6a2f'), mid = paint('#5a8a3e'), vein = paint('#b5cf86'), cc = new T.Color();
    const veinAt = (u, v) => {
      const dx = Math.abs(u - 0.5); let w = clamp(1 - dx / 0.014);
      const f = (v * 7 + dx * 7.5);
      const q = Math.abs(((f % 1) + 1) % 1 - 0.5);
      w = Math.max(w, clamp(1 - q / 0.05) * 0.8);
      const net = Math.abs(Math.sin(u * 60) * Math.sin(v * 70));
      return Math.max(w, (net < 0.05 ? 0.25 : 0));
    };
    each(TX, (y) => each(TX, (x) => {
      const u = x / (TX - 1), v = y / (TX - 1), w = veinAt(u, v);
      cc.copy(dark).lerp(mid, 0.4 + 0.5 * Math.sin(v * 3.1) * (1 - Math.abs(u - 0.5))).lerp(vein, w);
      const i = (x + y * TX) * 4;
      tex[i] = Math.round(cc.r ** (1 / 2.2) * 255); tex[i + 1] = Math.round(cc.g ** (1 / 2.2) * 255); tex[i + 2] = Math.round(cc.b ** (1 / 2.2) * 255); tex[i + 3] = 255;
    }));
    const map = new T.DataTexture(tex, TX, TX, T.RGBAFormat); map.colorSpace = T.SRGBColorSpace; map.magFilter = T.LinearFilter; map.minFilter = T.LinearFilter; map.needsUpdate = true;
    const leafMat = P.mat('wet', '#ffffff', { map, side: T.DoubleSide, roughness: 0.46, clearcoat: 0.35 });
    const outline = (v) => 0.5 * Math.sin(Math.PI * Math.pow(v, 0.72)) ** 0.82;
    const leafGeo = (() => {
      const g = new T.PlaneGeometry(1, 1, 22, 40), p = g.attributes.position, uv = g.attributes.uv;
      each(p.count, (i) => {
        const su = uv.getX(i) * 2 - 1, v = uv.getY(i);
        const hw = outline(v);
        const x = su * hw;
        const y = v;
        const fold = Math.abs(su) * hw * 0.34;
        const curl = -0.34 * (v - 0.25) ** 2;
        const wave = 0.018 * Math.sin(v * 18 + su * 2) * Math.abs(su);
        p.setXYZ(i, x, y, fold + curl + wave);
        uv.setXY(i, 0.5 + su * hw, v);
      });
      g.computeVertexNormals();
      return g;
    })();
    const leaves = [];
    const stemPts = [[0.02, -1.6, 0], [-0.03, -0.8, 0.02], [0.05, 0, 0], [-0.02, 0.8, -0.02], [0.04, 1.32, 0]];
    const stemC = new T.CatmullRomCurve3(stemPts.map((p) => new T.Vector3(...p)));
    const stemMat = P.mat('wet', '#5d7f3e', { roughness: 0.5 });
    P.add(new T.TubeGeometry(stemC, 40, 0.062, 12), stemMat, shift);
    const addLeaf = (u, side, len, rise, tw, pet) => {
      const b = stemC.getPointAt(u), tip = new T.Vector3(b.x + side * pet * 0.72, b.y + pet * 0.5, b.z + 0.12);
      const c = new T.CatmullRomCurve3([b, b.clone().lerp(tip, 0.5).add(new T.Vector3(0, 0.05, 0)), tip]);
      P.add(new T.TubeGeometry(c, 12, 0.026, 8), stemMat, shift);
      const g = P.group(shift, [tip.x, tip.y, tip.z]);
      g.rotation.z = -side * rise; g.rotation.y = side * tw; g.rotation.x = -0.34; g.scale.setScalar(len);
      P.add(leafGeo, leafMat, g);
      const rib = []; for (let k = 0; k <= 8; k++) { const v = (k / 8) * 0.98; rib.push(new T.Vector3(0, v, -0.34 * (v - 0.25) ** 2 + 0.002)); }
      P.add(new T.TubeGeometry(new T.CatmullRomCurve3(rib), 16, 0.009, 6), P.mat('wet', '#a9c27c', { roughness: 0.5 }), g);
      leaves.push({ g, b, tip, c });
      return leaves[leaves.length - 1];
    };
    const hero = addLeaf(0.72, 1, 2.2, 0.82, -0.22, 0.42);
    addLeaf(0.56, -1, 1.65, 0.95, 0.3, 0.38);
    addLeaf(0.33, 1, 1.25, 1.2, -0.45, 0.3);
    addLeaf(0.22, -1, 1.0, 1.25, 0.4, 0.26);
    addLeaf(0.9, -1, 1.2, 0.5, 0.25, 0.26);
    const rootMat = P.mat('wet', '#c9b08a', { roughness: 0.55 });
    const rootTips = [];
    const growRoot = (p, dir, len, r, gen) => {
      const b = dir.clone().add(new T.Vector3((rn() - 0.5) * 0.7, (rn() - 0.5) * 0.3, 0)).normalize();
      const end = p.clone().addScaledVector(b, len); end.z = 0.46;
      if (end.y < -2.85) end.y = -2.85; end.x = Math.max(-2.35, Math.min(2.35, end.x));
      const midP = p.clone().lerp(end, 0.5).add(new T.Vector3((rn() - 0.5) * 0.12, 0, 0));
      P.add(new T.TubeGeometry(new T.CatmullRomCurve3([p, midP, end]), 7, r, 6), rootMat, shift);
      if (gen === 0) { rootTips.push(end); return; }
      const sp = 0.38 + rn() * 0.4;
      growRoot(end, b.clone().applyAxisAngle(new T.Vector3(0, 0, 1), sp), len * 0.78, r * 0.72, gen - 1);
      growRoot(end, b.clone().applyAxisAngle(new T.Vector3(0, 0, 1), -sp * 1.1), len * 0.74, r * 0.7, gen - 1);
    };
    const crown = new T.Vector3(0.02, -1.6, 0.46);
    P.add(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0.02, -1.5, 0), new T.Vector3(0.02, -1.58, 0.3), crown]), 6, 0.05, 8), rootMat, shift);
    growRoot(crown, new T.Vector3(-0.45, -1, 0), 0.42, 0.04, 4);
    growRoot(crown, new T.Vector3(0.05, -1, 0), 0.42, 0.045, 4);
    growRoot(crown, new T.Vector3(0.5, -1, 0), 0.42, 0.04, 4);
    hero.g.updateMatrix(); shift.updateMatrix();
    const onHero = (su, v, lift) => { const hw = outline(v), x = su * hw, y = v, z = Math.abs(su) * hw * 0.34 - 0.34 * (v - 0.25) ** 2 + (lift ?? 0.02); const q = new T.Vector3(x, y, z).applyMatrix4(hero.g.matrix); return [q.x, q.y, q.z]; };
    const flows = [], rays = [];
    const add = (pts, opt) => { const f = beadsOnTop(P.beads(pts, { parent: shift, intensity: 1.8, ...opt })); flows.push(f); return f; };
    const sunDir = [-0.62, 0.72, 0.32];
    [[-0.3, 0.5], [0.25, 0.42], [0, 0.62], [-0.22, 0.28], [0.2, 0.74], [0.02, 0.86]].forEach(([su, v], i) => {
      const end = onHero(su, v, 0.03), start = [end[0] + sunDir[0] * 3.4, end[1] + sunDir[1] * 3.4, end[2] + sunDir[2] * 3.4];
      const r = P.own(kit.path({ id: `${P.id}.ray${i}`, points: [start, end], color: '#ffd98f', width: 2.4, glow: 1.5, opacity: 0.72, flow: 0.35, dash: 0, head: 0 }), shift);
      r.object.renderOrder = 5; r.object.material.depthTest = false;
      rays.push(r);
    });
    const co2Starts = [[2.9, 2.2, 0.8], [3.0, 1.1, 0.7], [2.85, 0.1, 0.8]];
    [[0.35, 0.55], [0.32, 0.4], [0.28, 0.25]].forEach(([su, v], i) => add([co2Starts[i], onHero(su * 1.4, v, 0.3), onHero(su, v, 0.02)], { count: 6, speed: 0.17, size: 15, color: '#c9ced6', seed: i + 3 }));
    const stemY = (u) => { const q = stemC.getPointAt(u); return [q.x, q.y, q.z + 0.03]; };
    const heroPet = [hero.b.x, hero.b.y, hero.b.z + 0.03], heroTip = [hero.tip.x, hero.tip.y, hero.tip.z + 0.03];
    const upStem = [stemY(0), stemY(0.2), stemY(0.45), stemY(0.72), heroPet, heroTip, onHero(0, 0.4, 0.03)];
    [0, 1, 2].forEach((i) => { const tp = rootTips[(i * 13 + 3) % rootTips.length]; add([[tp.x, tp.y, tp.z], [tp.x * 0.5, (tp.y - 1.6) / 2, 0.47], [0.02, -1.58, 0.3], ...upStem], { count: 10, speed: 0.09, size: 13, color: '#7fc4ff', seed: i + 8 }); });
    add([onHero(0, 0.72, 0.03), onHero(0, 0.2, 0.03), heroTip, heroPet, [stemY(0.72)[0] + 0.03, stemY(0.72)[1], 0.05], [stemY(0.45)[0] + 0.03, stemY(0.45)[1], 0.05], [stemY(0.1)[0] + 0.03, stemY(0.1)[1], 0.05], [0.05, -1.58, 0.3], [0.3, -2.3, 0.47]], { count: 12, speed: 0.08, size: 13, color: '#f2b24a', seed: 19 });
    [[-0.3, 0.72], [0.2, 0.86], [0.34, 0.5]].forEach(([su, v], i) => { const a = onHero(su, v, 0.04); add([a, [a[0] + 0.5, a[1] + 0.9, a[2] + 0.4], [a[0] + 0.8, a[1] + 2.2, a[2] + 0.5]], { count: 6, speed: 0.15, size: 15, color: '#a8f0d8', seed: 30 + i }); });
    P.anchor('leaf', hero.g, [0.17, 0.55, 0.1], 1.4);
    P.anchor('stem', shift, [0.04, -0.72, 0.06], 0.8);
    P.anchor('root', shift, [rootTips[12].x, rootTips[12].y, 0.47], 0.9);
    const sA = onHero(0, 0.62, 0.03);
    P.anchor('sunlight', shift, [sA[0] + sunDir[0] * 1.9, sA[1] + sunDir[1] * 1.9, sA[2] + sunDir[2] * 1.9], 1);
    P.anchor('carbonDioxide', shift, [2.75, 1.0, 0.65], 0.9);
    const oA = onHero(0.2, 0.86, 0.04);
    P.anchor('oxygen', shift, [oA[0] + 0.5, oA[1] + 0.9, oA[2] + 0.4], 0.9);
    P.anchor('water', shift, [0.04, -1.1, 0.07], 0.8);
    return {
      radius: 3.25,
      update(m) {
        const k = m.photosynthesis.tau > 0 ? clamp(m.photosynthesis.tau * 1.2) : 0;
        flows.forEach((f) => f.show(k)); rays.forEach((r) => r.show(k * 0.8));
      },
    };
  },
});

PART('neuron', {
  doc: 'A real nerve cell: a cell body with branching dendrites, a long axon wrapped in myelin sheath segments with gaps between them, and axon terminals. The electrical pulse runs one way only, from the cell body to the terminals, jumping gap to gap, and that direction cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['dendrite', 'cellBody', 'axon', 'myelin', 'terminal'],
  motions: { fire: 'a pulse every 2.8 s leaves the cell body, jumps along the myelin gaps and reaches the terminals' },
  views: { front: [0, 6], left: [-26, 8], right: [26, 8], flat: [0, 0] },
  build(kit, o, P) {
    const T = P.THREE;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return b + (a - b) * h - k * h * (1 - h); };
    const smax = (a, b, k) => -smin(-a, -b, k);
    const each = (n, fn) => new Int32Array(Math.max(0, n)).forEach((_, i) => fn(i));
    const blob = (list, k) => {
      const L = list.map(([ax, ay, az, bx, by, bz, r, r2]) => ({ ax, ay, az, dx: bx - ax, dy: by - ay, dz: bz - az, dd: (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2, r, dr: (r2 ?? r) - r }));
      return (x, y, z) => L.reduce((d, b) => {
        const px = x - b.ax, py = y - b.ay, pz = z - b.az;
        const h = b.dd > 0 ? clamp((px * b.dx + py * b.dy + pz * b.dz) / b.dd) : 0;
        const qx = px - b.dx * h, qy = py - b.dy * h, qz = pz - b.dz * h;
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) - (b.r + b.dr * h);
        return k > 0 ? smin(d, q, k) : Math.min(d, q);
      }, 1e9);
    };
    // Surface nets over a signed field, so a part can have a flat cut face and hollow chambers, which kit.organic cannot give without swelling its grid. Native iteration here because the sandbox times every plain loop step.
    const carve = (field, tint, min, max, cell, weight) => {
      const nx = Math.ceil((max[0] - min[0]) / cell) + 1, ny = Math.ceil((max[1] - min[1]) / cell) + 1, nz = Math.ceil((max[2] - min[2]) / cell) + 1;
      const vals = new Float32Array(nx * ny * nz), nxy = nx * ny, S = 4, far = cell * S * 1.3;
      const bn = (n) => Math.ceil(n / S);
      each(bn(nz), (kz) => each(bn(ny), (ky) => each(bn(nx), (kx) => {
        const bx = kx * S, by = ky * S, bz = kz * S;
        const c = field(min[0] + (bx + S / 2) * cell, min[1] + (by + S / 2) * cell, min[2] + (bz + S / 2) * cell);
        const skip = Math.abs(c) > far;
        each(Math.min(S, nz - bz), (dz) => each(Math.min(S, ny - by), (dy) => {
          const z = bz + dz, y = by + dy, row = nxy * z + nx * y;
          if (skip) { vals.fill(c, row + bx, row + Math.min(bx + S, nx)); return; }
          each(Math.min(S, nx - bx), (dx) => { const x = bx + dx; vals[row + x] = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell); });
        }));
      })));
      const vid = new Int32Array(nx * ny * nz).fill(-1), verts = [], idx = [];
      const cn = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      const eg = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
      const v = new Float32Array(8);
      each(nz - 1, (z) => each(ny - 1, (y) => { const row = nxy * z + nx * y; each(nx - 1, (x) => {
        const i0 = row + x, a0 = vals[i0], a1 = vals[i0 + 1], a2 = vals[i0 + nx], a3 = vals[i0 + nx + 1], a4 = vals[i0 + nxy], a5 = vals[i0 + nxy + 1], a6 = vals[i0 + nxy + nx], a7 = vals[i0 + nxy + nx + 1];
        const neg = (a0 < 0) + (a1 < 0) + (a2 < 0) + (a3 < 0) + (a4 < 0) + (a5 < 0) + (a6 < 0) + (a7 < 0);
        if (neg === 0 || neg === 8) return;
        v[0] = a0; v[1] = a1; v[2] = a2; v[3] = a3; v[4] = a4; v[5] = a5; v[6] = a6; v[7] = a7;
        let px = 0, py = 0, pz = 0, n = 0;
        eg.forEach(([a, b]) => {
          if ((v[a] < 0) === (v[b] < 0)) return;
          const t = v[a] / (v[a] - v[b]);
          px += cn[a][0] + t * (cn[b][0] - cn[a][0]); py += cn[a][1] + t * (cn[b][1] - cn[a][1]); pz += cn[a][2] + t * (cn[b][2] - cn[a][2]); n++;
        });
        vid[i0] = verts.length / 3;
        verts.push(min[0] + (x + px / n) * cell, min[1] + (y + py / n) * cell, min[2] + (z + pz / n) * cell);
      }); }));
      const I = (x, y, z) => x + nx * y + nxy * z;
      const quad = (a, b, c, d, f) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (f) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
      each(nz - 2, (z0) => each(ny - 2, (y0) => each(nx - 2, (x0) => {
        const x = x0 + 1, y = y0 + 1, z = z0 + 1, i0 = I(x, y, z), here = vals[i0] < 0;
        if (here !== (vals[i0 + 1] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[i0], vid[I(x, y - 1, z)], !here);
        if (here !== (vals[i0 + nx] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[i0], vid[I(x, y, z - 1)], !here);
        if (here !== (vals[i0 + nxy] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[i0], vid[I(x - 1, y, z)], !here);
      })));
      const nv = verts.length / 3, pos = new Float32Array(verts), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wgt = weight ? new Float32Array(nv * 2) : null;
      const e = cell * 0.8, c = new T.Color();
      each(nv, (i) => {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = field(x + e, y, z) - field(x - e, y, z), ay = field(x, y + e, z) - field(x, y - e, z), az = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(ax, ay, az) || 1, n0 = ax / l, n1 = ay / l, n2 = az / l;
        nor[i * 3] = n0; nor[i * 3 + 1] = n1; nor[i * 3 + 2] = n2;
        const ao = 0.6 * clamp(field(x + n0 * 0.06, y + n1 * 0.06, z + n2 * 0.06) / 0.06) + 0.4 * clamp(field(x + n0 * 0.2, y + n1 * 0.2, z + n2 * 0.2) / 0.2);
        const shade = 0.22 + 0.78 * ao * ao;
        tint(x, y, z, c, n2);
        col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
        if (wgt) { const w = weight(x, y, z); wgt[i * 2] = w[0]; wgt[i * 2 + 1] = w[1]; }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      if (wgt) geo.setAttribute('aG', new T.BufferAttribute(wgt, 2));
      geo.setIndex(idx);
      return geo;
    };
    // Same wet tissue bump as kit.organic. deform, when given, holds uniforms that shrink two weighted regions towards their centres.
    const tissue = (scale, amount, extra, deform) => {
      const m = P.mat('wet', '#ffffff', { vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6, ...extra });
      m.onBeforeCompile = (s) => {
        s.uniforms.uDS = { value: scale }; s.uniforms.uDA = { value: amount };
        if (deform) Object.assign(s.uniforms, deform);
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj;${deform ? ' attribute vec2 aG; uniform vec3 uC0,uC1; uniform vec2 uS;' : ''}`)
          .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); vObj=position;${deform ? ' transformed=mix(transformed,uC0+(transformed-uC0)*uS.x,aG.x); transformed=mix(transformed,uC1+(transformed-uC1)*uS.y,aG.y);' : ''}`);
        s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${kit.noiseGLSL}`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
              vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
              diffuseColor.rgb*=.74+.5*h; }`);
      };
      return m;
    };
    const paint = (hex) => new T.Color(hex);
    const beadsOnTop = (flow) => { const m = flow.object; m.material.depthTest = false; m.renderOrder = 6; return flow; };
    const ringAlong = (curve, us, r, tube, mat, parent) => {
      const geo = new T.TorusGeometry(r, tube, 8, 28), z = new T.Vector3(0, 0, 1);
      for (const u of us) { const m = P.add(geo, mat, parent); m.position.copy(curve.getPointAt(u)); m.quaternion.setFromUnitVectors(z, curve.getTangentAt(u)); }
    };
    const rn = kit.rng(9);
    const SOMA = [-3.1, 0.05, 0];
    const caps = [[SOMA[0] - 0.14, SOMA[1], 0, SOMA[0] + 0.2, SOMA[1] - 0.05, 0, 0.44, 0.4], [SOMA[0] + 0.25, SOMA[1] - 0.04, 0, SOMA[0] + 0.72, SOMA[1] - 0.08, 0, 0.3, 0.09]];
    const dendTips = [];
    const branch = (x, y, z, ang, len, r, gen) => {
      const a = ang + (rn() - 0.5) * 0.55, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, ez = z + (rn() - 0.5) * 0.28;
      caps.push([x, y, z, ex, ey, ez, r, r * 0.68]);
      if (gen === 0) { dendTips.push([ex, ey, ez]); return; }
      const sp = 0.42 + rn() * 0.32;
      branch(ex, ey, ez, a + sp, len * 0.78, r * 0.68, gen - 1);
      branch(ex, ey, ez, a - sp, len * 0.74, r * 0.66, gen - 1);
    };
    [[Math.PI * 0.95, 0.62], [Math.PI * 0.63, 0.6], [Math.PI * 1.32, 0.6], [Math.PI * 0.32, 0.52], [Math.PI * 1.66, 0.5]].forEach(([a, l]) => branch(SOMA[0] + Math.cos(a) * 0.32, SOMA[1] + Math.sin(a) * 0.32, 0, a, l, 0.14, 3));
    const cellF = blob(caps, 0.06);
    const nucleusAt = [SOMA[0] - 0.02, SOMA[1], 0];
    const cA = paint('#b58a78'), cB = paint('#8a5a54');
    const tint = (x, y, z, c) => { const q = Math.hypot(x - SOMA[0], y - SOMA[1]); c.copy(cA).lerp(cB, clamp(q / 1.8)); };
    P.add(carve(cellF, tint, [-5.05, -1.85, -0.8], [-2.1, 1.95, 0.8], 0.03), tissue(10, 0.3, { roughness: 0.5 }));
    const nu = P.add(new T.SphereGeometry(0.17, 20, 14), P.mat('wet', '#6b4560', { roughness: 0.4 }), P.root, [nucleusAt[0], nucleusAt[1], 0.41]);
    nu.scale.z = 0.5;
    const axPts = [[SOMA[0] + 0.7, SOMA[1] - 0.08, 0], [-1.7, -0.14, 0.03], [-0.5, 0.08, -0.02], [0.8, -0.1, 0.02], [2, 0.08, -0.02], [2.95, 0, 0]];
    const axC = new T.CatmullRomCurve3(axPts.map((p) => new T.Vector3(...p)));
    P.add(new T.TubeGeometry(axC, 120, 0.052, 10), P.mat('wet', '#a98172', { roughness: 0.5 }));
    const SEG = 8, segU0 = 0.05, segLen = 0.098, gapU = 0.016, profile = [];
    for (let i = 0; i <= 14; i++) { const q = i / 14; profile.push(new T.Vector2(0.135 * Math.pow(Math.sin(Math.PI * q), 0.32) + 0.05, (q - 0.5))); }
    const myGeo = new T.LatheGeometry(profile, 22);
    const segs = [];
    const yAxis = new T.Vector3(0, 1, 0), LEN = axC.getLength();
    for (let i = 0; i < SEG; i++) {
      const u = segU0 + (i + 0.5) * (segLen + gapU);
      const mat = P.mat('wet', '#b3a68c', { roughness: 0.5, clearcoat: 0.35, emissive: new T.Color('#ffc986'), emissiveIntensity: 0 });
      const m = P.add(myGeo, mat);
      m.position.copy(axC.getPointAt(u)); m.quaternion.setFromUnitVectors(yAxis, axC.getTangentAt(u)); m.scale.set(1, segLen * LEN, 1);
      segs.push({ m, u, mat });
    }
    const termBase = axC.getPointAt(1), tips = [];
    const tMat = P.mat('wet', '#b28a78', { roughness: 0.45 });
    const termBranches = [];
    [[0.62, 0.42], [0.18, 0.5], [-0.24, 0.5], [-0.66, 0.42]].forEach(([a, l]) => {
      const m0 = new T.Vector3(termBase.x + Math.cos(a) * l * 0.55, termBase.y + Math.sin(a) * l * 0.55, (rn() - 0.5) * 0.12);
      [0.34, -0.3].forEach((da) => {
        const e = new T.Vector3(m0.x + Math.cos(a + da) * l * 0.62, m0.y + Math.sin(a + da) * l * 0.62, m0.z + (rn() - 0.5) * 0.12);
        const c = new T.CatmullRomCurve3([termBase, m0, e]);
        P.add(new T.TubeGeometry(c, 16, 0.028, 8), tMat);
        const bouton = P.add(new T.SphereGeometry(0.085, 16, 12), P.mat('wet', '#c49a80', { roughness: 0.4, emissive: new T.Color('#ffc986'), emissiveIntensity: 0 }), P.root, [e.x, e.y, e.z]);
        bouton.scale.set(1.25, 0.92, 0.92);
        tips.push(e); termBranches.push({ c, bouton });
      });
    });
    const glow = P.own(kit.glow({ id: `${P.id}.pulse`, color: '#ffcf8a', size: 0.9, intensity: 2.2 }));
    glow.object.material.depthTest = false; glow.object.renderOrder = 7;
    const bursts = termBranches.map((b, i) => { const g = P.own(kit.glow({ id: `${P.id}.tp${i}`, color: '#ffcf8a', size: 0.42, intensity: 1.7 })); g.object.material.depthTest = false; g.object.renderOrder = 7; return g; });
    P.anchor('dendrite', P.root, [SOMA[0] - 1.05, SOMA[1] + 0.62, 0.05], 0.9);
    P.anchor('cellBody', P.root, [SOMA[0] + 0.05, SOMA[1] + 0.12, 0.34], 0.85);
    const gapU0 = segU0 + 3 * (segLen + gapU) - 0.0;
    const gp = axC.getPointAt(gapU0 + 0.005);
    P.anchor('axon', P.root, [gp.x, gp.y + 0.03, 0.05], 0.7);
    const my = axC.getPointAt(segs[5].u);
    P.anchor('myelin', P.root, [my.x, my.y + 0.12, 0.12], 0.7);
    P.anchor('terminal', P.root, [tips[2].x, tips[2].y, 0.08], 0.7);
    const OFF = 0.7, floating = [glow.object, ...bursts.map((b) => b.object)];
    P.root.children.forEach((c) => { if (!floating.includes(c)) c.position.x += OFF; });
    const PERIOD = 2.8;
    return {
      radius: 2.3,
      update(m) {
        const tau = m.fire.tau;
        if (tau <= 0) { glow.show(0); bursts.forEach((b) => b.show(0)); segs.forEach((s) => { s.mat.emissiveIntensity = 0; }); termBranches.forEach((b) => { b.bouton.material.emissiveIntensity = 0; }); return; }
        const f = (tau % PERIOD) / PERIOD;
        const axPhase = clamp(f / 0.72), termPhase = clamp((f - 0.72) / 0.18);
        // Saltatory conduction: the pulse dwells at each gap and leaps the sheath between them.
        const hops = axPhase * SEG, hop = Math.floor(hops), fr = hops - hop, stepF = fr * fr * (3 - 2 * fr);
        const edge = (i) => segU0 + i * (segLen + gapU);
        const u = Math.min(1, edge(hop) + (edge(hop + 1) - edge(hop)) * stepF);
        const u2 = axPhase >= 1 ? 1 : u;
        const head = axC.getPointAt(u2);
        const alive = f < 0.72 ? clamp(f * 40) : 0;
        glow.place([head.x + OFF, head.y, head.z]); glow.show(alive);
        segs.forEach((s) => { const dd = Math.abs(s.u - u2); s.mat.emissiveIntensity = alive * 0.55 * clamp(1 - dd / 0.09); });
        termBranches.forEach((b, i) => {
          const on = f >= 0.72 && f < 0.97;
          const q = b.c.getPointAt(termPhase);
          bursts[i].place([q.x + OFF, q.y, q.z]); bursts[i].show(on ? 1 - clamp((f - 0.9) / 0.07) : 0);
          b.bouton.material.emissiveIntensity = f > 0.84 ? 0.5 * clamp(1 - (f - 0.86) / 0.14) * clamp((f - 0.84) / 0.03) : 0;
        });
      },
    };
  },
});
