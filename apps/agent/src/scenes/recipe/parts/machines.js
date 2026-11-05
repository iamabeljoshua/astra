PART('bicycle', {
  doc: 'A real side-on road bicycle facing +x: spoked wheels with tyres, diamond frame, saddle, drop bars, toothed chainring and rear sprocket, cranks with pedals, and a chain of real links on a closed path. Link count, chain speed and the rear wheel ratio come from the tooth counts, the wheels turn clockwise seen from +z, and the top run is the taut one pulling forward, so direction and ratio cannot be set wrong.',
  args: 'ring: chainring teeth, 34 to 52. sprocket: rear teeth, 12 to 24',
  stage: 'studio',
  anchors: ['chainring', 'sprocket', 'chain', 'pedal', 'rearWheel', 'frontWheel', 'frame'],
  motions: { pedal: 'cranks turn, chain links travel, rear wheel turns at the true ratio, front wheel rolls with it, ground slides back' },
  views: { front: [0, 3], close: [16, 9], left: [-34, 12], right: [34, 12], low: [20, -4], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE;
    const PI = Math.PI, S = 2.6;
    const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const bike = P.group(P.root, [0, -0.5, 0]);
    bike.scale.setScalar(S);
    const cyl = (a, b, r, mat, parent, seg) => {
      const A = v3(a), d = v3(b).sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg ?? 14), mat);
      m.position.copy(A).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.castShadow = true; m.receiveShadow = true;
      (parent || bike).add(m);
      return m;
    };
    const axleZ = (r, half, mat, parent, at) => { const m = P.add(new THREE.CylinderGeometry(r, r, half * 2, 20).rotateX(PI / 2), mat, parent, at); return m; };
    const clampI = (v, a, b) => Math.round(Math.min(b, Math.max(a, v)));
    const nRing = clampI(o.ring ?? 44, 34, 52), nSpr = clampI(o.sprocket ?? 16, 12, 24);
    const pitch = 0.0127, R1 = (pitch * nRing) / (2 * PI), R2 = (pitch * nSpr) / (2 * PI);
    const chainLen = (D) => { const a = Math.asin((R1 - R2) / D); return 2 * D * Math.cos(a) + R1 * (PI + 2 * a) + R2 * (PI - 2 * a); };
    const links = 2 * Math.round(chainLen(0.41) / pitch / 2);
    // The axle slides in its dropouts until the chain is a whole number of links, as on a real bike.
    let lo = 0.33, hi = 0.5;
    for (let i = 0; i < 44; i++) { const mid = (lo + hi) / 2; if (chainLen(mid) / pitch < links) lo = mid; else hi = mid; }
    const D = (lo + hi) / 2, L = chainLen(D);
    const BB = [-0.09, -0.07];
    const RA = [BB[0] - Math.sqrt(D * D - BB[1] * BB[1]), 0], FA = [RA[0] + 1.0, 0];

    const red = P.mat('paint', '#a8321f'), silver = P.mat('metal', '#c9ccd1'), darkSteel = P.mat('steel', '#55585e'), tan = P.mat('matte', '#94683c', { roughness: 0.6 }), rubber = P.mat('matte', '#141416', { roughness: 0.8 }), gum = P.mat('matte', '#7f5f3c', { roughness: 0.85 });

    const makeWheel = (ax) => {
      const holder = P.group(bike, [ax[0], ax[1], 0]);
      const spin = P.group(holder);
      P.add(new THREE.TorusGeometry(0.322, 0.016, 14, 110), rubber, spin);
      P.add(new THREE.TorusGeometry(0.31, 0.0135, 10, 110), gum, spin);
      const rim = new THREE.TorusGeometry(0.296, 0.0125, 10, 110); rim.scale(1, 1, 0.8);
      P.add(rim, silver, spin);
      const hub = P.lathe([[0.01, -0.05], [0.012, -0.04], [0.026, -0.036], [0.026, -0.03], [0.013, -0.026], [0.013, 0.026], [0.026, 0.03], [0.026, 0.036], [0.012, 0.04], [0.01, 0.05]], 24).rotateX(PI / 2);
      P.add(hub, silver, spin);
      const spokes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0013, 0.0013, 1, 5), silver, 32);
      const up = new THREE.Vector3(0, 1, 0), mx = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < 32; i++) {
        const side = i % 2 ? 1 : -1, lead = i % 4 < 2 ? 1 : -1;
        const a = (i * 2 * PI) / 32, ha = a + lead * 1.05;
        const A = new THREE.Vector3(Math.cos(ha) * 0.026, Math.sin(ha) * 0.026, side * 0.033), B = new THREE.Vector3(Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0);
        const d = B.clone().sub(A), len = d.length();
        q.setFromUnitVectors(up, d.clone().normalize());
        mx.compose(A.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, len, 1));
        spokes.setMatrixAt(i, mx);
      }
      spokes.castShadow = true;
      spin.add(spokes);
      // A spoke reflector, so a still frame shows the wheel has turned.
      P.add(new THREE.BoxGeometry(0.02, 0.05, 0.007), P.mat('paint', '#d98d2b'), spin, [0.012, 0.215, 0.004], [0, 0, -0.05]);
      return { holder, spin };
    };
    const rearW = makeWheel(RA), frontW = makeWheel(FA);

    const dir = (deg) => [Math.cos((deg * PI) / 180), Math.sin((deg * PI) / 180)];
    const along = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
    const at3 = (p, z) => [p[0], p[1], z ?? 0];
    const seatDir = dir(107), headDir = dir(108);
    const seatTop = along(BB, seatDir, 0.52);
    const forkPerp = [headDir[1], -headDir[0]];
    const crown = along(along(FA, forkPerp, -0.045), headDir, 0.36);
    const headTop = along(crown, headDir, 0.155);
    const frame = P.group(bike);
    cyl(at3(BB), at3(seatTop), 0.0165, red, frame);
    cyl(at3(BB), at3(along(crown, headDir, 0.03)), 0.0195, red, frame);
    cyl(at3(along(BB, seatDir, 0.47)), at3(along(crown, headDir, 0.125)), 0.0165, red, frame);
    cyl(at3(crown), at3(headTop), 0.021, red, frame);
    cyl(at3(along(crown, headDir, -0.004)), at3(along(crown, headDir, 0.008)), 0.024, silver, frame);
    cyl(at3(along(headTop, headDir, -0.006)), at3(along(headTop, headDir, 0.012)), 0.024, silver, frame);
    axleZ(0.024, 0.036, red, frame, at3(BB));
    axleZ(0.009, 0.075, silver, frame, at3(BB));
    for (const s of [1, -1]) {
      P.tubeAlong([[RA[0], RA[1], s * 0.066], [RA[0] + 0.07, RA[1] - 0.012, s * 0.03], [BB[0] - 0.05, BB[1] + 0.004, s * 0.028], [BB[0], BB[1], s * 0.024]], 0.0085, red, frame);
      P.tubeAlong([[RA[0], RA[1], s * 0.066], [RA[0] + 0.08, RA[1] + 0.13, s * 0.05], [seatTop[0] + 0.012, seatTop[1] - 0.05, s * 0.016]], 0.0075, red, frame);
      P.add(new THREE.BoxGeometry(0.03, 0.034, 0.005), darkSteel, frame, [RA[0], RA[1], s * 0.066]);
      axleZ(0.0065, 0.008, silver, frame, [RA[0], RA[1], s * 0.074]);
      const fp = along(crown, headDir, -0.015);
      P.tubeAlong([[fp[0], fp[1], s * 0.032], [(fp[0] + FA[0]) / 2 - 0.01, (fp[1] + FA[1]) / 2, s * 0.05], [FA[0], FA[1] + 0.03, s * 0.054], [FA[0], FA[1], s * 0.056]], 0.0085, red, frame);
      axleZ(0.0065, 0.008, silver, frame, [FA[0], FA[1], s * 0.062]);
    }
    const fc = along(crown, headDir, -0.012);
    cyl([fc[0], fc[1], -0.034], [fc[0], fc[1], 0.034], 0.014, red, frame);
    axleZ(0.0055, 0.07, silver, rearW.holder, [0, 0, 0]);
    axleZ(0.0055, 0.06, silver, frontW.holder, [0, 0, 0]);

    const postTop = along(seatTop, seatDir, 0.11);
    cyl(at3(seatTop), at3(postTop), 0.0125, silver, frame);
    const saddle = P.lathe([[0, -0.14], [0.012, -0.135], [0.02, -0.11], [0.022, -0.03], [0.036, 0.04], [0.066, 0.095], [0.071, 0.122], [0.05, 0.135], [0, 0.137]], 28);
    saddle.rotateZ(-PI / 2);
    saddle.scale(1, 0.34, 1);
    P.add(saddle, tan, frame, [postTop[0] + 0.006, postTop[1] + 0.022, 0]);
    for (const s of [1, -1]) P.tubeAlong([[postTop[0] + 0.1, postTop[1] + 0.012, s * 0.006], [postTop[0] + 0.03, postTop[1] - 0.004, s * 0.019], [postTop[0] - 0.05, postTop[1] - 0.004, s * 0.022], [postTop[0] - 0.09, postTop[1] + 0.012, s * 0.03]], 0.0024, silver, frame);

    const steerTop = along(headTop, headDir, 0.045);
    cyl(at3(headTop), at3(steerTop), 0.0135, silver, frame);
    const stemEnd = [steerTop[0] + 0.098, steerTop[1] + 0.016];
    cyl(at3(steerTop), at3(stemEnd), 0.0125, silver, frame);
    axleZ(0.015, 0.024, silver, frame, at3(stemEnd));
    for (const s of [1, -1]) {
      const c = stemEnd;
      P.tubeAlong([[c[0], c[1], 0], [c[0], c[1], s * 0.09], [c[0] + 0.004, c[1], s * 0.17], [c[0] + 0.05, c[1] + 0.003, s * 0.205], [c[0] + 0.1, c[1] - 0.012, s * 0.21], [c[0] + 0.12, c[1] - 0.06, s * 0.21], [c[0] + 0.09, c[1] - 0.108, s * 0.21], [c[0] + 0.02, c[1] - 0.116, s * 0.21]], 0.0118, tan, frame);
      const hood = new THREE.CapsuleGeometry(0.0145, 0.04, 4, 10).rotateZ(-1.25);
      P.add(hood, rubber, frame, [c[0] + 0.1, c[1] + 0.01, s * 0.21]);
      P.tubeAlong([[c[0] + 0.122, c[1] + 0.016, s * 0.21], [c[0] + 0.14, c[1] - 0.03, s * 0.21], [c[0] + 0.126, c[1] - 0.075, s * 0.21]], 0.0044, silver, frame);
    }

    const gear = (n, Rp, thick, arms) => {
      const step = (2 * PI) / n, tip = Rp + 0.0052, base = Rp - 0.0052, s = new THREE.Shape();
      for (let i = 0; i < n; i++) {
        const a = i * step;
        [[base, -0.5], [base + 0.0028, -0.31], [tip - 0.0012, -0.15], [tip, -0.07], [tip, 0.07], [tip - 0.0012, 0.15], [base + 0.0028, 0.31], [base, 0.5]].forEach(([r, k], j) => {
          const t = a + k * step, x = Math.cos(t) * r, y = Math.sin(t) * r;
          if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
        });
      }
      s.closePath();
      if (arms) {
        for (let k = 0; k < arms; k++) {
          const a0 = (k / arms) * 2 * PI + 0.2, a1 = ((k + 1) / arms) * 2 * PI - 0.2, w = new THREE.Path();
          w.absarc(0, 0, Rp - 0.012, a0, a1, false);
          w.absarc(0, 0, 0.022, a1, a0, true);
          s.holes.push(w);
        }
      } else {
        const h = new THREE.Path(); h.absarc(0, 0, 0.007, 0, 2 * PI, true); s.holes.push(h);
      }
      return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -thick / 2);
    };
    const chainZ = 0.046;
    const beta = Math.atan2(BB[1] - RA[1], BB[0] - RA[0]), alpha = Math.asin((R1 - R2) / D);
    const nTop = beta + PI / 2 + alpha, nBot = beta - PI / 2 - alpha;
    const onCircle = (c, r, a) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    const arc1 = R1 * (PI + 2 * alpha), run = D * Math.cos(alpha), arc2 = R2 * (PI - 2 * alpha);
    // s runs in the direction the chain moves: round the ring, back along the slack bottom run, round the sprocket, forward along the taut top run.
    const chainAt = (s0) => {
      let s = ((s0 % L) + L) % L;
      if (s < arc1) { const p = onCircle(BB, R1, nTop - s / R1); return p; }
      s -= arc1;
      if (s < run) {
        const k = s / run, A = onCircle(BB, R1, nBot), B = onCircle(RA, R2, nBot);
        return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k - 0.007 * Math.sin(PI * k)];
      }
      s -= run;
      if (s < arc2) return onCircle(RA, R2, nBot - s / R2);
      s -= arc2;
      const k = s / run, A = onCircle(RA, R2, nTop), B = onCircle(BB, R1, nTop);
      return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
    };
    const stepRing = (2 * PI) / nRing, stepSpr = (2 * PI) / nSpr;
    const ringRot0 = nTop - stepRing / 2;
    const sAtSpr = arc1 + run, firstRoller = Math.ceil(sAtSpr / pitch) * pitch;
    const sprRot0 = nBot - (firstRoller - sAtSpr) / R2 - stepSpr / 2;

    const crankSpin = P.group(bike, [BB[0], BB[1], 0]);
    const steel = P.mat('steel', '#b4b7bc');
    P.add(gear(nRing, R1, 0.0034, 5), steel, crankSpin, [0, 0, chainZ]);
    P.add(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24).rotateX(PI / 2), silver, crankSpin, [0, 0, chainZ + 0.006]);
    const crankWorld0 = (205 * PI) / 180;
    const crankRoot = P.group(crankSpin);
    crankRoot.rotation.z = crankWorld0 - ringRot0;
    const crankLen = 0.17;
    const armGeo = () => {
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.018, PI / 2, -PI / 2 + 2 * PI, false);
      s.lineTo(crankLen, -0.0115); s.absarc(crankLen, 0, 0.0115, -PI / 2, PI / 2, false); s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 10 }).translate(0, 0, -0.006);
    };
    const pedals = [];
    for (const [z, a] of [[0.07, 0], [-0.07, PI]]) {
      const arm = P.group(crankRoot); arm.rotation.z = a;
      P.add(armGeo(), silver, arm, [0, 0, z]);
      axleZ(0.0075, 0.02, darkSteel, arm, [crankLen, 0, z + Math.sign(z) * 0.018]);
      const pedal = P.group(arm, [crankLen, 0, z + Math.sign(z) * 0.062]);
      P.add(new THREE.BoxGeometry(0.092, 0.017, 0.082), P.mat('steel', '#2a2b2f'), pedal);
      P.add(new THREE.BoxGeometry(0.1, 0.008, 0.012), silver, pedal, [0, 0, 0.038]);
      P.add(new THREE.BoxGeometry(0.1, 0.008, 0.012), silver, pedal, [0, 0, -0.038]);
      pedals.push({ arm, pedal, a });
    }
    const sprSpin = P.group(bike, [RA[0], RA[1], chainZ]);
    P.add(gear(nSpr, R2, 0.0034), steel, sprSpin);
    P.add(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 20).rotateX(PI / 2), silver, sprSpin);

    const plateShape = new THREE.Shape();
    const ph = pitch / 2;
    plateShape.absarc(-ph, 0, 0.0043, PI / 2 + 0.6, -PI / 2 - 0.6 + 2 * PI, false);
    plateShape.absarc(ph, 0, 0.0043, -PI / 2 + 0.6, PI / 2 - 0.6, false);
    plateShape.closePath();
    const plateG = new THREE.ExtrudeGeometry(plateShape, { depth: 0.0011, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.00055);
    const plates = new THREE.InstancedMesh(plateG, P.mat('steel', '#9a9da2', { roughness: 0.38 }), links * 2);
    const rollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.0062, 8).rotateX(PI / 2), P.mat('steel', '#3b3c40'), links);
    const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.0135, 7).rotateX(PI / 2), silver, links);
    plates.castShadow = rollers.castShadow = true;
    bike.add(plates, rollers, pins);
    const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), zAxis = new THREE.Vector3(0, 0, 1);
    const pts = [];
    const setChain = (off) => {
      for (let i = 0; i < links; i++) pts[i] = chainAt(i * pitch + off);
      for (let i = 0; i < links; i++) {
        const a = pts[i], b = pts[(i + 1) % links];
        dp.set(a[0], a[1], chainZ); dq.identity();
        dm.compose(dp, dq, one); rollers.setMatrixAt(i, dm); pins.setMatrixAt(i, dm);
        // pts run in travel order, so the plate spans roller i to roller i+1.
        dq.setFromAxisAngle(zAxis, Math.atan2(b[1] - a[1], b[0] - a[0]));
        const g = i % 2 ? 0.0052 : 0.0034;
        dp.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, chainZ + g);
        dm.compose(dp, dq, one); plates.setMatrixAt(i * 2, dm);
        dp.z = chainZ - g;
        dm.compose(dp, dq, one); plates.setMatrixAt(i * 2 + 1, dm);
      }
      plates.instanceMatrix.needsUpdate = rollers.instanceMatrix.needsUpdate = pins.instanceMatrix.needsUpdate = true;
    };

    const floorY = -0.338;
    const fTexN = 96, fData = new Uint8Array(fTexN * fTexN * 4);
    for (let y = 0; y < fTexN; y++) for (let x = 0; x < fTexN; x++) {
      const r = Math.hypot(x - fTexN / 2 + 0.5, y - fTexN / 2 + 0.5) / (fTexN / 2), a = Math.max(0, 1 - r); const v = 255 * Math.min(1, a * a * 3.4);
      const i = (y * fTexN + x) * 4; fData[i] = fData[i + 1] = fData[i + 2] = v; fData[i + 3] = 255;
    }
    const fTex = new THREE.DataTexture(fData, fTexN, fTexN); fTex.needsUpdate = true;
    const floor = P.add(new THREE.CircleGeometry(1.5, 64).rotateX(-PI / 2), P.mat('matte', '#23252b', { roughness: 0.75, transparent: true, alphaMap: fTex, depthWrite: false }), bike, [0, floorY, 0]);
    floor.castShadow = false;
    const DASH = 9, dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.0015, 0.016), P.mat('matte', '#6d6f75'), DASH);
    dashes.position.set(0, floorY + 0.002, 0.3);
    bike.add(dashes);
    const span = 2.6;
    const setDashes = (dist) => {
      for (let i = 0; i < DASH; i++) {
        const x = ((((i / DASH) * span - dist) % span) + span) % span - span / 2;
        const k = Math.max(0, 1 - Math.abs(x) / 1.25);
        dp.set(x, 0, 0); dq.identity();
        dm.compose(dp, dq, new THREE.Vector3(Math.min(1, k * 5), 1, 1)); dashes.setMatrixAt(i, dm);
      }
      dashes.instanceMatrix.needsUpdate = true;
    };

    P.anchor('chainring', crankSpin.parent, [BB[0], BB[1], chainZ], 0.62);
    P.anchor('sprocket', bike, [RA[0], RA[1], chainZ], 0.42);
    const topMid = (() => { const A = onCircle(RA, R2, nTop), B = onCircle(BB, R1, nTop); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, chainZ]; })();
    P.anchor('chain', bike, topMid, 0.75);
    P.anchor('pedal', pedals[0].pedal, [0, 0, 0], 0.7);
    P.anchor('rearWheel', bike, [RA[0], RA[1], 0], 1.05);
    P.anchor('frontWheel', bike, [FA[0], FA[1], 0], 1.05);
    P.anchor('frame', bike, [0.08, 0.22, 0.02], 1.4);

    const WHEEL_R = 0.338;
    return {
      radius: 2.15,
      update(m) {
        const th = m.pedal.tau * 1.7, wr = (th * nRing) / nSpr;
        crankSpin.rotation.z = ringRot0 - th;
        for (const p of pedals) p.pedal.rotation.z = -(crankSpin.rotation.z + crankRoot.rotation.z + p.arm.rotation.z);
        sprSpin.rotation.z = sprRot0 - wr;
        rearW.spin.rotation.z = -wr;
        frontW.spin.rotation.z = -wr;
        setChain(th * R1);
        setDashes(wr * WHEEL_R);
      },
    };
  },
});

