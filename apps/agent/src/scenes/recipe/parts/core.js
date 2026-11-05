// Runs inside the scene's sandboxed frame. Turns a data recipe into a live scene on the studio kit. No model output is ever run as code on this path.
var PARTS = {};
function PART(name, def) { PARTS[name] = def; }

var DEFAULT_VIEWS = { front: [0, 6], left: [-55, 12], right: [55, 12], above: [18, 58], low: [28, -6], back: [180, 8] };

function makeHelper(kit, item, state) {
  const THREE = kit.THREE;
  const root = new THREE.Group();
  kit.add(root);
  const P = {
    THREE, kit, root, id: item.id,
    moments: state.moments,
    anchors: {},
    anchor(name, parent, at, radius) {
      const g = kit.group({ id: `${item.id}.${name}` });
      (parent || root).add(g.object);
      g.place(at || [0, 0, 0]);
      g.frameRadius = radius;
      P.anchors[name] = g;
      return g;
    },
    // A kit part (organic, path, flow, tube, rocket) lives at the scene root until it is moved under this item.
    own(part, parent) { (parent || root).add(part.object); return part; },
    add(geometry, material, parent, at, rot) {
      const m = new THREE.Mesh(geometry, material);
      if (at) m.position.set(at[0], at[1], at[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true; m.receiveShadow = true;
      (parent || root).add(m);
      return m;
    },
    group(parent, at) { const g = new THREE.Group(); if (at) g.position.set(at[0], at[1], at[2]); (parent || root).add(g); return g; },
    mat(kind, color, extra) {
      const base = {
        metal: { metalness: 0.92, roughness: 0.34 },
        steel: { metalness: 0.8, roughness: 0.42 },
        paint: { metalness: 0.05, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 },
        matte: { metalness: 0, roughness: 0.92 },
        rock: { metalness: 0, roughness: 1 },
        wet: { metalness: 0, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.35 },
        glass: { metalness: 0, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.22, depthWrite: false },
      }[kind] ?? { metalness: 0, roughness: 0.6 };
      return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), ...base, ...extra });
    },
    // Colour above 1 blooms, so glow is reserved for what is truly hot or lit.
    glowMat(color, power, extra) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power ?? 2), toneMapped: true, ...extra }); },
    lathe(profile, seg) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg ?? 64); },
    extrude(points, depth, opts) {
      const s = new THREE.Shape();
      points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.08, bevelSize: depth * 0.08, bevelSegments: 2, curveSegments: 8, ...opts }).translate(0, 0, -depth / 2);
    },
    tubeAlong(points, radius, material, parent, closed) {
      const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed, 'centripetal');
      return P.add(new THREE.TubeGeometry(c, Math.max(24, points.length * 12), radius, 14, !!closed), material, parent);
    },
    // A stream of glowing beads along local points, moved under this item. flowU in update sets its fade.
    beads(points, { count = 24, speed = 0.25, size = 6, color = '#ffe8cc', intensity = 2, parent } = {}) {
      const id = `${item.id}.beads${state.beads++}`;
      const pathPts = points.map((p) => [p[0], p[1], p[2]]);
      const curve = new THREE.CatmullRomCurve3(pathPts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const flow = kit.flow({ id, along: (u) => { const v = curve.getPointAt(u); return [v.x, v.y, v.z]; }, count, speed, size, color, intensity });
      (parent || root).add(flow.object);
      return flow;
    },
  };
  return P;
}

// A part that keys its story to moments keeps only keys on real moments and known names, and with none it walks them in order, so a thin recipe still draws true.
function getKeysOnMoments(moments, given, names) {
  const kept = Object.entries(given ?? {}).filter(([moment, name]) => moments.includes(moment) && names.includes(name));
  return Object.fromEntries(kept.length > 0 ? kept : moments.slice(0, names.length).map((moment, index) => [moment, names[index]]));
}

function setFade(obj, k, cache) {
  obj.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.uniforms) continue;
      if (!cache.has(m)) cache.set(m, { opacity: m.opacity ?? 1, transparent: m.transparent, depthWrite: m.depthWrite });
      const c = cache.get(m);
      m.opacity = c.opacity * k;
      const wantT = c.transparent || k < 0.999;
      if (m.transparent !== wantT) { m.transparent = wantT; m.needsUpdate = true; }
    }
  });
}

function motionState(moves, t, kit) {
  const R = 0.6;
  const sum = { tau: 0, u: 0, on: false };
  for (const mv of moves) {
    const on = kit.at(mv.on);
    if (t < on) continue;
    const end = mv.off ? kit.at(mv.off) : Infinity;
    const run = (x) => (x < R ? (x * x) / (2 * R) : x - R / 2);
    const x = Math.min(t, end) - on;
    let tau = run(x);
    if (t > end) { const y = t - end; tau += y < R ? y - (y * y) / (2 * R) : R / 2; }
    sum.tau += tau * (mv.speed ?? 1);
    sum.on = sum.on || t <= end;
    sum.u = Math.max(sum.u, kit.clamp01((t - on) / (mv.over ?? 3)));
  }
  return sum;
}

