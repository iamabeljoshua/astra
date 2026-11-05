PART('gearTrain', {
  doc: 'Real toothed gears in a row, meshing. Neighbours turn opposite ways, and a gear with fewer teeth turns faster, computed from the tooth counts, so direction and ratio cannot be set wrong.',
  args: 'teeth: array of 2 to 4 tooth counts, 10 to 60',
  stage: 'studio',
  anchors: ['gear0', 'gear1', 'gear2', 'gear3', 'mesh'],
  motions: { run: 'turns the train from the first gear' },
  views: { front: [0, 4], left: [-32, 16], right: [32, 16], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE;
    const teeth = (o.teeth ?? [12, 36]).slice(0, 4);
    const module_ = 0.1;
    const gearGeo = (n) => {
      const pitch = (n * module_) / 2, add = module_, ded = module_ * 1.2;
      const s = new THREE.Shape();
      const step = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) {
        const a = i * step;
        const pts = [[pitch - ded, a - step * 0.3], [pitch - ded * 0.2, a - step * 0.27], [pitch + add * 0.55, a - step * 0.17], [pitch + add, a - step * 0.1], [pitch + add, a + step * 0.1], [pitch + add * 0.55, a + step * 0.17], [pitch - ded * 0.2, a + step * 0.27], [pitch - ded, a + step * 0.3]];
        pts.forEach(([r, ang], k) => { const x = Math.cos(ang) * r, y = Math.sin(ang) * r; if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y); });
      }
      s.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, Math.max(0.09, pitch * 0.14), 0, Math.PI * 2, true);
      s.holes.push(hole);
      if (n >= 18) {
        const spokes = 5, inner = pitch * 0.32, outer = pitch * 0.72;
        for (let k = 0; k < spokes; k++) {
          const a0 = (k / spokes) * Math.PI * 2 + 0.16, a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.16;
          const w = new THREE.Path();
          w.absarc(0, 0, outer, a0, a1, false);
          w.absarc(0, 0, inner, a1, a0, true);
          s.holes.push(w);
        }
      }
      return new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.012, bevelSegments: 2, curveSegments: 18 }).translate(0, 0, -0.14);
    };
    const colors = ['#c9772f', '#a9acb3', '#8f98a6', '#b08a4e'];
    const gears = [];
    let x = 0;
    teeth.forEach((n, i) => {
      const r = (n * module_) / 2;
      if (i > 0) x += ((teeth[i - 1] * module_) / 2) + r;
      const holder = P.group(P.root, [x, 0, 0]);
      const spin = P.group(holder);
      P.add(gearGeo(n), P.mat('steel', colors[i]), spin);
      P.add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 24).rotateX(Math.PI / 2), P.mat('metal', '#d9dade'), holder);
      P.add(new THREE.BoxGeometry(0.05, r * 0.5, 0.31), P.glowMat('#fff4dc', 1.1), spin, [0, r * 0.74, 0]);
      gears.push({ n, r, x, spin, holder });
      P.anchor(`gear${i}`, holder, [0, 0, 0.2], r * 1.25);
    });
    const span = x;
    P.root.children.forEach((c) => { c.position.x -= span / 2; });
    const contact = gears[0].x + gears[0].r - span / 2;
    P.anchor('mesh', P.root, [contact, 0, 0.2], Math.min(gears[0].r, gears[1].r) * 1.3);
    const phases = [0];
    for (let i = 1; i < gears.length; i++) {
      // Each tooth of the driven gear must sit in the gap of its neighbour on the line between centres.
      const prev = phases[i - 1], stepPrev = (2 * Math.PI) / gears[i - 1].n, stepThis = (2 * Math.PI) / gears[i].n;
      const prevOnLine = ((0 - prev) % stepPrev) / stepPrev;
      phases.push(Math.PI + stepThis / 2 + prevOnLine * stepThis);
    }
    return {
      radius: Math.max(span / 2 + gears[gears.length - 1].r, gears[0].r) * 1.02,
      update(m) {
        const rate = 1.1 * m.run.tau;
        gears.forEach((g, i) => {
          const ratio = gears[0].n / g.n;
          const dir = i % 2 === 0 ? 1 : -1;
          g.spin.rotation.z = phases[i] + dir * rate * ratio;
        });
      },
    };
  },
});