PART('windTurbine', {
  doc: 'A real upwind three-blade wind turbine: tall tapered tower cut open to show the cable, nacelle cut open on the near side showing main shaft, gear stage and generator, and true twisted airfoil blades whose leading edge moves into the turning direction. Wind arrives from -x along the rotor axis. The fast shaft speed and its opposite sense come from the gear teeth drawn (real machines stack stages to about 100 to 1), and power always turns the rotor, so cause and direction cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['blade', 'hub', 'shaft', 'gearbox', 'generator', 'tower', 'wind', 'cable'],
  motions: { spin: 'wind beads arrive and the rotor, slow shaft and fast shaft turn', power: 'rotor turns and current beads run down the cable inside the tower' },
  views: { front: [-40, 3], cut: [14, 6], close: [24, 10], left: [-62, 8], right: [28, 8], low: [-34, -8], flat: [-40, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const baseY = -2.75, hubY = 0.95, R = 1.8, rotorX = -0.5;
    const white = P.mat('paint', '#a2a5a9'), shellM = P.mat('paint', '#a0a3a7', { side: THREE.DoubleSide }), cutM = P.mat('matte', '#8c8f94'), steel = P.mat('steel', '#7f8389'), bright = P.mat('metal', '#c7cad0'), dark = P.mat('steel', '#3a3c41'), copper = P.mat('metal', '#b8703a', { roughness: 0.4 });
    const shaftAccent = P.mat('paint', '#d98d2b');

    const r = (y) => 0.2 + (0.085 - 0.2) * ((y - baseY) / (hubY - 0.17 - baseY));
    const slit = 0.8, topY = hubY - 0.17;
    const towerPts = []; for (let i = 0; i <= 10; i++) { const y = baseY + ((topY - baseY) * i) / 10; towerPts.push([r(y), y]); }
    const tower = new THREE.Group(); P.root.add(tower);
    P.add(new THREE.LatheGeometry(towerPts.map(([a, y]) => new THREE.Vector2(a, y)), 56, slit, 2 * PI - 2 * slit), shellM, tower);
    P.add(new THREE.LatheGeometry(towerPts.map(([a, y]) => new THREE.Vector2(a - 0.009, y)), 56, slit, 2 * PI - 2 * slit), P.mat('matte', '#3d3f44', { side: THREE.DoubleSide }), tower);
    for (const phi of [slit, -slit]) {
      const pos = [], idx = [];
      towerPts.forEach(([a, y], i) => {
        pos.push((a - 0.009) * Math.sin(phi), y, (a - 0.009) * Math.cos(phi), a * Math.sin(phi), y, a * Math.cos(phi));
        if (i) { const q = i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      P.add(g, new THREE.MeshStandardMaterial({ color: '#a3a6ab', roughness: 0.7, side: THREE.DoubleSide }), tower);
    }
    for (const y of [-1.75, -0.75, 0.2]) P.add(new THREE.TorusGeometry(r(y) + 0.002, 0.005, 6, 56, 2 * PI - 2 * slit).rotateX(PI / 2).rotateY(slit + PI / 2 - 2 * slit + 2 * slit - PI / 2 + 0), steel, tower, [0, y, 0]);
    P.add(P.lathe([[0.42, 0], [0.42, 0.05], [0.3, 0.09], [0.24, 0.09], [0, 0.09]], 48), P.mat('matte', '#55575c'), tower, [0, baseY - 0.09, 0]);
    const fN = 96, fD = new Uint8Array(fN * fN * 4);
    for (let y = 0; y < fN; y++) for (let x = 0; x < fN; x++) { const a = Math.max(0, 1 - Math.hypot(x - fN / 2 + 0.5, y - fN / 2 + 0.5) / (fN / 2)), v = 255 * Math.min(1, a * a * 3.4), i = (y * fN + x) * 4; fD[i] = fD[i + 1] = fD[i + 2] = v; fD[i + 3] = 255; }
    const fT = new THREE.DataTexture(fD, fN, fN); fT.needsUpdate = true;
    P.add(new THREE.CircleGeometry(3.1, 64).rotateX(-PI / 2), P.mat('matte', '#23252b', { roughness: 0.75, transparent: true, alphaMap: fT, depthWrite: false }), tower, [0, baseY - 0.085, 0]).castShadow = false;

    const nac = P.group(P.root, [0, hubY, 0]);
    P.add(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 40), dark, nac, [0, -0.17, 0]);
    const sec = new THREE.Shape();
    [[0.1, 0.22], [-0.15, 0.22], [-0.19, 0.18], [-0.19, -0.11], [-0.15, -0.15], [0.1, -0.15], [0.1, -0.135], [-0.145, -0.135], [-0.175, -0.105], [-0.175, 0.175], [-0.145, 0.205], [0.1, 0.205]].forEach(([a, b], i) => (i ? sec.lineTo(a, b) : sec.moveTo(a, b)));
    sec.closePath();
    const NL = 0.84, NF = -0.4;
    P.add(new THREE.ExtrudeGeometry(sec, { depth: NL, bevelEnabled: false }).rotateY(-PI / 2).translate(NF + NL, 0, 0), white, nac);
    P.add(new THREE.BoxGeometry(NL, 0.016, 0.003), cutM, nac, [NF + NL / 2, 0.2125, 0.1015]);
    P.add(new THREE.BoxGeometry(NL, 0.016, 0.003), cutM, nac, [NF + NL / 2, -0.1425, 0.1015]);
    P.add(new THREE.BoxGeometry(0.016, 0.37, 0.29), white, nac, [NF + NL, 0.035, -0.045]);
    P.add(new THREE.BoxGeometry(0.016, 0.37, 0.29), white, nac, [NF, 0.035, -0.045]);
    P.add(new THREE.BoxGeometry(NL - 0.02, 0.022, 0.2), dark, nac, [NF + NL / 2, -0.122, -0.02]);

    const rotor = P.group(nac, [0, 0, 0]);
    const slowM = P.add(new THREE.CylinderGeometry(0.033, 0.033, 0.46, 28).rotateZ(PI / 2), bright, rotor, [-0.26, 0, 0]);
    slowM.name = 'slow';
    P.add(new THREE.BoxGeometry(0.2, 0.012, 0.07), shaftAccent, rotor, [-0.28, 0, 0]);
    P.add(new THREE.CylinderGeometry(0.048, 0.048, 0.014, 28).rotateZ(PI / 2), steel, rotor, [-0.09, 0, 0]);
    P.add(new THREE.BoxGeometry(0.07, 0.1, 0.11), dark, nac, [-0.28, -0.07, 0]);
    P.add(new THREE.CylinderGeometry(0.055, 0.055, 0.075, 28).rotateZ(PI / 2), steel, nac, [-0.28, 0, 0]);

    const gearGeo = (n, Rp, thick, boreR) => {
      const step = (2 * PI) / n, s = new THREE.Shape(), tip = Rp + 0.0034, base = Rp - 0.0042;
      for (let i = 0; i < n; i++) {
        const a = PI / 2 + i * step;
        [[base, -0.5], [base + 0.002, -0.3], [tip, -0.1], [tip, 0.1], [base + 0.002, 0.3], [base, 0.5]].forEach(([q, k], j) => { const t = a + k * step, x = Math.cos(t) * q, y = Math.sin(t) * q; if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y); });
      }
      s.closePath();
      const h = new THREE.Path(); h.absarc(0, 0, boreR, 0, 2 * PI, true); s.holes.push(h);
      return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -thick / 2).rotateY(PI / 2);
    };
    const module_ = 0.0034, nBig = 60, nSmall = 12, rBig = (nBig * module_) / 2, rSmall = (nSmall * module_) / 2, cd = rBig + rSmall;
    const gearSteel = P.mat('steel', '#a8abb0', { roughness: 0.36 });
    const bigG = P.add(gearGeo(nBig, rBig, 0.044, 0.03), gearSteel, rotor, [0, 0, 0]);
    P.add(new THREE.CylinderGeometry(0.033, 0.033, 0.1, 24).rotateZ(PI / 2), bright, rotor, [-0.04, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * PI; P.add(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 10).rotateZ(PI / 2), dark, rotor, [0, Math.sin(a) * 0.065, Math.cos(a) * 0.065]); }
    const fast = P.group(nac, [0, cd, 0]);
    const pinion = new THREE.Group(); pinion.rotation.x = PI / nSmall; fast.add(pinion);
    P.add(gearGeo(nSmall, rSmall, 0.05, 0.006), P.mat('metal', '#d6d8dc', { roughness: 0.3 }), pinion);
    P.add(new THREE.CylinderGeometry(0.0115, 0.0115, 0.27, 16).rotateZ(PI / 2), shaftAccent, fast, [0.095, 0, 0]);
    P.add(new THREE.BoxGeometry(0.09, 0.004, 0.031), bright, fast, [0.125, 0, 0]);
    P.add(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 36).rotateZ(PI / 2), bright, fast, [0.135, 0, 0]);
    P.add(new THREE.BoxGeometry(0.02, 0.03, 0.018), P.mat('paint', '#a8321f'), nac, [0.135, cd + 0.044, 0.008]);

    const box = P.group(nac);
    const gy0 = -0.118, gy1 = 0.165, gz = -0.09;
    P.add(new THREE.BoxGeometry(0.012, gy1 - gy0, 0.17), steel, box, [-0.05, (gy0 + gy1) / 2, gz + 0.03]);
    P.add(new THREE.BoxGeometry(0.012, gy1 - gy0, 0.17), steel, box, [0.05, (gy0 + gy1) / 2, gz + 0.03]);
    P.add(new THREE.BoxGeometry(0.11, gy1 - gy0, 0.01), steel, box, [0, (gy0 + gy1) / 2, gz - 0.05]);
    P.add(new THREE.BoxGeometry(0.11, 0.012, 0.17), steel, box, [0, gy1, gz + 0.03]);

    const genX0 = 0.17, genX1 = 0.37, genR = 0.062, genMid = (genX0 + genX1) / 2;
    const genRotor = P.group(fast, [0, 0, 0]);
    P.add(new THREE.CylinderGeometry(0.036, 0.036, genX1 - genX0 - 0.03, 28).rotateZ(PI / 2), P.mat('steel', '#55585e'), genRotor, [genMid, 0, 0]);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * PI; P.add(new THREE.BoxGeometry(genX1 - genX0 - 0.034, 0.012, 0.012), copper, genRotor, [genMid, Math.sin(a) * 0.036, Math.cos(a) * 0.036], [a, 0, 0]); }
    const gen = P.group(nac, [genMid, cd, 0]);
    const halfCyl = (rad, len, mat) => P.add(new THREE.CylinderGeometry(rad, rad, len, 40, 1, true, PI / 2 - 0.5, PI + 1).rotateZ(PI / 2), mat, gen);
    const dbl = (c) => { c.side = THREE.DoubleSide; return c; };
    halfCyl(genR, genX1 - genX0, dbl(P.mat('steel', '#6d7076')));
    halfCyl(genR - 0.008, genX1 - genX0 - 0.012, dbl(P.mat('metal', '#b8703a', { roughness: 0.5 })));
    for (let i = 0; i < 7; i++) P.add(new THREE.CylinderGeometry(genR + 0.006, genR + 0.006, 0.006, 40, 1, true, PI / 2 - 0.5, PI + 1).rotateZ(PI / 2), steel, gen, [-0.09 + (i * 0.18) / 6, 0, 0]);
    for (const sx of [-1, 1]) P.add(new THREE.CylinderGeometry(genR, genR, 0.006, 36).rotateZ(PI / 2), steel, gen, [(sx * (genX1 - genX0)) / 2, 0, -0.0], undefined).visible = sx > 0;
    P.add(new THREE.BoxGeometry(0.15, cd - 0.05 + 0.11, 0.06), dark, nac, [genMid, (-0.11 + cd - genR + 0.01) / 2, -0.03]);

    const spin = rotor;
    P.add(P.lathe([[0.001, -0.3], [0.05, -0.285], [0.09, -0.235], [0.112, -0.17], [0.118, -0.1], [0.118, 0], [0.09, 0.02], [0, 0.02]], 44).rotateZ(-PI / 2).rotateY(PI).rotateY(PI), white, spin, [rotorX - 0.0, 0, 0]);
    const bladeGeo = () => {
      const N = 26, M = 30, pos = [], idx = [], r0 = 0.09;
      const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
      for (let j = 0; j <= N; j++) {
        const s = j / N, rad = r0 + (R - r0) * s, b = sm(0.05, 0.26, s);
        const c = s < 0.24 ? 0.082 + (0.2 - 0.082) * sm(0.03, 0.24, s) : 0.2 * Math.pow(1 - (s - 0.24) / 0.76, 0.72) * 0.86 + 0.028;
        const th = ((2.5 + 17 * Math.pow(1 - s, 2.1)) * PI) / 180;
        const t = 0.32 - 0.2 * sm(0.22, 0.6, s);
        for (let i = 0; i < M; i++) {
          const ang = (i / M) * 2 * PI, u = 0.5 * (1 + Math.cos(ang)), up = ang < PI ? 1 : -1;
          const yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) * c;
          const mC = 0.045, pC = 0.42, yc = (u < pC ? (mC / (pC * pC)) * (2 * pC * u - u * u) : (mC / ((1 - pC) ** 2)) * (1 - 2 * pC + 2 * pC * u - u * u)) * c;
          const Xa = yc + up * yt, Za = (0.3 - u) * c, Xc = (c / 2) * Math.sin(ang), Zc = -(c / 2) * Math.cos(ang);
          const X = Xc + (Xa - Xc) * b, Z = Zc + (Za - Zc) * b;
          pos.push(X * Math.cos(th) - Z * Math.sin(th), rad, Z * Math.cos(th) + X * Math.sin(th));
          if (j) { const a = (j - 1) * M + i, a2 = (j - 1) * M + ((i + 1) % M), d = j * M + i, d2 = j * M + ((i + 1) % M); idx.push(a, a2, d, a2, d2, d); }
        }
      }
      const tipIdx = pos.length / 3; pos.push(0, R + 0.003, 0);
      for (let i = 0; i < M; i++) idx.push(N * M + i, N * M + ((i + 1) % M), tipIdx);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const bg = bladeGeo(), bm = P.mat('paint', '#adb0b3', { side: THREE.DoubleSide });
    const blades = [0, 1, 2].map((i) => { const h = P.group(spin, [rotorX, 0, 0]); h.rotation.x = (i * 2 * PI) / 3 + 0.5; P.add(bg, bm, h); P.add(new THREE.TorusGeometry(0.043, 0.009, 8, 24).rotateX(PI / 2), steel, h, [0, 0.1, 0]); return h; });

    const flows = [], wind = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * PI + 0.2, q = i % 2 ? 1.25 : 0.72;
      const f = P.beads([[-3.3, hubY + Math.sin(a) * q, Math.cos(a) * q], [rotorX - 0.08, hubY + Math.sin(a) * q, Math.cos(a) * q]], { count: 12, speed: 0.34, size: 8, color: '#bcd8ff', intensity: 1.5 });
      wind.push(f);
    }
    const cablePts = [[genMid, hubY + cd - 0.05, 0.02], [genMid, hubY - 0.07, 0.06], [0.08, hubY - 0.1, 0.07], [0.02, hubY - 0.2, 0.05], [0.0, hubY - 0.5, 0.055], [0.0, -1, 0.06], [0.0, baseY + 0.04, 0.07]];
    P.tubeAlong(cablePts, 0.0065, P.mat('matte', '#6e3f1e'), P.root);
    const current = P.beads(cablePts.map(([x, y, z]) => [x, y, z + 0.006]), { count: 26, speed: 0.13, size: 6, color: '#ffc067', intensity: 2.2 });

    P.anchor('blade', blades[0], [0.03, 1.1, 0.0], 1.25);
    P.anchor('hub', nac, [rotorX - 0.06, 0, 0.11], 0.55);
    P.anchor('shaft', nac, [-0.2, 0, 0.034], 0.45);
    P.anchor('gearbox', nac, [0, 0.03, 0.03], 0.42);
    P.anchor('generator', nac, [genMid, cd - 0.01, 0.038], 0.42);
    P.anchor('tower', P.root, [0, -1.2, 0.16], 2.2);
    P.anchor('wind', P.root, [-2.2, hubY + 0.72 * Math.sin(0.2), 0.72 * Math.cos(0.2)], 1.6);
    P.anchor('cable', P.root, [0, -1, 0.066], 1);

    const ratio = nBig / nSmall;
    return {
      radius: 2.8,
      update(m) {
        const a = (m.spin.tau + m.power.tau) * 0.8;
        rotor.rotation.x = a;
        fast.rotation.x = -a * ratio;
        const windK = Math.max(m.spin.on ? Math.min(1, m.spin.u * 4) : 0, m.power.on ? Math.min(1, m.power.u * 4) : 0);
        for (const f of wind) f.show(windK);
        current.show(m.power.on ? Math.min(1, m.power.u * 3) : 0);
      },
    };
  },
});