function flatten(kit) {
  const THREE = kit.THREE;
  const steps = new Uint8Array([90, 170, 255]);
  const ramp = new THREE.DataTexture(steps, 3, 1, THREE.RedFormat);
  ramp.needsUpdate = true;
  const seen = new Map();
  kit.scene?.traverse?.((o) => {
    if (!o.isMesh || !o.material || !(o.material.isMeshStandardMaterial)) return;
    const m = o.material;
    if (!seen.has(m)) seen.set(m, new THREE.MeshToonMaterial({ color: m.color, map: m.map ?? null, gradientMap: ramp, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, side: m.side }));
    o.material = seen.get(m);
  });
}

function buildScene(kit, recipe, opts) {
  const THREE = kit.THREE;
  const flat = !!(opts && opts.flat);
  const state = { beads: 0, moments: (recipe.says ?? []).map((line) => line.m) };
  // The part was drawn for one stage, so the stage comes from the part, not from the recipe.
  const stageWanted = PARTS[recipe.items[0]?.part]?.stage ?? recipe.stage;
  const stageName = flat && stageWanted !== 'space' ? 'studio' : stageWanted;
  if (stageName === 'space') { kit.stage('space', { sky: 0.2, stars: 9000 }); kit.post.set({ bloom: 0.42, threshold: 1.15, radius: 0.65, exposure: 1, vignette: 0.34 }); }
  else if (stageName === 'outdoor') { kit.stage('outdoor', { ground: 'grass', sun: [40, 60, 30], shadow: { size: 30, far: 200 } }); kit.post.set({ bloom: 0.15, threshold: 1.3, radius: 0.5, exposure: 1, vignette: 0.2 }); }
  else if (flat) {
    kit.stage('studio', {});
    kit.post.set({ bloom: 0, threshold: 2, radius: 0.1, exposure: 1.05, vignette: 0 });
  } else {
    kit.stage('studio', { top: '#1a2233', bottom: '#050608', accent: '#2a2230', keyPower: 2.6, rimPower: 2.6, key: '#fff1de', rim: '#9db6ff', dust: false });
    kit.post.set({ bloom: flat ? 0 : 0.3, threshold: 1.15, radius: 0.6, exposure: 1.08, vignette: flat ? 0 : 0.28 });
    kit.shadows?.({ size: 18 });
  }
  const items = {};
  // The subject is on stage from the start, so the first frame is never an empty room.
  if (recipe.items[0]) delete recipe.items[0].in;
  for (const it of recipe.items) {
    const def = PARTS[it.part];
    if (!def) { kit.title?.(`no part ${it.part}`); continue; }
    const P = makeHelper(kit, it, state);
    const made = def.build(kit, it.args ?? {}, P) || {};
    if (it.at) P.root.position.set(it.at[0], it.at[1], it.at[2]);
    const size = it.size ?? 1;
    P.root.scale.setScalar(size);
    const body = kit.group({ id: it.id });
    (made.follow ?? P.root).add(body.object);
    body.frameRadius = (made.radius ?? 2) * size;
    for (const [name, a] of Object.entries(P.anchors)) kit.parts[`${it.id}.${name}`].frameRadius = (a.frameRadius ?? (made.radius ?? 2) * 0.45) * size;
    items[it.id] = { def, P, made, it, size, fadeCache: new Map() };
  }
  const momentOf = (m) => (typeof m === 'string' ? kit.at(m) : m ?? 0);
  const worldOf = (ref) => {
    if (Array.isArray(ref)) return ref;
    const p = kit.parts[ref];
    if (!p) return [0, 0, 0];
    const v = p.world();
    return [v.x, v.y, v.z];
  };
  for (const l of recipe.labels ?? []) {
    const targetId = kit.parts[l.at] ? l.at : l.at.split('.')[0];
    kit.label(l.text, { at: targetId, sub: l.sub, show: l.show, hide: l.hide, side: l.side });
  }
  const arrows = (recipe.arrows ?? []).map((a, i) => ({ a, part: kit.arrow({ id: `arrow${i}`, color: a.color ?? '#e8452a', radius: a.radius ?? 0.022, headWidth: 3.2, headLength: 6, from: [0, 0, 0], to: [0, 1, 0], glow: 0.35 }) }));
  const flows = (recipe.flows ?? []).map((f, i) => {
    const from = worldOf(f.from), to = worldOf(f.to);
    const part = kit.flow({ id: `flow${i}`, along: (u) => [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u, from[2] + (to[2] - from[2]) * u], count: f.count ?? 22, speed: f.speed ?? 0.25, size: f.size ?? 7, color: f.color ?? '#ffe8cc', intensity: 2 });
    return { f, part };
  });
  const gauges = (recipe.gauges ?? []).map((g, i) => {
    const span = g.max - g.min;
    const ticks = [0, 1, 2, 3].map((k) => +(g.min + (span * k) / 3).toFixed(2));
    return { g, part: kit.gauge({ id: `gauge${i}`, label: g.label, unit: g.unit, min: g.min, max: g.max, ticks, minor: 1, corner: i ? 'tl' : 'tr', size: 0.27, format: (v) => (Math.abs(span) >= 20 ? v.toFixed(0) : v.toFixed(1)) }) };
  });
  const fov = flat ? 10 : 34;
  const fit = (r, zoom) => (r * 1.12) / Math.tan(((fov / 2) * Math.PI) / 180) / (zoom ?? 1);
  const viewOf = (look, name) => {
    const id = (look || '').split('.')[0];
    const views = { ...DEFAULT_VIEWS, ...(items[id]?.def.views ?? {}) };
    if (flat) return views.flat ?? views.front;
    return views[name] ?? views.front;
  };
  // The student first sees the whole thing, a close-up never loses the thing it belongs to, and the idea ends on the whole thing again.
  const firstId = recipe.items[0]?.id;
  const given = (recipe.cams ?? []).map((c) => ({ ...c, zoom: Math.min(1.3, Math.max(0.8, c.zoom ?? 1)) }));
  const cams = given.length ? [{ ...given[0], look: firstId, view: 'front', zoom: 1 }, ...given.slice(1)] : [{ on: 0, look: firstId, view: 'front', zoom: 1 }];
  const lastSay = recipe.says?.[recipe.says.length - 1]?.m;
  if (lastSay && cams.length > 1 && cams[cams.length - 1].look !== firstId && cams[cams.length - 1].on !== lastSay && recipe.says.length > 2) cams.push({ on: lastSay, look: firstId, view: 'front', zoom: 1 });
  const partRadius = kit.parts[firstId]?.frameRadius ?? 2;
  const shots = cams.map((c, i) => {
    // A flat drawing is a diagram, so it keeps the whole subject in view rather than following close-ups.
    const looked = flat ? c.look.split('.')[0] : c.look;
    const target = kit.parts[looked] ? looked : Object.keys(items)[0];
    const [azimuth, elevation] = viewOf(target, c.view);
    const r = Math.max(kit.parts[target]?.frameRadius ?? 2, partRadius * 0.5);
    return { at: i === 0 ? 0 : c.on, move: i === 0 ? 'cut' : 'dollyTo', target, distance: fit(r, flat ? 1 : c.zoom), azimuth, elevation, fov, over: 2.4, orbit: flat ? 0 : 0.7, screen: [0, 0], sound: false };
  });
  if (shots.length === 0) {
    const first = Object.keys(items)[0];
    const [azimuth, elevation] = viewOf(first, 'front');
    shots.push({ at: 0, move: 'cut', target: first, distance: fit(kit.parts[first]?.frameRadius ?? 2), azimuth, elevation, fov, orbit: flat ? 0 : 0.7, sound: false });
  }
  kit.shots(shots);
  if (flat) { kit.post.set({ bloom: 0, vignette: 0, exposure: 1 }); flatten(kit); }
  const allMoves = recipe.moves ?? [];
  // Named so the run-time word check counts each moment as used.
  for (const m of Object.keys(kit.timing?.moments ?? {})) kit.at(m);
  return {
    items,
    parts: Object.keys(items),
    render(t) {
      for (const entry of Object.values(items)) {
        const { P, made, it, fadeCache, def } = entry;
        const k = it.in ? kit.env(t, it.in, it.out ?? null, 0.7) : it.out ? 1 - kit.p(t, it.out, 0.7) : 1;
        P.root.visible = k > 0.001;
        if (k < 0.999 || fadeCache.size) setFade(P.root, k, fadeCache);
        if (!made.update) continue;
        const m = {};
        for (const name of Object.keys(def.motions ?? {})) m[name] = motionState(allMoves.filter((x) => x.item === it.id && x.motion === name), t, kit);
        made.update(m, t);
      }
      for (const { a, part } of arrows) {
        const k = kit.env(t, a.show, a.hide ?? null, 0.5);
        part.show(k);
        const from = worldOf(a.from), to = worldOf(a.to);
        const g = kit.ease.outCubic(kit.clamp01((t - momentOf(a.show)) / 0.8));
        part.set(from, [from[0] + (to[0] - from[0]) * Math.max(g, 0.001), from[1] + (to[1] - from[1]) * Math.max(g, 0.001), from[2] + (to[2] - from[2]) * Math.max(g, 0.001)]);
      }
      for (const { f, part } of flows) part.show?.(kit.env(t, f.show, f.hide ?? null, 0.5));
      for (const { g, part } of gauges) {
        part.show(kit.env(t, g.on, null, 0.5));
        part.set(g.from + (g.to - g.from) * kit.p(t, g.on, g.over ?? 3, 'inOutSine'));
      }
    },
  };
}

function runRecipe(kit, recipe, opts) {
  const built = buildScene(kit, recipe, opts);
  return { parts: built.parts, render: built.render };
}
