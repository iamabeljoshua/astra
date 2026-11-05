PART('planet', {
  alone: false,
  doc: 'One real planet with a NASA surface map, lit by the sun.',
  args: 'preset: mercury|venus|earth|moon|mars|jupiter|saturn|uranus|neptune',
  stage: 'space',
  anchors: ['surface', 'north'],
  motions: { spin: 'turns it on its axis' },
  views: { front: [20, 8] },
  build(kit, o, P) {
    kit.sunAt([-200, 240, 520]);
    const planet = P.own(kit.planet({ id: `${P.id}.body`, preset: o.preset ?? 'earth', radius: 1, spin: 0, spinStart: 118, segments: 96, cloudGain: 1.3, sunset: 0.22, glint: 0.3 }));
    P.anchor('surface', P.root, [0.5, 0.74, 0.46], 0.4);
    P.anchor('north', P.root, [0, 1.02, 0], 0.4);
    return { radius: 1.25, update(m) { planet.spinTo?.(118 + m.spin.tau * 24); } };
  },
});

PART('sunStar', {
  alone: false,
  doc: 'The Sun or a star with an animated surface and corona. It lights every planet in the scene.',
  args: 'none',
  stage: 'space',
  anchors: ['corona'],
  motions: {},
  build(kit, o, P) {
    P.own(kit.sun({ id: `${P.id}.body`, radius: 1, coronaScale: 5, corona: 0.5, rays: 0.4 }));
    P.anchor('corona', P.root, [0.9, 0.9, 0.4], 0.7);
    return { radius: 1.8 };
  },
});

PART('rocket', {
  doc: 'The approved two-stage launcher, drawn well, climbing above the curve of the Earth with a real flame. Rises on launch. On stageOff the first stage truly separates and falls away, its flame stops, and the second stage lights and keeps climbing.',
  args: 'none',
  stage: 'space',
  anchors: ['nose', 'firstStage', 'secondStage', 'flame', 'earth'],
  motions: { launch: 'engines on and climbing', stageOff: 'the empty first stage drops away and the second stage fires' },
  views: { front: [60, 4], side: [100, 2], low: [40, -12] },
  build(kit, o, P) {
    const THREE = P.THREE;
    kit.renderer.localClippingEnabled = true;
    kit.sunAt([-170, 400, 540]);
    const L = 2.2, seam = 0.04;
    const earth = P.own(kit.planet({ id: `${P.id}.earth`, preset: 'earth', radius: 30, spin: 0.04, spinStart: 118, segments: 160, cloudGain: 1.25, sunset: 0.22 }));
    earth.place([0, -33, 0]);
    kit.parts[`${P.id}.earth`].frameRadius = 5;
    P.anchors.earth = kit.parts[`${P.id}.earth`];
    const lower = P.own(kit.rocket({ id: `${P.id}.lower`, length: L }));
    const upper = P.own(kit.rocket({ id: `${P.id}.upper`, length: L, seed: 5.2 }));
    const keepBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const keepAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const clip = (part, plane) => part.object.traverse((m) => { if (m.material && !m.material.uniforms && m.material.isMeshStandardMaterial) { m.material.clippingPlanes = [plane]; m.material.clipShadows = true; } });
    clip(lower, keepBelow);
    clip(upper, keepAbove);
    upper.throttle(0);
    const secondFlame = kit.flame({ id: `${P.id}.secondFlame`, length: 0.42, radius: 0.036, seed: 7.7, lightPower: 0.035 });
    upper.object.add(secondFlame.object);
    secondFlame.object.position.y = seam;
    secondFlame.throttle(0);
    P.anchor('nose', upper.object, [0, 0.48, 0], 0.5);
    P.anchor('secondStage', upper.object, [0, 0.22, 0], 0.6);
    P.anchor('firstStage', lower.object, [0, -0.24, 0], 0.6);
    P.anchor('flame', lower.object, [0, -0.72, 0], 0.6);
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const setPlane = (part, plane, dir) => {
      part.object.updateWorldMatrix(true, false);
      point.set(0, seam, 0).applyMatrix4(part.object.matrixWorld);
      normal.set(0, dir, 0).transformDirection(part.object.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, point);
    };
    return {
      radius: 1.5,
      follow: upper.object,
      update(m) {
        const lift = m.launch.tau, sep = m.stageOff.tau;
        const climb = 0.07 * lift * lift;
        upper.object.position.y = climb + 0.05 * sep * sep;
        lower.object.position.y = climb - 0.1 * sep * sep - 0.12 * sep;
        lower.object.position.x = 0.05 * sep;
        lower.object.rotation.z = -0.09 * sep;
        lower.throttle(sep > 0 ? 0 : kit.clamp01(lift / 0.8));
        secondFlame.throttle(kit.clamp01((sep - 0.9) / 0.5));
        upper.spin(lift * 0.1);
        lower.spin(lift * 0.1);
        setPlane(lower, keepBelow, -1);
        setPlane(upper, keepAbove, 1);
      },
    };
  },
});