PART('jetEngine', {
  doc: 'A long side-on turbofan drawn as a true section, near half cut away: fan, narrowing compressor stages, combustor ring with real flame, turbine stages, tapering nozzle, one shaft through all of it, in a casing and nacelle. Air always enters at the fan on the left and leaves the nozzle on the right, cold before the flame and hot after. The thrust arrow is fixed inside the part pointing forward, to the left, opposite the exhaust, so no direction can be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['fan', 'compressor', 'combustor', 'turbine', 'nozzle', 'shaft', 'thrust'],
  motions: { run: 'rotors turn, the flame burns, flow beads run cold then hot from front to back', thrust: 'engine runs and a red arrow grows on the engine pointing forward, opposite the exhaust' },
  views: { front: [0, 2], close: [12, 5], left: [-30, 10], right: [30, 10], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const faceM = new THREE.MeshStandardMaterial({ color: '#a39e91', roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
    const dbl = (m) => { m.side = THREE.DoubleSide; return m; };
    const rev = (profile, far, cut, parent) => {
      const g = new THREE.LatheGeometry([...profile, profile[0]].map(([x, r]) => new THREE.Vector2(r, x)), 72, PI / 2, PI).rotateZ(-PI / 2);
      P.add(g, far, parent);
      const s = new THREE.Shape(); profile.forEach(([x, r], i) => (i ? s.lineTo(x, r) : s.moveTo(x, r))); s.closePath();
      const f = new THREE.ShapeGeometry(s);
      P.add(f, cut ?? faceM, parent);
      P.add(f.clone().scale(1, -1, 1), cut ?? faceM, parent);
    };
    const shell = dbl(P.mat('steel', '#62666d', { roughness: 0.5 })), casing = dbl(P.mat('metal', '#6f7278', { roughness: 0.45 })), inner = dbl(P.mat('steel', '#4b4e54'));
    rev([[-2.62, 1.09], [-2.56, 1.17], [-2.3, 1.25], [-1.7, 1.29], [-0.9, 1.25], [0.05, 1.13], [0.42, 1.03], [0.4, 1.0], [-0.6, 1.07], [-1.7, 1.06], [-2.1, 1.03], [-2.45, 1.05], [-2.58, 1.07]], shell);
    const stations = [[-1.56, 0.545, 0.545], [-1.45, 0.47, 0.565], [-0.9, 0.39, 0.56], [0.0, 0.27, 0.46], [0.06, 0.27, 0.47], [0.2, 0.41, 0.52], [0.72, 0.41, 0.56], [0.86, 0.33, 0.56], [1.02, 0.36, 0.57], [1.42, 0.5, 0.61], [1.62, 0.5, 0.6], [2.45, 0.31, 0.345]];
    const rInAt = (x) => { for (let i = 1; i < stations.length; i++) { if (x <= stations[i][0]) { const a = stations[i - 1], b = stations[i], k = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; } } return 0.31; };
    rev([...stations.map(([x, a]) => [x, a]), ...stations.slice().reverse().map(([x, , b]) => [x, b])], casing);
    rev([[-1.5, 0.13], [-1.5, 0.19], [-0.04, 0.22], [-0.04, 0.13]], inner);
    rev([[0.0, 0.11], [0.0, 0.22], [0.82, 0.22], [0.82, 0.11]], inner);
    rev([[0.86, 0.11], [0.86, 0.2], [1.42, 0.2], [1.42, 0.11]], inner);
    rev([[1.46, 0.015], [1.46, 0.2], [1.72, 0.2], [2.25, 0.015]], inner);
    const glowLiner = new THREE.MeshStandardMaterial({ color: '#8d7360', roughness: 0.55, metalness: 0.4, emissive: new THREE.Color('#ff6a20'), emissiveIntensity: 0, side: THREE.DoubleSide });
    rev([[0.1, 0.25], [0.74, 0.25], [0.74, 0.26], [0.13, 0.26], [0.13, 0.355], [0.74, 0.355], [0.74, 0.365], [0.1, 0.365], [0.07, 0.31]], glowLiner, glowLiner);
    for (const a of [0, PI / 4, PI / 2, (3 * PI) / 4, PI]) {
      const y = Math.cos(a), z = -Math.sin(a);
      const pts = [[0.26, y * 0.53, z * 0.53], [0.18, y * 0.42, z * 0.42], [0.1, y * 0.31, z * 0.31]];
      P.tubeAlong(pts, 0.012, P.mat('metal', '#c4c6ca'));
    }

    const bladeGeo = (g0, g1, t) => {
      const pos = [], idx = [], N = 5, sec = [[-0.5, 0], [-0.2, t], [0.25, t * 0.75], [0.5, 0], [0.25, -t * 0.35], [-0.2, -t * 0.45]], M = sec.length;
      for (let j = 0; j <= N; j++) {
        const s = j / N, g = g0 + (g1 - g0) * s;
        for (let i = 0; i < M; i++) { const [w, n] = sec[i]; pos.push(w * Math.cos(g) - n * Math.sin(g), s, w * Math.sin(g) + n * Math.cos(g)); if (j) { const a = (j - 1) * M + i, b = (j - 1) * M + ((i + 1) % M), c = j * M + i, d = j * M + ((i + 1) % M); idx.push(a, b, c, b, d, c); } }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const rotor = P.group();
    const X = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion(), mx = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const fanB = new THREE.InstancedMesh(bladeGeo(0.4, 1.28, 0.05), dbl(P.mat('metal', '#a7abb1', { roughness: 0.3 })), 22);
    const fanX = -2.02, fanHub = 0.26, fanTip = 1.015;
    for (let i = 0; i < 22; i++) { const a = (i / 22) * 2 * PI; q.setFromAxisAngle(X, a); v.set(fanX, Math.cos(a) * fanHub, Math.sin(a) * fanHub); mx.compose(v, q, sc.set(0.38, fanTip - fanHub, 0.38)); fanB.setMatrixAt(i, mx); }
    rotor.add(fanB);
    P.add(P.lathe([[0.001, -2.64], [0.09, -2.52], [0.19, -2.34], [0.27, -2.14], [0.285, -1.95], [0.27, -1.8], [0.2, -1.5], [0.001, -1.5]], 48).rotateZ(-PI / 2), P.mat('metal', '#55585e', { roughness: 0.32 }));
    P.add(new THREE.CylinderGeometry(0.075, 0.075, 3.5, 28).rotateZ(PI / 2), P.mat('metal', '#d6d8dc', { roughness: 0.28 }), P.root, [-0.1, 0, 0]);
    for (const x of [-1.05, -0.02, 1.2]) P.add(new THREE.BoxGeometry(0.9, 0.012, 0.155), P.mat('paint', '#d98d2b'), rotor, [x * 0.92, 0, 0]).scale.set(x === -0.02 ? 0.5 : 0.4, 1, 1);

    const rows = [];
    const addRow = (x, hub, tip, chord, n, spin) => rows.push({ x, hub, tip, chord, n, spin });
    for (let i = 0; i < 7; i++) {
      const x = -1.38 + i * 0.2, tip = rInAt(x) - 0.012, hub = 0.19 + 0.03 * (i / 6);
      addRow(x, hub, tip, 0.11, 34, true);
      addRow(x + 0.1, hub, rInAt(x + 0.1) - 0.006, 0.075, 34, false);
    }
    for (let i = 0; i < 4; i++) {
      const x = 0.97 + i * 0.13;
      addRow(x - 0.065, 0.2, rInAt(x - 0.065) - 0.005, 0.06, 30, false);
      addRow(x, 0.2, rInAt(x) - 0.01, 0.075, 42, true);
    }
    const coldStage = (r) => r.x < 0;
    const makeBlades = (filter, mat, g0, g1) => {
      const list = [];
      rows.filter(filter).forEach((r) => { for (let i = 0; i < r.n; i++) list.push({ r, a0: (i / r.n) * 2 * PI + (r.x % 0.7) }); });
      const mesh = new THREE.InstancedMesh(bladeGeo(g0, g1, 0.07), mat, list.length);
      mesh.castShadow = true;
      P.root.add(mesh);
      return { list, mesh };
    };
    const colds = makeBlades((r) => coldStage(r) && r.spin, dbl(P.mat('metal', '#b2b6bc', { roughness: 0.32 })), 0.75, 0.95);
    const coldS = makeBlades((r) => coldStage(r) && !r.spin, dbl(P.mat('steel', '#6f7278')), -0.6, -0.8);
    const hots = makeBlades((r) => !coldStage(r) && r.spin, dbl(P.mat('metal', '#b58f62', { roughness: 0.38 })), -0.85, -1.1);
    const hotS = makeBlades((r) => !coldStage(r) && !r.spin, dbl(P.mat('steel', '#7c6a56')), 0.7, 0.85);
    const setRow = (set, rot) => {
      set.list.forEach((b, i) => {
        const a = b.a0 + (b.r.spin ? rot : 0), sa = Math.sin(a);
        // Only the far half is drawn, because the near half of the engine is cut away.
        const on = sa <= 0.03;
        q.setFromAxisAngle(X, a);
        v.set(b.r.x, Math.cos(a) * b.r.hub, sa * b.r.hub);
        const h = b.r.tip - b.r.hub;
        sc.set(on ? b.r.chord : 0, on ? h : 0, on ? b.r.chord : 0);
        mx.compose(v, q, sc);
        set.mesh.setMatrixAt(i, mx);
      });
      set.mesh.instanceMatrix.needsUpdate = true;
    };
    setRow(coldS, 0); setRow(hotS, 0);
    const ogv = [];
    const ogvM = new THREE.InstancedMesh(bladeGeo(-0.25, -0.2, 0.05), dbl(P.mat('steel', '#5c5f65')), 22);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * 2 * PI, sa = Math.sin(a), on = sa <= 0.03;
      q.setFromAxisAngle(X, a); v.set(-1.62, Math.cos(a) * 0.55, sa * 0.55);
      mx.compose(v, q, sc.set(on ? 0.2 : 0, on ? 0.52 : 0, on ? 0.2 : 0)); ogvM.setMatrixAt(i, mx); ogv.push(i);
    }
    P.root.add(ogvM);

    const flames = [0, 0.5, 1, 1.5, 2].map((k, i) => {
      const a = (k * PI) / 2, f = P.own(kit.flame({ id: `${P.id}.flame${i}`, length: 0.66, radius: 0.058 }));
      f.place([0.16, Math.cos(a) * 0.31, -Math.sin(a) * 0.31 + 0.01]); f.turn(0, 0, PI / 2);
      return f;
    });
    const mirror = (pts) => pts.map(([x, y, z]) => [x, -y, z]);
    const coldCore = [[-3.35, 0.46, 0.03], [-2.6, 0.46, 0.03], [-2.0, 0.44, 0.03], [-1.5, 0.34, 0.03], [-1.0, 0.31, 0.03], [-0.4, 0.27, 0.03], [0.0, 0.26, 0.03], [0.16, 0.3, 0.03]];
    const hotCore = [[0.2, 0.31, 0.03], [0.74, 0.31, 0.03], [0.92, 0.28, 0.03], [1.2, 0.33, 0.03], [1.55, 0.37, 0.03], [2.05, 0.27, 0.03], [2.5, 0.2, 0.03], [3.4, 0.2, 0.03]];
    const bypass = [[-3.35, 0.82, 0.03], [-2.6, 0.82, 0.03], [-1.8, 0.8, 0.03], [-0.8, 0.8, 0.03], [0.1, 0.78, 0.03], [0.5, 0.76, 0.03], [1.4, 0.72, 0.03], [2.6, 0.7, 0.03], [3.4, 0.7, 0.03]];
    const cold = { count: 22, speed: 0.17, size: 7, color: '#a9ccff', intensity: 1.9 };
    const hot = { count: 22, speed: 0.2, size: 8, color: '#ffa640', intensity: 2.5 };
    const flows = [P.beads(coldCore, cold), P.beads(mirror(coldCore), cold), P.beads(hotCore, hot), P.beads(mirror(hotCore), hot), P.beads(bypass, { ...cold, count: 26 }), P.beads(mirror(bypass), { ...cold, count: 26 })];
    const arrow = P.own(kit.arrow({ id: `${P.id}.thrustArrow`, color: '#e8452a', radius: 0.05, headWidth: 3, headLength: 5, from: [1.3, 1.58, 0], to: [1.29, 1.58, 0], glow: 0.35 }));

    P.anchor('fan', P.root, [fanX, 0.72, 0.03], 1.25);
    P.anchor('compressor', P.root, [-0.75, 0.3, 0.02], 0.85);
    P.anchor('combustor', P.root, [0.42, 0.31, 0.02], 0.65);
    P.anchor('turbine', P.root, [1.17, 0.3, 0.02], 0.65);
    P.anchor('nozzle', P.root, [2.15, 0.37, 0.02], 0.75);
    P.anchor('shaft', P.root, [0.84, 0, 0.076], 0.85);
    P.anchor('thrust', P.root, [0, 1.58, 0], 1.6);

    return {
      radius: 2.1,
      update(m, t) {
        const tau = m.run.tau + m.thrust.tau, rot = tau * 2.6, running = m.run.on || m.thrust.on;
        const k = running ? Math.min(1, Math.max(m.run.u, m.thrust.u) * 3) : 0;
        rotor.rotation.x = rot;
        setRow(colds, rot); setRow(hots, rot);
        for (const f of flows) f.show(k);
        for (const f of flames) f.throttle(k);
        glowLiner.emissiveIntensity = 0.55 * k;
        const g = kit.ease.outCubic(Math.min(1, m.thrust.u * 1.3));
        arrow.show(m.thrust.on ? Math.min(1, m.thrust.u * 4) : 0);
        arrow.set([1.3, 1.58, 0], [1.3 - 2.6 * Math.max(g, 0.01), 1.58, 0]);
      },
    };
  },
});

PART('suspensionBridge', {
  doc: 'A real suspension bridge side-on: two tall towers, main cables on a true parabola over the towers and down to anchorages at both ends, vertical hangers, a trussed deck with thickness, water below, and cars. The cable shape is computed, and force beads always run from deck up the hangers, along the cable to the towers and anchorages, then down the towers, so the load path cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['tower', 'cable', 'hanger', 'deck', 'anchorage'],
  motions: { load: 'cars cross in both lanes', forces: 'beads run from the deck up the hangers, along the cable to the towers and down them, and out to the anchorages' },
  views: { front: [0, 5], close: [-20, 8], left: [-32, 12], right: [32, 12], low: [-14, -2], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const b = P.group(P.root, [0, 0.11, 0]);
    const waterY = -0.62, deckY = -0.25, low = -0.19, top = 0.4, TX = 1.8, AX = 3.05, AY = -0.19, CZ = 0.13;
    const cableY = (x) => {
      const a = Math.abs(x);
      if (a <= TX) return low + (top - low) * (a / TX) ** 2;
      const u = (a - TX) / (AX - TX);
      return top + (AY - top) * u - 0.2 * u * (1 - u);
    };
    const iron = P.mat('paint', '#94381f'), steel = P.mat('steel', '#7c8087'), cableM = P.mat('steel', '#8d9095', { roughness: 0.5 }), concrete = P.mat('matte', '#6d6e70'), deckM = P.mat('matte', '#3a3c40', { roughness: 0.7 }), rock = P.mat('rock', '#1f1e1b');

    for (const z of [CZ, -CZ]) {
      const pts = [];
      for (let i = 0; i <= 90; i++) { const x = -AX + (2 * AX * i) / 90; pts.push([x, cableY(x), z]); }
      P.tubeAlong(pts, 0.0115, cableM, b);
    }
    const hx = [];
    for (let x = -AX + 0.15; x < AX - 0.1; x += 0.1) if (Math.abs(Math.abs(x) - TX) > 0.05) hx.push(+x.toFixed(3));
    const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0034, 0.0034, 1, 5), cableM, hx.length * 2);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    hx.forEach((x, i) => {
      const y0 = deckY, y1 = cableY(x);
      [CZ, -CZ].forEach((z, k) => { v.set(x, (y0 + y1) / 2, z); mx.compose(v, q.identity(), sc.set(1, y1 - y0, 1)); hangers.setMatrixAt(i * 2 + k, mx); });
    });
    b.add(hangers);

    P.add(new THREE.BoxGeometry(7.5, 0.024, 0.3), deckM, b, [0, deckY - 0.012, 0]);
    P.add(new THREE.BoxGeometry(7.5, 0.0015, 0.008), P.mat('matte', '#8c8e92'), b, [0, deckY + 0.001, 0]);
    const tDepth = 0.07, tLen = 5.7;
    for (const z of [0.145, -0.145]) { for (const y of [deckY - 0.024, deckY - tDepth]) P.add(new THREE.BoxGeometry(tLen, 0.012, 0.012), iron, b, [0, y, z]); }
    const bays = 80, diagLen = Math.hypot(tLen / bays, tDepth - 0.024), diagA = Math.atan2(tDepth - 0.024, tLen / bays);
    const diag = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 1, 0.006), iron, bays * 2);
    const Z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < bays; i++) {
      const x = -tLen / 2 + ((i + 0.5) * tLen) / bays, s = i % 2 ? 1 : -1;
      [0.145, -0.145].forEach((z, k) => { v.set(x, deckY - (0.024 + tDepth) / 2, z); q.setFromAxisAngle(Z, s * (PI / 2 - diagA)); mx.compose(v, q, sc.set(1, diagLen, 1)); diag.setMatrixAt(i * 2 + k, mx); });
    }
    b.add(diag);

    const towers = [TX, -TX].map((tx) => {
      const t = P.group(b, [tx, 0, 0]);
      P.add(new THREE.BoxGeometry(0.2, deckY - 0.08 - waterY + 0.06, 0.46), concrete, t, [0, (deckY - 0.08 + waterY - 0.06) / 2, 0]);
      for (const z of [CZ, -CZ]) {
        const segs = [[deckY - 0.08, deckY + 0.1, 0.072, 0.06], [deckY + 0.1, 0.13, 0.062, 0.05], [0.13, top - 0.012, 0.052, 0.042]];
        for (const [a, c, wx, wz] of segs) P.add(new THREE.BoxGeometry(wx, c - a, wz), iron, t, [0, (a + c) / 2, z]);
        P.add(new THREE.BoxGeometry(0.06, 0.022, 0.05), steel, t, [0, top + 0.002, z]);
      }
      for (const y of [top - 0.03, 0.2, 0.0]) P.add(new THREE.BoxGeometry(0.042, 0.05, CZ * 2), iron, t, [0, y, 0]);
      P.add(new THREE.BoxGeometry(0.05, 0.05, CZ * 2), iron, t, [0, deckY - 0.11, 0]);
      return t;
    });

    for (const s of [1, -1]) {
      const shape = [[2.72, -0.72], [2.92, -0.35], [3.15, -0.29], [4.2, -0.27], [4.2, -0.72]].map(([x, y]) => [s * x, y]);
      P.add(P.extrude(shape, 2.6), rock, b);
      for (const z of [CZ + 0.035, -CZ - 0.035]) {
        const block = [[3.0, -0.31], [3.0, -0.16], [3.14, -0.1], [3.42, -0.14], [3.42, -0.31]].map(([x, y]) => [s * x, y]);
        P.add(P.extrude(block, 0.13), concrete, b, [0, 0, z]);
      }
    }
    const fN = 128, fD = new Uint8Array(fN * fN * 4);
    for (let y = 0; y < fN; y++) for (let x = 0; x < fN; x++) { const a = Math.max(0, 1 - Math.hypot(x - fN / 2 + 0.5, y - fN / 2 + 0.5) / (fN / 2)), w = 255 * Math.min(1, a * 3.2), i = (y * fN + x) * 4; fD[i] = fD[i + 1] = fD[i + 2] = w; fD[i + 3] = 255; }
    const fT = new THREE.DataTexture(fD, fN, fN); fT.needsUpdate = true;
    P.add(new THREE.CircleGeometry(6.4, 72).rotateX(-PI / 2), P.mat('matte', '#0d222d', { roughness: 0.62, transparent: true, alphaMap: fT, depthWrite: false }), b, [0, waterY, 0]).castShadow = false;

    const carShape = new THREE.Shape();
    [[-0.05, 0.009], [-0.051, 0.021], [-0.03, 0.026], [-0.016, 0.042], [0.012, 0.042], [0.028, 0.027], [0.05, 0.022], [0.052, 0.009]].forEach(([x, y], i) => (i ? carShape.lineTo(x, y) : carShape.moveTo(x, y)));
    carShape.closePath();
    const carG = new THREE.ExtrudeGeometry(carShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 1 }).translate(0, 0, -0.02);
    const wheelG = new THREE.CylinderGeometry(0.0085, 0.0085, 0.046, 12).rotateX(PI / 2), wheelM = P.mat('matte', '#101114');
    const palette = ['#b7babf', '#2b3a4f', '#9a2f22', '#d3cfc6', '#3c4044', '#7c8087'];
    const R = 3.55;
    const cars = [];
    for (let i = 0; i < 10; i++) {
      const dir = i % 2 ? 1 : -1, c = P.group(b, [0, deckY, dir * 0.052]);
      P.add(carG, P.mat('paint', palette[i % palette.length]), c);
      for (const x of [-0.03, 0.031]) P.add(wheelG, wheelM, c, [x, 0.0085, 0]);
      c.rotation.y = dir > 0 ? 0 : PI;
      cars.push({ c, dir, x0: -R + ((i * 0.73 + 0.17) % 1) * 2 * R });
    }
    const near = CZ + 0.002, flows = [];
    const beadOpts = { color: '#ffb95c', intensity: 2.2 };
    for (const x of [-1.2, -0.72, -0.28, 0.28, 0.72, 1.2]) flows.push(P.beads([[x, deckY, near], [x, cableY(x), near]], { ...beadOpts, count: 4, speed: 0.55, size: 7, parent: b }));
    const sample = (x0, x1, n) => { const out = []; for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; out.push([x, cableY(x), near]); } return out; };
    for (const s of [1, -1]) {
      flows.push(P.beads(sample(0, s * TX, 14), { ...beadOpts, count: 16, speed: 0.22, size: 7, parent: b }));
      flows.push(P.beads(sample(s * TX, s * AX, 10), { ...beadOpts, count: 12, speed: 0.26, size: 7, parent: b }));
      flows.push(P.beads([[s * TX, top, near + 0.03], [s * TX, waterY + 0.05, near + 0.03]], { ...beadOpts, count: 9, speed: 0.34, size: 8, parent: b }));
    }
    P.anchor('tower', b, [-TX, 0.12, CZ + 0.03], 0.72);
    P.anchor('cable', b, [0.72, cableY(0.72), CZ], 0.72);
    P.anchor('hanger', b, [0.3, (deckY + cableY(0.3)) / 2, CZ], 0.42);
    P.anchor('deck', b, [0.45, deckY - 0.02, 0.15], 0.6);
    P.anchor('anchorage', b, [3.14, -0.16, CZ + 0.1], 0.65);

    return {
      radius: 1.85,
      update(m) {
        const d = m.load.tau * 0.34;
        for (const k of cars) {
          const x = ((((k.x0 + k.dir * d + R) % (2 * R)) + 2 * R) % (2 * R)) - R;
          k.c.position.x = x;
          const s = Math.min(1, Math.max(0, (R - Math.abs(x)) / 0.12));
          k.c.scale.setScalar(s > 0.001 ? s : 0.001);
        }
        const f = m.forces.on ? Math.min(1, m.forces.u * 3) : 0;
        for (const x of flows) x.show(f);
      },
    };
  },
});

