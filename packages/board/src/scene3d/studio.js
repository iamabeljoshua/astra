// Studio parts added for the stored 3D scenes: rocket, flame, arrow, instrument panel, themes.
// Lives apart from kit.js so the player owner can take it as one file. kit.js calls addStudio once.
import * as THREE from 'three';

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

const NOISE = /* glsl */ `
float h31(vec3 p){ p=fract(p*vec3(.1031,.11369,.13787)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vn(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fb(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

export function addStudio(kit, x) {
  const { scene, register, basePart, pbrMaterial, fadeMaterial, uT, overlay, W, H, issue } = x;
  const svgNS = 'http://www.w3.org/2000/svg';
  const style = document.createElement('style');
  style.textContent = THEME_CSS;
  overlay.appendChild(style);
  document.documentElement.dataset.theme = kit.theme;
  document.documentElement.dataset.canvas = 'dark';

  const paint = (w, h, draw, srgb = true) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  };

  // The plume is shaped in the vertex shader and streaks scroll down it, so the brightness moves along the flame instead of pulsing the whole frame.
  const FLAME_VS = /* glsl */ `
    uniform float uT,uLen,uRad,uSeed,uWobble; varying float vU; varying float vA; varying vec3 vN; varying vec3 vW;
    ${NOISE}
    void main(){
      float u=clamp(-position.y,0.,1.); float a=atan(position.z,position.x);
      float prof=(.62+.95*smoothstep(0.,.22,u))*pow(1.-u,.72);
      float w=vn(vec3(cos(a)*1.3,sin(a)*1.3,u*3.4-uT*2.6+uSeed))-.5;
      float r=uRad*prof*(1.+uWobble*w*smoothstep(.04,.45,u));
      vec3 p=vec3(cos(a)*r,-u*uLen,sin(a)*r);
      p.xz+=vec2(vn(vec3(u*2.-uT*.9,uSeed,1.))-.5,vn(vec3(u*2.-uT*.8,uSeed,7.))-.5)*uRad*.5*u*u;
      vU=u; vA=a;
      vN=normalize(mat3(modelMatrix)*vec3(cos(a),.28*uRad/uLen,sin(a)));
      vec4 wp=modelMatrix*vec4(p,1.); vW=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`;
  const FLAME_FS = /* glsl */ `
    uniform float uT,uAmount,uFlick,uSeed; uniform vec3 uHot,uMid,uCool; varying float vU; varying float vA; varying vec3 vN; varying vec3 vW;
    ${NOISE}
    void main(){
      vec3 V=normalize(cameraPosition-vW);
      float rim=abs(dot(normalize(vN),V));
      float soft=pow(rim,1.7);
      float n=fb(vec3(cos(vA)*1.8,sin(vA)*1.8,vU*6.5-uT*5.5+uSeed));
      float streak=.66+.68*n;
      float tail=pow(1.-vU,1.25)*smoothstep(0.,.03,vU+.02);
      vec3 c=mix(uCool,uMid,smoothstep(.15,.72,1.-vU));
      c=mix(c,uHot,pow(max(1.-vU*1.55,0.),2.4));
      gl_FragColor=vec4(c*soft*tail*streak*uAmount*uFlick,1.);
    }`;
  const flameLayer = (len, rad, seed, hot, mid, cool, wobble, gain) => {
    const u = {
      uT, uLen: { value: len }, uRad: { value: rad }, uSeed: { value: seed }, uAmount: { value: gain }, uFlick: { value: 1 }, uWobble: { value: wobble },
      uHot: { value: new THREE.Color(hot) }, uMid: { value: new THREE.Color(mid) }, uCool: { value: new THREE.Color(cool) },
    };
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const g = new THREE.CylinderGeometry(1, 1, 1, 40, 40, true).translate(0, -0.5, 0);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return { mesh, u, gain };
  };

  // Global brightness only ever moves below 2 Hz, by a few percent, which keeps it under the 3 flashes a second limit.
  const flickerAt = (t, seed) => 1 + 0.045 * Math.sin(t * 5.3 + seed) + 0.03 * Math.sin(t * 9.7 + seed * 2.1);

  kit.flame = (o = {}) => {
    const len = o.length ?? 1, rad = o.radius ?? 0.12, seed = o.seed ?? 3.1;
    const root = new THREE.Group();
    const hot = o.hot ?? new THREE.Color(1, 0.74, 0.42).multiplyScalar(1.7);
    const mid = o.mid ?? new THREE.Color(1, 0.46, 0.13).multiplyScalar(1.25);
    const cool = o.cool ?? new THREE.Color(1, 0.2, 0.04).multiplyScalar(0.62);
    const outer = flameLayer(len, rad, seed, hot, mid, cool, 0.34, 1);
    const inner = flameLayer(len * 0.56, rad * 0.5, seed + 5, new THREE.Color(1, 0.88, 0.66).multiplyScalar(2.4), new THREE.Color(1, 0.62, 0.26).multiplyScalar(1.3), new THREE.Color(1, 0.36, 0.08).multiplyScalar(0.6), 0.18, 1);
    root.add(outer.mesh, inner.mesh);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(1, 0.66, 0.34) }, uI: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; uniform float uI; varying vec2 vUv; void main(){ float r=length(vUv*2.-1.); float g=pow(max(1.-r,0.),3.)*.16+pow(max(1.-r,0.),14.)*.7; gl_FragColor=vec4(uC*g*uI,1.); }',
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
    glow.scale.setScalar(rad * 2.8);
    glow.position.y = -rad * 0.2;
    root.add(glow);
    const light = new THREE.PointLight(new THREE.Color(1, 0.66, 0.36), 0, len * 2.4, 2);
    light.position.y = -rad * 0.5;
    root.add(light);
    const lightPower = o.lightPower ?? 0.06 * rad * rad / (0.05 * 0.05);
    let amount = 1;
    const part = basePart(root);
    part.radius = rad;
    part.throttle = (v) => {
      amount = v;
      root.visible = v > 0.002;
      outer.u.uAmount.value = v;
      inner.u.uAmount.value = v;
      outer.u.uLen.value = len * (0.28 + 0.72 * v);
      inner.u.uLen.value = len * 0.56 * (0.28 + 0.72 * v);
      return part;
    };
    part.show = part.throttle;
    x.tickers.push((t) => {
      const f = flickerAt(t, seed);
      outer.u.uFlick.value = f;
      inner.u.uFlick.value = f;
      glowMat.uniforms.uI.value = amount * f;
      light.intensity = lightPower * amount * f;
    });
    if (o.at) part.place(o.at);
    return register(o.id, part);
  };

  const ROCKET_PROFILE = (() => {
    const pts = [];
    const add = (r, y) => pts.push(new THREE.Vector2(r, y));
    add(0.0001, 0); add(0.046, 0); add(0.052, 0.008); add(0.0625, 0.03);
    for (const y of [0.06, 0.2, 0.36, 0.5]) add(0.0625, y);
    add(0.0625, 0.522); add(0.052, 0.56);
    for (const y of [0.6, 0.66]) add(0.052, y);
    add(0.052, 0.69); add(0.0585, 0.712);
    add(0.0585, 0.8);
    // Tangent ogive from y 0.8 to the tip, closed by a small round.
    const R = 0.0585, h = 0.2, rho = (R * R + h * h) / (2 * R);
    for (let i = 1; i <= 18; i++) { const k = i / 18; const yy = k * h * 0.985; add(Math.max(Math.sqrt(rho * rho - yy * yy) + R - rho, 0.0009), 0.8 + yy); }
    add(0.0001, 1);
    return pts;
  })();

  const paintRocket = (g, w, h, bump) => {
    const yy = (y) => (1 - y) * h;
    const band = (y0, y1, c) => { g.fillStyle = c; g.fillRect(0, yy(y1), w, yy(y0) - yy(y1)); };
    const block = (u0, u1, y0, y1, c) => { g.fillStyle = c; g.fillRect(u0 * w, yy(y1), (u1 - u0) * w, yy(y0) - yy(y1)); };
    const ink = bump ? '#606060' : '#1c1f25';
    const paper = bump ? '#909090' : '#ece8df';
    band(0, 1, paper);
    if (!bump) {
      band(0, 0.044, '#2a2d33');
      for (const u of [0, 0.5]) { block(u, u + 0.25, 0.1, 0.2, ink); block(u + 0.25, u + 0.5, 0.2, 0.3, ink); block(u, u + 0.25, 0.42, 0.5, ink); }
      band(0.522, 0.56, '#32353b');
      band(0.7, 0.71, '#c9772f');
      band(0.962, 1, ink);
      block(0.46, 0.54, 0.6, 0.655, ink);
      block(0.96, 1, 0.6, 0.655, ink);
      block(0, 0.04, 0.6, 0.655, ink);
    }
    g.strokeStyle = bump ? '#303030' : 'rgba(40,40,44,.28)';
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const px = (i / 16) * w; g.beginPath(); g.moveTo(px, yy(0.522)); g.lineTo(px, yy(0.03)); g.stroke(); }
    for (let i = 0; i < 24; i++) { const y = 0.05 + i * 0.0395; g.beginPath(); g.moveTo(0, yy(y)); g.lineTo(w, yy(y)); g.stroke(); }
    g.lineWidth = 3;
    for (const u of [0.125, 0.625]) { g.beginPath(); g.moveTo(u * w, yy(0.712)); g.lineTo(u * w, yy(0.97)); g.stroke(); }
    const rng = kit.rng(21);
    for (let i = 0; i < 26; i++) {
      const u = rng(), y = 0.06 + rng() * 0.6, ww = 0.006 + rng() * 0.016, hh = 0.004 + rng() * 0.01;
      g.strokeRect(u * w, yy(y + hh), ww * w, hh * h);
    }
    if (!bump) {
      g.fillStyle = 'rgba(20,20,24,.05)';
      for (let i = 0; i < 300; i++) g.fillRect(rng() * w, rng() * h, 2 + rng() * 30, 1 + rng() * 2);
    }
  };

  // A two-stage launcher built along +y with its origin at mid length. Its own flame is attached, so part.throttle(v) is all a scene needs.
  kit.rocket = (o = {}) => {
    const L = o.length ?? 1;
    const root = new THREE.Group();
    const inner = new THREE.Group();
    inner.position.y = -0.5;
    root.add(inner);
    root.scale.setScalar(L);
    const lathe = new THREE.LatheGeometry(ROCKET_PROFILE, 56);
    const uv = lathe.attributes.uv, pos = lathe.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i));
    const map = paint(1024, 2048, (g, w, h) => paintRocket(g, w, h, false));
    const bump = paint(1024, 2048, (g, w, h) => paintRocket(g, w, h, true), false);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.66, 0.66, 0.66), map, bumpMap: bump, bumpScale: 0.6, metalness: 0.02, roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: o.env ?? 1 });
    inner.add(new THREE.Mesh(lathe, bodyMat));

    const finMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#25282e'), metalness: 0.35, roughness: 0.42, clearcoat: 0.2, envMapIntensity: o.env ?? 1 });
    const s = new THREE.Shape();
    s.moveTo(0, 0.2); s.lineTo(0, 0.03); s.lineTo(0.082, -0.022); s.lineTo(0.082, 0.038); s.closePath();
    const finGeo = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 4 }).translate(0.0605, 0, -0.0025);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(finGeo, finMat);
      f.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
      inner.add(f);
    }

    const bellPts = [new THREE.Vector2(0.018, 0.004), new THREE.Vector2(0.024, -0.012), new THREE.Vector2(0.034, -0.032), new THREE.Vector2(0.043, -0.056), new THREE.Vector2(0.048, -0.076)];
    const bellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#a39b8c'), metalness: 0.92, roughness: 0.36, side: THREE.DoubleSide, envMapIntensity: (o.env ?? 1) * 1.2 });
    inner.add(new THREE.Mesh(new THREE.LatheGeometry(bellPts, 32), bellMat));
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24).rotateX(Math.PI / 2).translate(0, -0.02, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.02, 0.02) }));
    inner.add(throat);

    const flame = kit.flame({ length: o.flameLength ?? 0.62, radius: o.flameRadius ?? 0.05, seed: o.seed ?? 3.1, lightPower: o.lightPower ?? 0.045 });
    scene.remove(flame.object);
    flame.object.position.y = -0.074;
    inner.add(flame.object);
    flame.throttle(1);
    scene.add(root);

    const part = basePart(root);
    part.radius = 0.12 * L;
    part.length = L;
    part.throttle = (v) => {
      flame.throttle(v);
      throat.material.color.setRGB(0.02 + 1.4 * v, 0.02 + 0.9 * v, 0.02 + 0.4 * v);
      return part;
    };
    part.aim = (dir) => {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
      root.quaternion.copy(q);
      return part;
    };
    part.spin = (rad) => { inner.rotation.y = rad; return part; };
    part.show = (v) => {
      root.visible = v > 0.001;
      fadeMaterial(bodyMat, v); fadeMaterial(finMat, v); fadeMaterial(bellMat, v);
      return part;
    };
    if (o.at) part.place(o.at);
    if (o.aim) part.aim(o.aim);
    return register(o.id, part);
  };

  // A solid arrow. set(from, to) rebuilds it in place each frame, and its world() is the midpoint so labels and cameras can aim at it.
  kit.arrow = (o = {}) => {
    const c = new THREE.Color(o.color ?? '#ff6a3d');
    const r = o.radius ?? 0.02;
    const headR = r * (o.headWidth ?? 2.7), headL = r * (o.headLength ?? 7);
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: o.glow ?? 0.7, roughness: 0.45, metalness: 0 });
    mat.userData.baseOpacity = 1;
    const shaftG = new THREE.CylinderGeometry(1, 1, 1, 18, 1).translate(0, 0.5, 0);
    const headG = new THREE.ConeGeometry(1, 1, 28, 1).translate(0, 0.5, 0);
    const shaft = new THREE.Mesh(shaftG, mat), head = new THREE.Mesh(headG, mat);
    const root = new THREE.Group();
    root.add(shaft, head);
    scene.add(root);
    const part = basePart(root);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    let len = 0;
    part.set = (from, to) => {
      a.set(from[0], from[1], from[2]); b.set(to[0], to[1], to[2]);
      d.subVectors(b, a); len = d.length();
      if (len < 1e-6) { root.visible = false; return part; }
      d.divideScalar(len);
      root.position.copy(a);
      root.quaternion.setFromUnitVectors(Y, d);
      const hl = Math.min(headL, len * 0.55);
      const hr = headR * (hl / headL);
      const sr = r * Math.min(1, 0.45 + 0.55 * (hl / headL));
      shaft.scale.set(sr, Math.max(len - hl, 1e-5), sr);
      head.position.set(0, len - hl, 0);
      head.scale.set(hr, hl, hr);
      return part;
    };
    part.length = () => len;
    part.world = () => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    part.tip = () => b.clone();
    part.show = (v) => { root.visible = v > 0.001 && len > 1e-6; fadeMaterial(mat, v); return part; };
    part.color = (col) => { mat.color.set(col); mat.emissive.set(col); return part; };
    if (o.from && o.to) part.set(o.from, o.to);
    return register(o.id, part);
  };

  // Instruments live in the overlay, not the world, so they stay upright and sharp. Each corner stacks its own, and labels are laid out around them.
  const huds = [];
  const svgEl = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(svgNS, tag);
    for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const addHud = (el, o, aspect) => {
    overlay.appendChild(el);
    const h = { el, corner: o.corner ?? 'tr', size: o.size ?? 0.27, aspect, k: 0, focus: 0, shown: false, name: o.label ?? o.id ?? 'hud', rect: null, auto: aspect === 0 };
    huds.push(h);
    return h;
  };
  const layoutHud = () => {
    const w = W(), hh = H(), m = Math.max(10, Math.round(hh * 0.02));
    const stacks = { tl: m, tr: m, bl: m, br: m };
    const out = [];
    for (const h of huds) {
      if (h.k < 0.01) { h.el.style.opacity = '0'; h.rect = null; continue; }
      let bw, bh;
      if (h.auto) { bw = h.el.offsetWidth; bh = h.el.offsetHeight; }
      else { bh = Math.round(Math.max(96, h.size * hh) * (1 + 0.16 * h.focus)); bw = Math.round(bh * h.aspect); h.el.style.width = `${bw}px`; h.el.style.height = `${bh}px`; }
      const left = h.corner.includes('l');
      const px = left ? m : w - bw - m;
      const top = h.corner.includes('t');
      const py = top ? stacks[h.corner] : hh - stacks[h.corner] - bh;
      stacks[h.corner] += bh + 6;
      h.el.style.transform = `translate(${px}px,${py}px)`;
      h.el.style.opacity = String(h.k);
      h.rect = { x: px, y: py, w: bw, h: bh, kind: 'hud', name: h.name, op: h.k };
      out.push(h.rect);
    }
    return out;
  };
  kit.__layoutHud = layoutHud;
  kit.__hud = () => huds.filter((h) => h.k > 0.01).map((h) => ({ name: h.name, text: h.read?.() ?? null, op: h.k }));

  kit.gauge = (o = {}) => {
    const min = o.min ?? 0, max = o.max ?? 12, sweep = 240, start = 150;
    const fmt = o.format ?? ((v) => v.toFixed(1));
    const el = document.createElement('div');
    el.className = 'hud';
    const svg = svgEl('svg', { viewBox: '0 0 224 168' }, el);
    const cx = 112, cy = 100, R = 72;
    const ang = (v) => ((start + ((Math.min(Math.max(v, min), max) - min) / (max - min)) * sweep) * Math.PI) / 180;
    const pt = (v, r) => [cx + Math.cos(ang(v)) * r, cy + Math.sin(ang(v)) * r];
    const labelT = svgEl('text', { x: 112, y: 18, 'text-anchor': 'middle', class: 't-label' }, svg);
    labelT.textContent = o.label ?? '';
    const [ax, ay] = pt(min, R), [bx, by] = pt(max, R);
    svgEl('path', { d: `M ${ax} ${ay} A ${R} ${R} 0 1 1 ${bx} ${by}`, class: 's-arc' }, svg);
    const fill = svgEl('path', { d: '', class: 's-fill' }, svg);
    const ticks = o.ticks ?? [min, (min + max) / 2, max];
    const minor = o.minor ?? 0;
    if (minor) for (let v = min; v <= max + 1e-6; v += minor) { const [x1, y1] = pt(v, R - 4), [x2, y2] = pt(v, R); svgEl('line', { x1, y1, x2, y2, class: 's-minor' }, svg); }
    for (const v of ticks) {
      const [x1, y1] = pt(v, R - 8), [x2, y2] = pt(v, R);
      svgEl('line', { x1, y1, x2, y2, class: 's-tick' }, svg);
      const [tx, ty] = pt(v, R - 19);
      const tt = svgEl('text', { x: tx, y: ty + 4, 'text-anchor': 'middle', class: 't-tick' }, svg);
      tt.textContent = String(v);
    }
    const markEls = [];
    for (const mk of o.marks ?? []) {
      const [x1, y1] = pt(mk.at, R - 3), [x2, y2] = pt(mk.at, R + 8);
      const ln = svgEl('line', { x1, y1, x2, y2, class: 's-mark' }, svg);
      const [tx, ty] = pt(mk.at, R + 11);
      const tt = svgEl('text', { x: tx, y: ty + 4, 'text-anchor': mk.anchor ?? 'start', class: 't-mark' }, svg);
      tt.textContent = mk.text ?? '';
      markEls.push({ ln, tt, mk });
    }
    const needle = svgEl('line', { x1: cx, y1: cy, x2: cx, y2: cy, class: 's-needle' }, svg);
    svgEl('circle', { cx, cy, r: 4.5, class: 's-hub' }, svg);
    const big = svgEl('text', { x: 112, y: 142, 'text-anchor': 'middle', class: 't-big' }, svg);
    const unit = svgEl('text', { x: 112, y: 159, 'text-anchor': 'middle', class: 't-unit' }, svg);
    unit.textContent = o.unit ?? '';
    const h = addHud(el, { ...o, label: o.label ?? 'gauge' }, 224 / 168);
    let value = min;
    const part = {
      id: o.id,
      set(v) {
        value = v;
        const [nx, ny] = pt(v, R - 10);
        needle.setAttribute('x2', nx.toFixed(2)); needle.setAttribute('y2', ny.toFixed(2));
        const txt = fmt(v);
        if (big.textContent !== txt) big.textContent = txt;
        if (o.fill) { const [sx, sy] = pt(min, R); const [ex, ey] = pt(v, R); const large = ang(v) - ang(min) > Math.PI ? 1 : 0; fill.setAttribute('d', `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`); }
        return part;
      },
      value: () => value,
      text: () => big.textContent,
      unit(text) { if (unit.textContent !== text) unit.textContent = text; return part; },
      show(k) { h.k = k; return part; },
      focus(k) { h.focus = k; return part; },
      mark(i, k) { const e = markEls[i]; if (e) { e.tt.style.opacity = String(k); e.ln.style.opacity = String(0.35 + 0.65 * k); } return part; },
    };
    h.read = () => `${big.textContent} ${unit.textContent}`.trim();
    part.set(o.value ?? min);
    part.mark(0, o.marks?.[0]?.visible === false ? 0 : 1);
    return part;
  };

  kit.clock = (o = {}) => {
    const el = document.createElement('div');
    el.className = 'hud';
    const svg = svgEl('svg', { viewBox: '0 0 160 176' }, el);
    const labelT = svgEl('text', { x: 80, y: 18, 'text-anchor': 'middle', class: 't-label' }, svg);
    labelT.textContent = o.label ?? '';
    const cx = 80, cy = 88, R = 56;
    svgEl('circle', { cx, cy, r: R, class: 's-arc' }, svg);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const major = i % 3 === 0;
      svgEl('line', { x1: cx + Math.sin(a) * (R - (major ? 9 : 5)), y1: cy - Math.cos(a) * (R - (major ? 9 : 5)), x2: cx + Math.sin(a) * R, y2: cy - Math.cos(a) * R, class: major ? 's-tick' : 's-minor' }, svg);
    }
    const hand = svgEl('line', { x1: cx, y1: cy, x2: cx, y2: cy - R + 12, class: 's-needle' }, svg);
    svgEl('circle', { cx, cy, r: 4, class: 's-hub' }, svg);
    const sub = svgEl('text', { x: 80, y: 165, 'text-anchor': 'middle', class: 't-sub' }, svg);
    sub.textContent = o.sub ?? '';
    const h = addHud(el, { ...o, label: o.label ?? 'clock', size: o.size ?? 0.26 }, 160 / 176);
    h.read = () => `${o.label ?? ''} ${sub.textContent}`.trim();
    let turns = 0;
    const part = {
      id: o.id,
      turns(v) { turns = v; const a = (v % 1) * 360; hand.setAttribute('transform', `rotate(${a.toFixed(2)} ${cx} ${cy})`); return part; },
      value: () => turns,
      sub(text) { if (sub.textContent !== text) sub.textContent = text; return part; },
      show(k) { h.k = k; return part; },
      focus(k) { h.focus = k; return part; },
    };
    return part;
  };

  kit.readout = (o = {}) => {
    const el = document.createElement('div');
    el.className = 'hud hud-read';
    const k = document.createElement('div'); k.className = 'k'; k.textContent = o.label ?? ''; el.appendChild(k);
    const v = document.createElement('div'); v.className = 'v'; v.textContent = o.value ?? ''; el.appendChild(v);
    const h = addHud(el, { ...o, label: o.label ?? 'readout' }, 0);
    h.read = () => `${o.label ?? ''} ${v.textContent}`.trim();
    const part = {
      id: o.id,
      set(text) { if (v.textContent !== text) v.textContent = text; return part; },
      text: () => v.textContent,
      show(n) { h.k = n; return part; },
    };
    return part;
  };

  void issue;
  void pbrMaterial;
  return kit;
}