PART('moonPhases', {
  doc: 'Earth with the Moon on its true orbit and sunlight from one side, computed. Includes a small inset of the Moon as seen from Earth. Use for why the Moon has phases. Name which moment shows which phase in args.',
  args: 'phases: {momentId: new|first-quarter|full|last-quarter}, 2 to 4 entries in that order',
  stage: 'space',
  anchors: ['earth', 'moon', 'sunlight'],
  motions: {},
  views: { front: [18, 38], above: [0, 68] },
  build(kit, o, P) {
    const R = 4.2;
    const earth = P.own(kit.planet({ id: `${P.id}.earth`, preset: 'earth', radius: 0.9, spin: 0.6, spinStart: 118, segments: 96, cloudGain: 1.3, sunset: 0.22 }));
    const moon = P.own(kit.planet({ id: `${P.id}.moon`, preset: 'moon', radius: 0.42, spin: 0, segments: 64 }));
    const orbit = kit.astro.moonOrbit({ earth: `${P.id}.earth`, moon: `${P.id}.moon`, radius: R, sunDir: [1, 0.05, 0.12], phases: getKeysOnMoments(P.moments, o.phases, ['new', 'first-quarter', 'full', 'last-quarter']) });
    P.own(kit.orbitPath({ id: `${P.id}.ring`, radius: R, color: '#d6d2c6', opacity: 0.32, width: 1 }));
    const rays = kit.flow({ id: `${P.id}.rays`, along: (u) => [9 - 18 * u, 2.4, 2], count: 18, speed: 0.22, size: 5, color: '#ffe2a8', intensity: 1.8 });
    P.own(rays);
    P.anchor('sunlight', P.root, [6.5, 2.4, 2], 1);
    kit.parts[`${P.id}.earth`].frameRadius = 1.8;
    kit.parts[`${P.id}.moon`].frameRadius = 1.2;
    P.anchors.earth = kit.parts[`${P.id}.earth`];
    P.anchors.moon = kit.parts[`${P.id}.moon`];
    kit.inset({ from: `${P.id}.earth`, look: `${P.id}.moon`, corner: 'tr', size: 0.3, title: 'From Earth' });
    return { radius: 5.4, update(m, t) { orbit.update(t); } };
  },
});

PART('seasons', {
  doc: 'Earth on its yearly path round the Sun with its axis held at the true tilt, computed. Use for why seasons happen.',
  args: 'moments: {momentId: june-solstice|september-equinox|december-solstice|march-equinox}, 2 to 4 entries',
  stage: 'space',
  anchors: ['earth', 'sun'],
  motions: {},
  views: { front: [15, 26], above: [0, 60] },
  build(kit, o, P) {
    P.own(kit.sun({ id: `${P.id}.sun`, radius: 1.1, coronaScale: 4 }));
    P.own(kit.planet({ id: `${P.id}.earth`, preset: 'earth', radius: 0.72, tilt: 0, spin: 1, spinStart: 118, segments: 96, cloudGain: 1.3, sunset: 0.22 }));
    const s = kit.astro.seasons({ earth: `${P.id}.earth`, sun: `${P.id}.sun`, radius: 7, moments: getKeysOnMoments(P.moments, o.moments, ['march-equinox', 'june-solstice', 'september-equinox', 'december-solstice']) });
    P.own(kit.orbitPath({ id: `${P.id}.ring`, radius: 7, color: '#d6d2c6', opacity: 0.3, width: 1 }));
    kit.parts[`${P.id}.earth`].frameRadius = 1.8;
    kit.parts[`${P.id}.sun`].frameRadius = 2;
    P.anchors.earth = kit.parts[`${P.id}.earth`];
    P.anchors.sun = kit.parts[`${P.id}.sun`];
    return { radius: 8.4, update(m, t) { s.update(t); } };
  },
});