PART('pistonEngine', {
  doc: 'One real engine cylinder cut open on the near side: ringed piston, connecting rod, crankshaft with counterweight and flywheel, camshafts at half crank speed opening intake and exhaust valves, spark plug, and gas whose colour follows the true four strokes in order: intake, compression, spark and power, exhaust. Piston position is the slider-crank formula and valve lift is the cam profile, so stroke order and valve timing cannot be set wrong.',
  args: 'none',
  stage: 'studio',
  anchors: ['piston', 'rod', 'crank', 'flywheel', 'intake', 'exhaust', 'spark', 'chamber'],
  motions: { run: 'the crank turns and the engine runs the four strokes in true order, one cycle about every 5 s' },
  views: { front: [0, 3], close: [14, 6], left: [-26, 8], right: [26, 8], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const e = P.group(P.root, [0, 0.61, 0]);
    const BORE = 0.5, CR = 0.5, ROD = 1.7, CY = -1.75, DECK = 0.57;
    const crownY = (th) => CY + CR * Math.cos(th) + Math.sqrt(ROD * ROD - (CR * Math.sin(th)) ** 2);
    const cutM = new THREE.MeshStandardMaterial({ color: '#a39e91', roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
    const dbl = (m) => { m.side = THREE.DoubleSide; return m; };
    const blockM = dbl(P.mat('metal', '#6a6d73', { roughness: 0.48 })), boreM = dbl(P.mat('steel', '#7b7e84', { roughness: 0.38 })), bright = P.mat('metal', '#c9ccd1', { roughness: 0.28 }), darkS = P.mat('steel', '#3b3d42'), rodM = P.mat('metal', '#a9adb3', { roughness: 0.32 });
    const zRod = (r, len, mat, parent, at) => P.add(new THREE.CylinderGeometry(r, r, len, 28).rotateX(PI / 2), mat, parent, at);
    const revY = (pts, far, parent, cut) => {
      const g = new THREE.LatheGeometry([...pts, pts[0]].map(([r, y]) => new THREE.Vector2(r, y)), 64, PI / 2, PI);
      P.add(g, far, parent);
      const s = new THREE.Shape(); pts.forEach(([r, y], i) => (i ? s.lineTo(r, y) : s.moveTo(r, y))); s.closePath();
      const f = new THREE.ShapeGeometry(s);
      P.add(f, cut ?? cutM, parent);
      P.add(f.clone().scale(-1, 1, 1), cut ?? cutM, parent);
    };
    revY([[BORE + 0.004, -0.72], [BORE + 0.13, -0.72], [BORE + 0.13, DECK], [BORE + 0.004, DECK]], boreM, e);
    const extrudeBack = (pts, depth, mats, at) => {
      const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
      return P.add(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -depth), mats, e, at);
    };
    const faceSide = [cutM, blockM];
    const leftLower = [[-BORE - 0.13, DECK], [-BORE, DECK], [-0.42, 0.62], [-0.36, 0.67], [-0.56, 0.84], [-1.02, 0.84], [-1.02, 0.74], [-BORE - 0.13, 0.74]];
    const mirrorX = (p) => p.map(([x, y]) => [-x, y]).reverse();
    const center = [[-0.13, 0.7], [0, 0.75], [0.13, 0.7], [0.36, 1.0], [1.02, 1.0], [1.02, 1.17], [-1.02, 1.17], [-1.02, 1.0], [-0.36, 1.0]];
    extrudeBack(leftLower, 0.62, faceSide);
    extrudeBack(mirrorX(leftLower), 0.62, faceSide);
    extrudeBack(center, 0.62, faceSide);
    const ringPts = [], aGap = Math.asin((BORE + 0.13) / 1.25);
    for (let i = 0; i <= 36; i++) { const a = PI / 2 - aGap - (i / 36) * (2 * PI - 2 * aGap); ringPts.push([Math.cos(a) * 1.25, CY + Math.sin(a) * 1.25]); }
    for (let i = 36; i >= 0; i--) { const a = PI / 2 - aGap - (i / 36) * (2 * PI - 2 * aGap); ringPts.push([Math.cos(a) * 1.14, CY + Math.sin(a) * 1.14]); }
    extrudeBack(ringPts, 0.78, faceSide);
    P.add(new THREE.BoxGeometry(2.9, 0.09, 1.1), darkS, e, [0, CY - 1.3, -0.3]);
    const fN = 96, fD = new Uint8Array(fN * fN * 4);
    for (let y = 0; y < fN; y++) for (let x = 0; x < fN; x++) { const a = Math.max(0, 1 - Math.hypot(x - fN / 2 + 0.5, y - fN / 2 + 0.5) / (fN / 2)), v = 255 * Math.min(1, a * a * 3.4), i = (y * fN + x) * 4; fD[i] = fD[i + 1] = fD[i + 2] = v; fD[i + 3] = 255; }
    const fT = new THREE.DataTexture(fD, fN, fN); fT.needsUpdate = true;
    P.add(new THREE.CircleGeometry(3.4, 64).rotateX(-PI / 2), P.mat('matte', '#23252b', { roughness: 0.75, transparent: true, alphaMap: fT, depthWrite: false }), e, [0, CY - 1.345, -0.3]).castShadow = false;

    const crank = P.group(e, [0, CY, 0]);
    zRod(0.1, 0.56, bright, crank, [0, 0, -0.27]);
    zRod(0.095, 0.24, bright, crank, [0, CR, -0.02]);
    const web = new THREE.Shape();
    web.absarc(0, CR, 0.17, PI, 0, true);
    web.lineTo(0.17, 0.06);
    for (let i = 0; i <= 18; i++) { const a = -0.3 - (i / 18) * (PI - 0.6); web.lineTo(Math.cos(a) * 0.68, Math.sin(a) * 0.68); }
    web.lineTo(-0.17, 0.06);
    web.closePath();
    P.add(new THREE.ExtrudeGeometry(web, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 14 }).translate(0, 0, -0.2), P.mat('metal', '#6f7278', { roughness: 0.42 }), crank);
    const fly = new THREE.Shape();
    fly.absarc(0, 0, 0.98, 0, 2 * PI, false);
    for (let k = 0; k < 6; k++) { const a0 = (k / 6) * 2 * PI + 0.16, a1 = ((k + 1) / 6) * 2 * PI - 0.16, w = new THREE.Path(); w.absarc(0, 0, 0.8, a0, a1, false); w.absarc(0, 0, 0.22, a1, a0, true); fly.holes.push(w); }
    P.add(new THREE.ExtrudeGeometry(fly, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 36 }).translate(0, 0, -0.08), P.mat('steel', '#3f4247', { roughness: 0.42 }), crank, [0, 0, -0.5]);
    P.add(new THREE.BoxGeometry(0.1, 0.17, 0.02), P.mat('paint', '#d98d2b'), crank, [0, 0.89, -0.41]);

    const piston = P.group(e, [0, 0, 0]);
    revY([[0.001, 0], [BORE - 0.006, 0], [BORE - 0.006, -0.62], [BORE - 0.06, -0.62], [BORE - 0.06, -0.14], [0.001, -0.14]], dbl(P.mat('metal', '#a2a6ac', { roughness: 0.4 })), piston);
    const WRIST = -0.32;
    for (const [y, c] of [[-0.05, '#26272a'], [-0.09, '#26272a'], [-0.13, '#55575c']]) P.add(new THREE.TorusGeometry(BORE - 0.002, 0.009, 8, 48, PI).rotateX(-PI / 2), P.mat('steel', c), piston, [0, y, 0]);
    zRod(0.058, 0.44, bright, piston, [0, WRIST, -0.2]);
    P.add(new THREE.BoxGeometry(0.1, 0.22, 0.24), P.mat('metal', '#8f9399'), piston, [BORE - 0.1, WRIST, -0.16]);
    P.add(new THREE.BoxGeometry(0.1, 0.22, 0.24), P.mat('metal', '#8f9399'), piston, [-BORE + 0.1, WRIST, -0.16]);

    const rod = P.group(e);
    const rs = new THREE.Shape(), RLEN = ROD;
    rs.absarc(0, 0, 0.18, -PI / 2 - 1.15 + 2 * PI, PI / 2 + 1.15 - 2 * PI + 2 * PI, true);
    rs.lineTo(-0.058, RLEN - 0.09);
    rs.absarc(0, RLEN, 0.095, -PI / 2 - 0.65, -PI / 2 + 0.65 - 2 * PI + 2 * PI + 2 * PI, true);
    rs.lineTo(0.09, 0.14);
    rs.closePath();
    const h1 = new THREE.Path(); h1.absarc(0, 0, 0.098, 0, 2 * PI, true); rs.holes.push(h1);
    const h2 = new THREE.Path(); h2.absarc(0, RLEN, 0.06, 0, 2 * PI, true); rs.holes.push(h2);
    P.add(new THREE.ExtrudeGeometry(rs, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 18 }).translate(0, 0, -0.05), rodM, rod);
    P.add(new THREE.BoxGeometry(0.05, RLEN - 0.45, 0.012), P.mat('steel', '#55585e'), rod, [0, RLEN / 2, 0.056]);

    const CB = 0.1, LMAX = 0.16;
    const bell = (x) => { const k = Math.min(1, Math.max(0, x)); return Math.sin(PI * k) ** 2; };
    const norm = (d) => ((d % 720) + 720) % 720;
    // Cycle degrees from top dead centre of intake. Intake opens just before it and closes just after bottom dead centre; exhaust mirrors that round the fourth stroke.
    const liftIn = (deg) => bell(norm(deg + 12) / 234);
    const liftEx = (deg) => bell((norm(deg) - 516) / 216);
    const camGeo = (liftFn) => {
      const s = new THREE.Shape();
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * 2 * PI, deg = (2 * (a + PI / 2) * 180) / PI, q = CB + LMAX * liftFn(deg);
        if (i) s.lineTo(Math.cos(a) * q, Math.sin(a) * q); else s.moveTo(Math.cos(a) * q, Math.sin(a) * q);
      }
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
    };
    const VX = 0.27, SEAT = 0.66, STEM_TOP = 1.46, CAM_Y = STEM_TOP + CB;
    const makeValve = (x, tint, fn) => {
      const v = P.group(e, [x, 0, 0]);
      P.add(P.lathe([[0.001, SEAT - 0.005], [0.115, SEAT - 0.005], [0.115, SEAT + 0.012], [0.035, SEAT + 0.06], [0.022, SEAT + 0.13], [0.022, STEM_TOP - 0.02], [0.05, STEM_TOP - 0.02], [0.05, STEM_TOP], [0.001, STEM_TOP]], 28), P.mat('metal', tint, { roughness: 0.3 }), v);
      const cam = P.group(e, [x, CAM_Y, 0]);
      P.add(camGeo(fn), P.mat('metal', '#8f9399', { roughness: 0.3 }), cam);
      zRod(0.04, 0.72, bright, cam, [0, 0, -0.27]);
      const pts = [], turns = 5, h = STEM_TOP - 0.02 - 1.17;
      for (let i = 0; i <= 80; i++) { const k = i / 80, a = k * turns * 2 * PI; pts.push([Math.cos(a) * 0.052, k * h, Math.sin(a) * 0.052]); }
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const spring = P.add(new THREE.TubeGeometry(curve, 160, 0.0075, 6), P.mat('steel', '#7c8087'), e, [x, 1.17, 0]);
      return { v, cam, spring, fn, h };
    };
    const inV = makeValve(-VX, '#c4c7cc', liftIn), exV = makeValve(VX, '#b39a7e', liftEx);
    P.add(new THREE.CylinderGeometry(0.03, 0.022, 0.3, 16), P.mat('matte', '#d3cec2'), e, [0, 1.3, 0]);
    P.add(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 6), P.mat('metal', '#b9bcc1'), e, [0, 1.14, 0]);
    P.add(new THREE.CylinderGeometry(0.018, 0.018, 0.38, 12), P.mat('metal', '#b0b3b8'), e, [0, 0.93, 0]);
    P.add(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), P.mat('metal', '#d9dade'), e, [0, 0.73, 0]);
    const spark = P.own(kit.glow({ id: `${P.id}.sparkGlow`, color: '#dfe8ff', size: 0.34, intensity: 0 }), e);
    spark.place([0, 0.72, 0.02]);

    const gasM = new THREE.MeshBasicMaterial({ color: '#7fb0cf', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, toneMapped: true });
    const gas = P.group(e);
    const gasBody = new THREE.Mesh(new THREE.CylinderGeometry(BORE - 0.01, BORE - 0.01, 1, 48, 1, false), gasM);
    const dome = new THREE.Mesh(new THREE.ConeGeometry(BORE - 0.01, 0.13, 48, 1, true), gasM);
    gas.add(gasBody);
    e.add(dome);
    dome.position.set(0, 0.665, 0);
    const heatGlow = P.own(kit.glow({ id: `${P.id}.heat`, color: '#ff9a3c', size: 1.1, intensity: 0 }), e);
    heatGlow.place([0, 0.3, 0.1]);
    const intakeB = P.beads([[-1.5, 0.92, 0.01], [-0.9, 0.92, 0.01], [-0.5, 0.9, 0.01], [-0.3, 0.72, 0.01], [-0.27, 0.56, 0.01], [-0.15, 0.3, 0.01]], { count: 16, speed: 0.5, size: 8, color: '#a9ccff', intensity: 2, parent: e });
    const exhaustB = P.beads([[0.15, 0.3, 0.01], [0.27, 0.56, 0.01], [0.3, 0.72, 0.01], [0.5, 0.9, 0.01], [0.9, 0.92, 0.01], [1.5, 0.92, 0.01]], { count: 16, speed: 0.5, size: 8, color: '#c7b49e', intensity: 1.8, parent: e });
    const cCold = new THREE.Color('#79b4d6'), cWarm = new THREE.Color('#a8a58f'), cHot = new THREE.Color('#ff8a2a').multiplyScalar(1.5), cDull = new THREE.Color('#a33a14').multiplyScalar(1.2), cGrey = new THREE.Color('#77706a');
    const chamberAt = P.group(e);

    P.anchor('piston', piston, [0.18, -0.06, 0.02], 0.8);
    P.anchor('rod', rod, [0, RLEN * 0.5, 0.06], 0.95);
    P.anchor('crank', e, [0, CY, 0.08], 1.1);
    P.anchor('flywheel', e, [-0.62, CY - 0.62, -0.42], 1.25);
    P.anchor('intake', inV.v, [0, SEAT + 0.02, 0.02], 0.7);
    P.anchor('exhaust', exV.v, [0, SEAT + 0.02, 0.02], 0.7);
    P.anchor('spark', e, [0, 0.72, 0.02], 0.6);
    P.anchor('chamber', chamberAt, [0.1, 0, 0.1], 0.8);

    return {
      radius: 2.35,
      update(m) {
        const th = m.run.tau * 2.4, deg = (th * 180) / PI, d = norm(deg), crown = crownY(th), crownE = crown;
        crank.rotation.z = -th;
        piston.position.y = crownE;
        const px = CR * Math.sin(th), py = CY + CR * Math.cos(th);
        rod.position.set(px, py, 0);
        rod.rotation.z = Math.atan2(px, crown + WRIST - py);
        const lenNow = Math.hypot(px, crown + WRIST - py);
        rod.scale.y = lenNow / RLEN;
        for (const v of [inV, exV]) {
          const l = LMAX * v.fn(deg);
          v.v.position.y = -l;
          v.cam.rotation.z = -th / 2;
          v.spring.scale.y = (v.h - l) / v.h;
        }
        const roof = 0.6, hgt = Math.max(roof - crown, 0.02);
        gasBody.scale.y = hgt;
        gas.position.y = (roof + crown) / 2;
        chamberAt.position.y = (roof + crown) / 2;
        const running = m.run.tau > 0;
        const k = (a, b) => Math.min(1, Math.max(0, (d - a) / (b - a)));
        let op, heat = 0;
        if (d < 180) { gasM.color.copy(cCold); op = 0.1 + 0.16 * (d / 180); }
        else if (d < 352) { gasM.color.copy(cCold).lerp(cWarm, k(180, 352)); op = 0.26 + 0.34 * k(180, 352); }
        else if (d < 540) { const u = k(352, 540); gasM.color.copy(cHot).lerp(cDull, u * u); op = 0.72 - 0.3 * u; heat = (1 - u) * (1 - u) * 1.2; }
        else { gasM.color.copy(cGrey); op = 0.5 - 0.4 * k(540, 720); }
        if (d >= 352 && d < 362) heat *= k(352, 362);
        gasM.opacity = running ? op : 0.1;
        heatGlow.place([0, (crown + roof) / 2, 0.12]);
        heatGlow.intensity(running ? heat : 0);
        spark.intensity(running && d > 340 && d < 362 ? 9 * bell((d - 340) / 22) : 0);
        intakeB.show(running ? Math.min(1, liftIn(deg) * 2.2) : 0);
        exhaustB.show(running ? Math.min(1, liftEx(deg) * 2.2) : 0);
      },
    };
  },
});