PART('eclipse', {
  doc: 'Sun, Moon, and Earth in a line with the true order computed. kind solar: the Moon sits between Sun and Earth, and its dark shadow narrows to a small dark spot on the lit side of Earth. kind lunar: Earth sits between, and the Moon passes into Earth\'s shadow and turns red. The Moon slides into line on align. The order and the shadow cannot be set wrong. It already holds the Sun, the Moon, and the Earth.',
  args: 'kind: solar|lunar',
  stage: 'space',
  anchors: ['sun', 'moon', 'earth', 'shadow'],
  motions: { align: 'the Moon slides into the line over about 4 s' },
  views: { front: [-14, 12], side: [-30, 16], above: [-10, 42], low: [-10, 4] },
  build(kit, o, P) {
    const THREE = P.THREE;
    const solar = (o.kind ?? 'solar') === 'solar';
    const sunX = -8.5, earthX = solar ? 5 : 1.2, moonX = solar ? 1.6 : 5;
    const earthR = 1.2, moonR = solar ? 0.36 : 0.42;
    P.own(kit.sun({ id: `${P.id}.sun`, radius: 2, coronaScale: 3.2, corona: 0.5, rays: 0.3 })).place([sunX, 0, 0]);
    const earth = P.own(kit.planet({ id: `${P.id}.earth`, preset: 'earth', radius: earthR, spin: 0.3, spinStart: 200, segments: 96, cloudGain: 1.3, sunset: 0.22 }));
    earth.place([earthX, 0, 0]);
    const moon = P.own(kit.planet({ id: `${P.id}.moon`, preset: 'moon', radius: moonR, segments: 64 }));
    P.anchors.sun = kit.parts[`${P.id}.sun`]; kit.parts[`${P.id}.sun`].frameRadius = 3.2;
    P.anchors.earth = kit.parts[`${P.id}.earth`]; kit.parts[`${P.id}.earth`].frameRadius = 2;
    P.anchors.moon = kit.parts[`${P.id}.moon`]; kit.parts[`${P.id}.moon`].frameRadius = 1.2;
    const castX = solar ? moonX : earthX, castR = solar ? moonR : earthR;
    const hitX = solar ? earthX - Math.sqrt(earthR * earthR - 0.1) : moonX;
    const hitR = solar ? 0.1 : 0.6;
    const edge = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd9a8').multiplyScalar(1.1), transparent: true, opacity: 0 });
    const edgeGeo = (sign) => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sunX + 0.4, sign * 1.96, 0), new THREE.Vector3(castX, sign * castR, 0), new THREE.Vector3(hitX, sign * hitR, 0)]);
    const shadow = P.group();
    shadow.add(new THREE.Line(edgeGeo(1), edge), new THREE.Line(edgeGeo(-1), edge));
    const coneLen = Math.abs(hitX - castX);
    const coneMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(hitR, castR, coneLen, 32, 1, true), coneMat);
    cone.rotation.z = Math.PI / 2;
    cone.position.x = (castX + hitX) / 2;
    shadow.add(cone);
    const spotCore = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false });
    const spotHalf = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false });
    if (solar) {
      const cap = (theta, mat, r) => { const g = new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, 0, theta); const c = new THREE.Mesh(g, mat); c.rotation.z = Math.PI / 2; c.position.x = earthX; return c; };
      shadow.add(cap(0.14, spotCore, earthR * 1.012), cap(0.42, spotHalf, earthR * 1.008));
    }
    P.anchor('shadow', P.root, solar ? [hitX - 0.02, 0, 0] : [(castX + hitX) / 2, 0, 0], 1.3);
    // The Moon's surface is a shader, so its copper colour in Earth's shadow is a thin shell over it.
    const copper = new THREE.Mesh(new THREE.SphereGeometry(moonR * 1.012, 48, 32), new THREE.MeshBasicMaterial({ color: '#8f3a1a', transparent: true, opacity: 0, depthWrite: false }));
    moon.object.add(copper);
    return {
      radius: 8.5,
      update(m) {
        const u = kit.ease.inOutCubic(m.align.u);
        moon.place([moonX, (1 - u) * 2.6, 0]);
        const k = kit.clamp01((u - 0.78) / 0.22);
        edge.opacity = 0.75 * k;
        coneMat.opacity = 0.55 * k;
        spotCore.opacity = 0.9 * k;
        spotHalf.opacity = 0.42 * k;
        if (!solar) copper.material.opacity = 0.82 * k;
      },
    };
  },
});

PART('orbitBody', {
  doc: 'A satellite on a circular orbit round a planet, drawn as a real satellite with solar panels, with its orbit line. Speed is true: a higher orbit goes slower.',
  args: 'preset: earth|moon|mars|jupiter. height: 0.2 to 2 planet radii above the surface',
  stage: 'space',
  anchors: ['planet', 'satellite', 'path'],
  motions: { go: 'runs the satellite along the orbit' },
  views: { front: [20, 26] },
  build(kit, o, P) {
    kit.sunAt([-200, 240, 520]);
    const planet = P.own(kit.planet({ id: `${P.id}.planet`, preset: o.preset ?? 'earth', radius: 1, spin: 0.4, spinStart: 118, segments: 96, cloudGain: 1.3, sunset: 0.22 }));
    const r = 1 + (o.height ?? 0.6);
    P.own(kit.orbitPath({ id: `${P.id}.ring`, radius: r, color: '#d6d2c6', opacity: 0.45, width: 1 }));
    const THREE = P.THREE;
    const sat = P.group();
    const s = 0.05;
    P.add(new THREE.BoxGeometry(s * 1.2, s * 1.2, s * 1.2), P.mat('metal', '#c7b37b'), sat);
    const panel = P.mat('steel', '#1d3c7c');
    P.add(new THREE.BoxGeometry(s * 3, s * 0.08, s * 1.1), panel, sat, [-s * 2.2, 0, 0]);
    P.add(new THREE.BoxGeometry(s * 3, s * 0.08, s * 1.1), panel, sat, [s * 2.2, 0, 0]);
    P.anchors.planet = kit.parts[`${P.id}.planet`]; kit.parts[`${P.id}.planet`].frameRadius = 1.4;
    P.anchor('satellite', sat, [0, 0, 0], 0.5);
    P.anchor('path', P.root, [r * 0.7, 0, r * 0.7], 0.8);
    const w = 0.8 / Math.pow(r, 1.5);
    return {
      radius: r * 1.25,
      update(m) {
        const a = 0.4 + m.go.tau * w * 1.7;
        sat.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        sat.rotation.y = -a;
      },
    };
  },
});