PART('pulley', {
  doc: 'A real block and tackle with a rope you can follow: with 2 lines, one fixed pulley and one movable pulley carry the load, and pulling down two units of rope lifts the load one unit; with 1 line, the fixed pulley only changes direction. Rope, pulley turning and travel are computed from one lift value against drawn scales, so the ratio cannot be set wrong.',
  args: 'lines: 1 or 2 supporting lines, default 2',
  stage: 'studio',
  anchors: ['fixedPulley', 'movablePulley', 'rope', 'load', 'pull'],
  motions: { lift: 'the hand pulls the rope down and the load rises by the true ratio, over about 3 s' },
  views: { front: [0, 3], close: [14, 6], left: [-26, 8], right: [26, 8], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const lines = o.lines === 1 ? 1 : 2;
    const e = P.group(P.root, [0, -0.475, 0]);
    const r = 0.35, BEAM = 2.2, FY = 1.72, FX = lines === 2 ? r : 0, MX = -r, M0 = 0.32, RUN = 0.72;
    const HX = FX + r;
    const steel = P.mat('steel', '#6d7076'), bright = P.mat('metal', '#c4c7cc', { roughness: 0.3 }), dark = P.mat('steel', '#35373c'), ropeM = P.mat('matte', '#b08c58', { roughness: 0.75 });
    const zRod = (rr, len, mat, parent, at) => P.add(new THREE.CylinderGeometry(rr, rr, len, 24).rotateX(PI / 2), mat, parent, at);
    P.add(new THREE.BoxGeometry(2.9, 0.09, 0.3), steel, e, [0, BEAM + 0.2, 0]);
    P.add(new THREE.BoxGeometry(2.9, 0.09, 0.3), steel, e, [0, BEAM + 0.0, 0]);
    P.add(new THREE.BoxGeometry(2.9, 0.16, 0.05), steel, e, [0, BEAM + 0.1, 0]);
    const sheave = () => {
      const g = P.group(e);
      const pts = [[r - 0.06, -0.075], [r + 0.045, -0.075], [r + 0.05, -0.062], [r + 0.006, -0.02], [r - 0.012, 0], [r + 0.006, 0.02], [r + 0.05, 0.062], [r + 0.045, 0.075], [r - 0.06, 0.075], [r - 0.06, -0.075]];
      P.add(P.lathe(pts, 56).rotateX(PI / 2), P.mat('metal', '#9a9ea4', { roughness: 0.38 }), g);
      const web = new THREE.Shape(); web.absarc(0, 0, r - 0.02, 0, 2 * PI, false);
      for (let k = 0; k < 5; k++) { const h = new THREE.Path(), a = (k / 5) * 2 * PI + 0.3; h.absarc(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.2, 0, 2 * PI, true); web.holes.push(h); }
      P.add(new THREE.ExtrudeGeometry(web, { depth: 0.05, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -0.025), P.mat('steel', '#6f7278'), g);
      P.add(new THREE.BoxGeometry(0.035, 0.09, 0.06), P.mat('paint', '#d98d2b'), g, [0, r - 0.075, 0]);
      return g;
    };
    const plate = (x0, y0, x1, y1, parent) => {
      for (const z of [0.1, -0.1]) {
        const len = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(new THREE.BoxGeometry(0.11, len, 0.018), steel);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); m.castShadow = true; parent.add(m);
      }
    };
    const fixed = sheave(); fixed.position.set(FX, FY, 0);
    zRod(0.045, 0.27, bright, e, [FX, FY, 0]);
    plate(FX, FY, FX, BEAM, e);
    const moveG = P.group(e, [MX, M0, 0]);
    const mover = sheave();
    if (lines === 2) {
      moveG.add(mover); mover.position.set(0, 0, 0);
      zRod(0.045, 0.27, bright, moveG, [0, 0, 0]);
      plate(0, 0.02, 0, -r - 0.15, moveG);
    } else { mover.visible = false; }
    const hookY = lines === 2 ? -r - 0.12 : 0;
    const hook = P.group(moveG, [0, hookY, 0]);
    zRod(0.022, 0.27, bright, hook, [0, 0, 0]);
    P.tubeAlong([[0, 0, 0], [0, -0.09, 0], [0.05, -0.15, 0], [0.04, -0.215, 0], [-0.015, -0.245, 0], [-0.07, -0.21, 0], [-0.075, -0.165, 0]], 0.019, bright, hook);
    const ringPts = new THREE.TorusGeometry(0.06, 0.016, 10, 28);
    P.add(ringPts, bright, hook, [0, -0.255, 0]);
    const weight = P.lathe([[0.001, -0.62], [0.27, -0.62], [0.3, -0.59], [0.3, -0.48], [0.27, -0.46], [0.27, -0.44], [0.3, -0.42], [0.3, -0.33], [0.2, -0.27], [0.06, -0.24], [0.04, -0.2], [0.001, -0.2]], 48);
    P.add(weight, P.mat('metal', '#3d4046', { roughness: 0.5 }), hook, [0, -0.11, 0]);
    const H0 = 0.72, stroke = lines === 2 ? 2 : 1;

    const ropeR = r;
    const pieces = (s) => {
      const hand = H0 - stroke * s;
      if (lines === 2) {
        const my = M0 + s;
        return [
          { a: [MX - ropeR, BEAM], b: [MX - ropeR, my] },
          { c: [MX, my], a0: PI, a1: 2 * PI, ccw: true },
          { a: [MX + ropeR, my], b: [FX - ropeR, FY] },
          { c: [FX, FY], a0: PI, a1: 0, ccw: false },
          { a: [FX + ropeR, FY], b: [HX, hand] },
          { a: [HX, hand], b: [HX, hand - 0.32] },
        ];
      }
      const ly = M0 + s + 0.02;
      return [
        { a: [FX - ropeR, ly], b: [FX - ropeR, FY] },
        { c: [FX, FY], a0: PI, a1: 0, ccw: false },
        { a: [FX + ropeR, FY], b: [HX, hand] },
        { a: [HX, hand], b: [HX, hand - 0.32] },
      ];
    };
    const lenOf = (p) => (p.c ? Math.abs(p.a1 - p.a0) * ropeR : Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
    const ropeAt = (ps, d) => {
      let left = d;
      for (const p of ps) {
        const l = lenOf(p);
        if (left <= l || p === ps[ps.length - 1]) {
          const k = Math.min(1, left / l);
          if (p.c) {
            const a = p.a0 + (p.a1 - p.a0) * k, x = p.c[0] + Math.cos(a) * ropeR, y = p.c[1] + Math.sin(a) * ropeR;
            return [x, y, a + (p.a1 > p.a0 ? PI / 2 : -PI / 2)];
          }
          return [p.a[0] + (p.b[0] - p.a[0]) * k, p.a[1] + (p.b[1] - p.a[1]) * k, Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0])];
        }
        left -= l;
      }
      return [0, 0, 0];
    };
    const total = pieces(0).reduce((v, p) => v + lenOf(p), 0);
    const N = Math.min(420, Math.ceil(total / 0.024));
    const rope = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.0155, 0.038, 2, 7), ropeM, N);
    rope.castShadow = true;
    e.add(rope);
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), mx = new THREE.Matrix4(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    const setRope = (s) => {
      const ps = pieces(s);
      for (let i = 0; i < N; i++) {
        const [x, y, a] = ropeAt(ps, (i * total) / N), side = i % 3 - 1;
        // Three laid strands: each short segment leans the same way across the rope, so it reads as twisted fibre.
        q.setFromAxisAngle(Z, a - PI / 2);
        q2.setFromAxisAngle(X, 0.62);
        q.multiply(q2);
        v.set(x - Math.sin(a) * side * 0.0085, y + Math.cos(a) * side * 0.0085, side * 0.0085);
        mx.compose(v, q, one);
        rope.setMatrixAt(i, mx);
      }
      rope.instanceMatrix.needsUpdate = true;
    };
    if (lines === 2) { P.add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), bright, e, [MX - ropeR, BEAM - 0.02, 0]); }

    const hand = P.group(e, [HX, H0, 0]);
    P.add(new THREE.CylinderGeometry(0.034, 0.034, 0.34, 18).rotateZ(PI / 2), P.mat('matte', '#6f4e2e', { roughness: 0.55 }), hand, [0, -0.335, 0]);
    P.add(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 18).rotateZ(PI / 2), bright, hand, [0, -0.335, 0]);
    const fN = 96, fD = new Uint8Array(fN * fN * 4);
    for (let y = 0; y < fN; y++) for (let x = 0; x < fN; x++) { const a = Math.max(0, 1 - Math.hypot(x - fN / 2 + 0.5, y - fN / 2 + 0.5) / (fN / 2)), w = 255 * Math.min(1, a * a * 3.4), i = (y * fN + x) * 4; fD[i] = fD[i + 1] = fD[i + 2] = w; fD[i + 3] = 255; }
    const fT = new THREE.DataTexture(fD, fN, fN); fT.needsUpdate = true;
    P.add(new THREE.CircleGeometry(3.2, 64).rotateX(-PI / 2), P.mat('matte', '#23252b', { roughness: 0.75, transparent: true, alphaMap: fT, depthWrite: false }), e, [0, -1.0, 0]).castShadow = false;

    const rule = (x, y0, count) => {
      const tick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.008, 0.006), P.mat('matte', '#8c8f94'), count + 1);
      for (let i = 0; i <= count; i++) { v.set(i % 2 ? 0 : 0.012, y0 - (RUN / 2) * i * (y0 > 0.9 ? 1 : 1), 0); mx.compose(v, q.identity(), one); tick.setMatrixAt(i, mx); }
      tick.position.x = x;
      e.add(tick);
      P.add(new THREE.BoxGeometry(0.008, (RUN / 2) * count, 0.006), P.mat('matte', '#6d7076'), e, [x - 0.04, y0 - (RUN / 4) * count, 0]);
    };
    rule(HX - 0.2, H0, stroke * 2);
    const loadBottom = M0 + hookY - 0.11 - 0.62;
    const loadX = MX + 0.46, ruleTop = loadBottom + RUN;
    const ruler = P.group(e);
    { const tick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.008, 0.006), P.mat('matte', '#8c8f94'), 3); for (let i = 0; i <= 2; i++) { v.set(i % 2 ? 0 : 0.012, ruleTop - (RUN / 2) * i, 0); mx.compose(v, q.identity(), one); tick.setMatrixAt(i, mx); } tick.position.x = loadX; ruler.add(tick); P.add(new THREE.BoxGeometry(0.008, RUN, 0.006), P.mat('matte', '#6d7076'), ruler, [loadX - 0.04, ruleTop - RUN / 2, 0]); }
    P.add(new THREE.BoxGeometry(0.1, 0.008, 0.008), P.mat('paint', '#d98d2b'), hook, [0.46, -0.73, 0]);

    P.anchor('fixedPulley', e, [FX, FY, 0.09], 0.65);
    if (lines === 2) P.anchor('movablePulley', moveG, [0, 0, 0.09], 0.65); else P.anchor('movablePulley', moveG, [0, 0, 0.03], 0.65);
    P.anchor('rope', e, [lines === 2 ? 0 : FX - r, 1.15, 0.016], 0.8);
    P.anchor('load', hook, [0.2, -0.45, 0.2], 0.7);
    P.anchor('pull', hand, [0, -0.335, 0.035], 0.7);

    return {
      radius: 2.2,
      update(m) {
        const s = RUN * kit.ease.inOutSine(m.lift.u);
        moveG.position.y = M0 + s;
        hand.position.y = H0 - stroke * s;
        fixed.rotation.z = (-stroke * s) / r;
        if (lines === 2) mover.rotation.z = s / r;
        setRope(s);
      },
    };
  },
});

PART('lever', {
  doc: 'A real lever: a long plank on a triangular fulcrum with a heavy iron load on the short side and a downward effort on the long side. The fulcrum position sets the arm ratio; the effort arrow is the load arrow divided by that ratio, so the moments balance by the true rule, and when it tips the long end travels ratio times further than the load rises. None of this can be set wrong.',
  args: 'ratio: long arm over short arm, 2 to 5, default 3',
  stage: 'studio',
  anchors: ['plank', 'fulcrum', 'load', 'effort'],
  motions: { tip: 'the effort presses the long end down and the load rises, by the true arm ratio, over about 3 s' },
  views: { front: [0, 4], close: [16, 8], left: [-28, 10], right: [28, 10], flat: [0, 0] },
  build(kit, o, P) {
    const THREE = P.THREE, PI = Math.PI;
    const ratio = Math.min(5, Math.max(2, o.ratio ?? 3));
    const e = P.group(P.root, [0, -0.42, 0]);
    const LEN = 5, a = LEN / (1 + ratio), b = LEN - a, fx = -LEN / 2 + a, G = -0.85, pivotY = 0, TH = 0.14, DEPTH = 0.72;
    const wood = P.mat('matte', '#7c5b39', { roughness: 0.62 }), seam = P.mat('matte', '#3e2c1b'), stone = P.mat('steel', '#55585e', { roughness: 0.55 }), iron = P.mat('metal', '#3d4046', { roughness: 0.48 }), bright = P.mat('metal', '#c4c7cc', { roughness: 0.3 });
    const plank = P.group(e, [fx, pivotY, 0]);
    P.add(new THREE.BoxGeometry(LEN, TH, DEPTH), wood, plank, [(b - a) / 2, TH / 2, 0]);
    for (const z of [-0.18, 0.18]) P.add(new THREE.BoxGeometry(LEN, TH + 0.002, 0.006), seam, plank, [(b - a) / 2, TH / 2, z]);
    for (let i = 0; i < 6; i++) P.add(new THREE.BoxGeometry(0.006, TH + 0.002, DEPTH + 0.002), seam, plank, [-a + ((i + 0.5) * LEN) / 6, TH / 2, 0]);
    const tri = [[-0.46, G - pivotY], [0.46, G - pivotY], [0.03, -0.012], [-0.03, -0.012]];
    P.add(P.extrude(tri, 0.86), stone, e, [fx, pivotY, 0]);
    const Lx = -a + 0.42, LS = 0.72, LH = 0.72;
    const load = P.group(plank, [Lx, TH, 0]);
    P.add(new THREE.BoxGeometry(LS, LH, LS * 0.9), iron, load, [0, LH / 2, 0]);
    for (const y of [0.1, LH - 0.1]) P.add(new THREE.BoxGeometry(LS + 0.02, 0.022, LS * 0.92), P.mat('steel', '#25272b'), load, [0, y, 0]);
    P.add(new THREE.TorusGeometry(0.095, 0.022, 10, 28), bright, load, [0, LH + 0.08, 0]);
    const fN = 96, fD = new Uint8Array(fN * fN * 4);
    for (let y = 0; y < fN; y++) for (let x = 0; x < fN; x++) { const q = Math.max(0, 1 - Math.hypot(x - fN / 2 + 0.5, y - fN / 2 + 0.5) / (fN / 2)), w = 255 * Math.min(1, q * q * 3.4), i = (y * fN + x) * 4; fD[i] = fD[i + 1] = fD[i + 2] = w; fD[i + 3] = 255; }
    const fT = new THREE.DataTexture(fD, fN, fN); fT.needsUpdate = true;
    P.add(new THREE.CircleGeometry(4.4, 64).rotateX(-PI / 2), P.mat('matte', '#23252b', { roughness: 0.75, transparent: true, alphaMap: fT, depthWrite: false }), e, [0, G, 0]).castShadow = false;
    const phiMax = Math.asin((0.84 * (pivotY - G)) / b);
    const Lw = 1.5, Lf = Lw / ratio;
    const armF = b - 0.16, armL = -Lx;
    const effortA = P.own(kit.arrow({ id: `${P.id}.effortArrow`, color: '#e8452a', radius: 0.042, headWidth: 3, headLength: 4.2, from: [0, 1, 0], to: [0, 0.9, 0], glow: 0.35 }), e);
    const loadA = P.own(kit.arrow({ id: `${P.id}.loadArrow`, color: '#a9adb3', radius: 0.042, headWidth: 3, headLength: 4.2, from: [0, 1, 0], to: [0, 0.9, 0], glow: 0.1 }), e);
    const endAnchor = P.group(plank, [armF, TH, 0]);
    P.anchor('plank', plank, [b * 0.5, TH / 2, DEPTH / 2], 1.3);
    P.anchor('fulcrum', e, [fx, -0.4, 0.43], 0.8);
    P.anchor('load', load, [0.12, LH * 0.55, LS * 0.45], 0.9);
    P.anchor('effort', endAnchor, [0, 0.06, DEPTH / 2], 0.9);
    return {
      radius: 1.8,
      update(m) {
        const phi = phiMax * kit.ease.inOutSine(m.tip.u);
        plank.rotation.z = -phi;
        const c = Math.cos(phi), s = Math.sin(phi);
        const ex = fx + armF * c + TH * s, ey = pivotY - armF * s + TH * c;
        effortA.set([ex, ey + Lf + 0.03, DEPTH / 2 + 0.03], [ex, ey + 0.03, DEPTH / 2 + 0.03]);
        const lx = fx - armL * c + TH * s, ly = pivotY + armL * s + TH * c;
        loadA.set([lx, ly + Lw + 0.02, LS * 0.45 + 0.06], [lx, ly + 0.02, LS * 0.45 + 0.06]);
      },
    };
  },
});
