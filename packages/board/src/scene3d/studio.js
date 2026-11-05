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

  // Paints one half of a planet: a thin hemisphere shell on the part's spinner, centred on its local dir, so it turns with the body.
  kit.paintCap = (o = {}) => {
    const host = typeof o.on === 'string' ? x.parts[o.on] : o.on;
    if (!host?.spinner) { issue(`paintCap: unknown planet ${o.on}`); return null; }
    const r = (host.radius ?? 1) * 1.004;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(o.color ?? '#c8321e') }, uSun: kit.uSun, uO: { value: o.opacity ?? 0.72 } }, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      // Same hard terminator as the airless planet shader under it, so the paint falls into night with the body.
      fragmentShader: 'uniform vec3 uC,uSun; uniform float uO; varying vec3 vN; varying vec3 vW; void main(){ vec3 L=normalize(uSun-vW); float d=dot(normalize(vN),L); float w=smoothstep(-.012,.05,d); float l=max(d,0.)*.82+.18*w; gl_FragColor=vec4(uC*l*1.5*w,uO*(.25+.75*w)); }',
    });
    const geo = new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    const d = o.dir ?? [1, 0, 0];
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]).normalize());
    host.spinner.add(m);
    const part = basePart(m);
    part.show = (v) => { m.visible = v > 0.001; mat.uniforms.uO.value = (o.opacity ?? 0.72) * v; return part; };
    part.faceWorld = () => { m.updateWorldMatrix(true, false); return new THREE.Vector3(0, 1, 0).transformDirection(m.matrixWorld); };
    return register(o.id, part);
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

  // A small live graph in the overlay. Each curve is a pure function of x, drawn up to where the scene says, with a dot at the current point.
  kit.plot = (o = {}) => {
    const el = document.createElement('div');
    el.className = 'hud';
    const svg = svgEl('svg', { viewBox: '0 0 240 170' }, el);
    const L = 34, R = 228, T = 24, B = 140;
    const xMax = o.xMax ?? 1, yMax = o.yMax ?? 1;
    const px = (v) => L + (Math.min(Math.max(v, 0), xMax) / xMax) * (R - L), py = (v) => B - (Math.min(Math.max(v, 0), yMax) / yMax) * (B - T);
    const title = svgEl('text', { x: 120, y: 15, 'text-anchor': 'middle', class: 't-label' }, svg);
    title.textContent = o.label ?? '';
    svgEl('line', { x1: L, y1: T, x2: L, y2: B, class: 's-tick' }, svg);
    svgEl('line', { x1: L, y1: B, x2: R, y2: B, class: 's-tick' }, svg);
    for (const tv of o.yTicks ?? []) { const t = svgEl('text', { x: L - 5, y: py(tv) + 4, 'text-anchor': 'end', class: 't-tick' }, svg); t.textContent = String(tv); }
    const xl = svgEl('text', { x: (L + R) / 2, y: 160, 'text-anchor': 'middle', class: 't-unit' }, svg);
    xl.textContent = o.xLabel ?? '';
    const curves = (o.curves ?? []).map((c) => {
      const n = c.points ?? 90, pts = [];
      const x0 = c.xStart ?? 0, x1 = c.xEnd ?? xMax;
      for (let i = 0; i < n; i++) { const x = x0 + (i / (n - 1)) * (x1 - x0); pts.push([px(x), py(c.fn(x))]); }
      const line = svgEl('polyline', { fill: 'none', stroke: c.color ?? 'var(--hud-accent)', 'stroke-width': c.width ?? 2.4, points: '' }, svg);
      const dot = svgEl('circle', { r: 4, fill: c.color ?? 'var(--hud-accent)', opacity: 0 }, svg);
      return { c, pts, line, dot };
    });
    const h = addHud(el, { ...o, label: o.label ?? 'plot', size: o.size ?? 0.34 }, 240 / 170);
    h.read = () => o.label ?? '';
    const part = {
      id: o.id,
      reveal(i, k) { const e = curves[i]; if (!e) return part; const m = Math.max(2, Math.ceil(e.pts.length * Math.min(k, 1))); e.line.setAttribute('points', e.pts.slice(0, m).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')); e.line.style.opacity = k > 0.001 ? '1' : '0'; return part; },
      dot(i, x, y, k = 1) { const e = curves[i]; if (e) { e.dot.setAttribute('cx', px(x).toFixed(1)); e.dot.setAttribute('cy', py(y).toFixed(1)); e.dot.setAttribute('opacity', String(k)); } return part; },
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

  const paletteFor = () => (kit.theme === 'light'
    ? { zenith: '#5f95d2', horizon: '#ece4d2', sunGlow: '#fff2d8', sun: '#fff4e2', sunPower: 3.1, hemiTop: '#bcd4ee', hemiBot: '#b8a888', hemi: 1.15, fog: '#ece4d2', exposure: 1 }
    : { zenith: '#16264e', horizon: '#bb8468', sunGlow: '#ffb67a', sun: '#ffd2a0', sunPower: 2.7, hemiTop: '#44597f', hemiBot: '#3a2d26', hemi: 0.75, fog: '#bb8468', exposure: 1 });

  // Soft sun shadows for standard materials. Tight bounds keep the one extra pass cheap and the edges sharp enough to read.
  const enableShadows = (light, o = {}) => {
    x.renderer.shadowMap.enabled = true;
    x.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const size = o.size ?? 20, at = o.at ?? [0, 0, 0];
    light.castShadow = true;
    light.shadow.mapSize.set(o.map ?? 2048, o.map ?? 2048);
    const c = light.shadow.camera;
    c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 0.5; c.far = (o.far ?? size * 8);
    light.shadow.bias = o.bias ?? -0.0004;
    light.shadow.normalBias = o.normalBias ?? 0.02;
    light.shadow.radius = o.softness ?? 4;
    light.target.position.set(at[0], at[1], at[2]);
    scene.add(light.target);
    let done = false;
    x.tickers.push(() => {
      if (done) return;
      done = true;
      scene.traverse((m) => {
        if (!m.isMesh || !m.material || m.userData.noShadow) return;
        if (m.material.isMeshStandardMaterial) { m.castShadow = !m.material.transparent; m.receiveShadow = true; }
      });
    });
  };
  kit.shadows = (o = {}) => {
    let lit = null;
    scene.traverse((m) => { if (m.isDirectionalLight && !lit) lit = m; });
    if (lit) enableShadows(lit, o);
    return kit;
  };

  const GROUNDS = {
    sand: { a: '#cfae80', b: '#a98659', scale: 0.11, detail: 3.2, ripple: 0.5 },
    grass: { a: '#4f8a3c', b: '#3a7030', scale: 0.32, detail: 7, stripes: 11 },
    dirt: { a: '#a58f6d', b: '#7f6c50', scale: 0.2, detail: 4 },
  };
  // A sky, a sun, a ground that fades into haze, and real shadows. Day in the light theme, dusk in the dark one.
  kit.outdoor = (o = {}) => {
    const pal = { ...paletteFor(), ...(o.palette ?? {}) };
    document.documentElement.dataset.canvas = kit.theme === 'light' ? 'light' : 'dark';
    if (kit.theme === 'light' && o.ground !== 'grass') kit.lightCanvas = true;
    const sunDir = new THREE.Vector3(...(o.sun ?? [-40, 34, 50])).normalize();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: { uZ: { value: new THREE.Color(pal.zenith) }, uH: { value: new THREE.Color(pal.horizon) }, uG: { value: new THREE.Color(pal.sunGlow) }, uS: { value: sunDir } },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uZ,uH,uG,uS; varying vec3 vP; void main(){ vec3 d=normalize(vP); float h=clamp(d.y,0.,1.); vec3 c=mix(uH,uZ,pow(h,.42)); float s=max(dot(d,uS),0.); c+=uG*(pow(s,8.)*.22+pow(s,120.)*.9); if(d.y<0.) c=uH; gl_FragColor=vec4(c,1.); }',
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skyMat);
    dome.scale.setScalar(5e4); dome.renderOrder = -10;
    x.sky.add(dome);
    x.buildEnv(o.env ?? 0.6);
    scene.environmentIntensity = o.envIntensity ?? 0.55;
    scene.background = new THREE.Color(pal.horizon);
    scene.fog = new THREE.Fog(new THREE.Color(pal.fog), o.fogNear ?? 90, o.fogFar ?? 420);
    const hemi = new THREE.HemisphereLight(new THREE.Color(pal.hemiTop), new THREE.Color(pal.hemiBot), pal.hemi);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(new THREE.Color(pal.sun), o.sunPower ?? pal.sunPower);
    sun.position.copy(sunDir).multiplyScalar(o.sunFar ?? 120);
    scene.add(sun);
    kit.sunLight = sun;
    enableShadows(sun, o.shadow ?? { size: 26, far: 280 });
    const g = typeof o.ground === 'string' && GROUNDS[o.ground] ? GROUNDS[o.ground] : { ...GROUNDS.sand, ...(o.ground ?? {}) };
    const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.35 });
    const uA = { value: new THREE.Color(g.a) }, uB = { value: new THREE.Color(g.b) };
    gm.onBeforeCompile = (s) => {
      s.uniforms.uA = uA; s.uniforms.uB = uB;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vG;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvG=position;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vG; uniform vec3 uA,uB; ${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          { vec2 p=vG.xz; float big=fb(vec3(p*${(g.scale * 0.35).toFixed(4)},1.)); float mid=fb(vec3(p*${g.scale.toFixed(4)},4.)); float fine=fb(vec3(p*${g.detail.toFixed(3)},9.));
            float k=clamp(big*.9+mid*.5+fine*.35-.3,0.,1.);
            ${g.ripple ? `k+=.035*sin((p.x*.8+p.y*.5)*${(g.ripple * 8).toFixed(2)}+big*9.);` : ''}
            ${g.stripes ? `k+=.14*step(.5,fract(p.x/${(g.stripes * 0.5).toFixed(2)}));` : ''}
            diffuseColor.rgb=mix(uB,uA,clamp(k,0.,1.)); }`);
    };
    const ground = new THREE.Mesh(new THREE.CircleGeometry(o.groundSize ?? 900, 96).rotateX(-Math.PI / 2), gm);
    ground.position.y = o.groundY ?? 0;
    ground.userData.isGround = true;
    scene.add(ground);
    ground.receiveShadow = true;
    x.tickers.push(() => { ground.castShadow = false; });
    kit.groundMesh = ground;
    x.grade.uniforms.uExposure.value = pal.exposure;
    x.grade.uniforms.uVignette.value = 0.22;
    return kit;
  };

  // A soft faceless mannequin, built once and shared, so a wall of players costs one sculpt.
  const POSES = {
    stand: { lean: 0, armL: [0.34, 0.92, 0.04], armR: [-0.34, 0.92, 0.04], handL: [0.36, 0.68, 0.06], handR: [-0.36, 0.68, 0.06], footL: [0.12, 0, 0.02], footR: [-0.12, 0, 0.02], kneeL: [0.11, 0.48, 0.03], kneeR: [-0.11, 0.48, 0.03] },
    wall: { lean: 0, armL: [0.26, 0.86, 0.14], armR: [-0.26, 0.86, 0.14], handL: [0.06, 0.62, 0.17], handR: [-0.06, 0.62, 0.17], footL: [0.1, 0, 0.02], footR: [-0.1, 0, 0.02], kneeL: [0.1, 0.48, 0.05], kneeR: [-0.1, 0.48, 0.05] },
    shoot: { lean: 0.03, armL: [0.2, 1.16, 0.14], armR: [-0.12, 1.2, 0.2], handL: [0.1, 1.32, 0.24], handR: [-0.05, 1.42, 0.24], footL: [0.1, 0.1, 0.0], footR: [-0.1, 0.1, 0.0], kneeL: [0.1, 0.46, 0.08], kneeR: [-0.1, 0.46, 0.08] },
    kick: { lean: -0.08, armL: [0.36, 0.9, -0.1], armR: [-0.3, 0.86, 0.2], handL: [0.46, 0.74, -0.18], handR: [-0.34, 0.68, 0.3], footL: [0.1, 0, -0.1], footR: [-0.1, 0.16, 0.42], kneeL: [0.1, 0.46, -0.03], kneeR: [-0.1, 0.46, 0.26] },
  };
  kit.figure = (o = {}) => {
    const P = POSES[o.pose ?? 'stand'] ?? POSES.stand;
    const shirt = o.shirt ?? '#d8d2c6', shorts = o.shorts ?? '#23262c', skin = o.skin ?? '#8d6a52', sock = o.sock ?? '#e6e0d4';
    const h = o.height ?? 1.85, L = P.lean;
    const hip = [0, 0.55, L * 0.5], chest = [0, 0.84, L * 1.5], neck = [0, 0.99, L * 2], head = [0, 1.08, L * 2.4];
    const sh = (a) => a.map((v) => v);
    const blobs = [
      { p: hip, to: chest, r: 0.115, r2: 0.135, color: shirt },
      { p: [0.12, 0.92, L * 1.7], to: [-0.12, 0.92, L * 1.7], r: 0.07, color: shirt },
      { p: hip, to: [0, 0.5, L * 0.4], r: 0.115, color: shorts },
      { p: neck, to: head, r: 0.05, r2: 0.076, color: skin },
      { p: [0.17, 0.93, L * 1.7], to: sh(P.armL), r: 0.04, r2: 0.034, color: shirt },
      { p: sh(P.armL), to: sh(P.handL), r: 0.032, r2: 0.03, color: skin },
      { p: [-0.17, 0.93, L * 1.7], to: sh(P.armR), r: 0.04, r2: 0.034, color: shirt },
      { p: sh(P.armR), to: sh(P.handR), r: 0.032, r2: 0.03, color: skin },
      { p: [0.08, 0.52, L * 0.4], to: sh(P.kneeL), r: 0.06, r2: 0.045, color: shorts },
      { p: sh(P.kneeL), to: sh(P.footL), r: 0.043, r2: 0.03, color: sock },
      { p: [-0.08, 0.52, L * 0.4], to: sh(P.kneeR), r: 0.06, r2: 0.045, color: shorts },
      { p: sh(P.kneeR), to: sh(P.footR), r: 0.043, r2: 0.03, color: sock },
      { p: sh(P.footL), to: [P.footL[0], P.footL[1] + 0.004, P.footL[2] + 0.09], r: 0.032, color: '#1c1c20' },
      { p: sh(P.footR), to: [P.footR[0], P.footR[1] + 0.004, P.footR[2] + 0.09], r: 0.032, color: '#1c1c20' },
    ];
    const part = kit.organic({ id: o.id, blobs, smooth: 0.035, res: o.res ?? 76, material: 'matte', roughness: 0.72, detail: { scale: 40, amount: 0.04 } });
    part.object.scale.setScalar(h / 1.16);
    if (o.at) part.place(o.at);
    if (o.face !== undefined) part.object.rotation.y = o.face;
    part.height = h;
    // Copies share the sculpt, so a wall of players adds draw calls and no build time.
    part.copy = (c = {}) => {
      const m = part.object.clone();
      scene.add(m);
      const q = basePart(m);
      q.show = (v) => { m.visible = v > 0.001; return q; };
      if (c.at) q.place(c.at);
      if (c.face !== undefined) m.rotation.y = c.face;
      return register(c.id, q);
    };
    return part;
  };

  const texturedFloor = (o, draw, W2, H2) => {
    const map = paint(o.tex ?? 2048, Math.round(((o.tex ?? 2048) * H2) / W2), draw);
    map.wrapS = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: o.roughness ?? 0.38, metalness: 0, envMapIntensity: o.env ?? 0.8 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W2, H2).rotateX(-Math.PI / 2), mat);
    scene.add(m);
    m.receiveShadow = true;
    m.userData.noShadow = true;
    m.receiveShadow = true;
    if (o.at) m.position.set(...o.at);
    const part = basePart(m);
    part.show = (v) => { m.visible = v > 0.001; return part; };
    return register(o.id, part);
  };
  // A hardwood court, 28 m by 15 m, centred on the origin with the basket line at +x. Real markings at real sizes. A plain arena floor runs out from it so it never floats in the dark.
  kit.court = (o = {}) => {
    const outer = new THREE.Mesh(new THREE.CircleGeometry(120, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(kit.theme === 'light' ? '#cdbfa8' : '#0a0908'), roughness: 1, envMapIntensity: 0 }));
    outer.position.set(0, -0.01, 0);
    outer.userData.noShadow = true;
    outer.receiveShadow = true;
    scene.add(outer);
    return makeCourt(o);
  };
  const makeCourt = (o = {}) => texturedFloor({ id: o.id ?? 'court', roughness: 0.6, env: 0.32, ...o }, (g, w, h) => {
    const sx = w / 34, sz = h / 22, ox = w / 2, oz = h / 2;
    const rng = kit.rng(5);
    for (let i = 0; i < 90; i++) { for (let j = 0; j < 14; j++) {
      const t = 150 + rng() * 34; g.fillStyle = `rgb(${t + 58},${t + 8},${t - 52})`;
      g.fillRect((j / 14) * w, (i / 90) * h, w / 14 + 1, h / 90 + 1);
    } }
    g.strokeStyle = 'rgba(70,40,20,.22)'; g.lineWidth = 1;
    for (let i = 0; i < 90; i++) { g.beginPath(); g.moveTo(0, (i / 90) * h); g.lineTo(w, (i / 90) * h); g.stroke(); }
    const X = (v) => ox + v * sx, Z = (v) => oz + v * sz;
    g.strokeStyle = '#f6f1e6'; g.lineWidth = sx * 0.05;
    g.strokeRect(X(-14), Z(-7.5), 28 * sx, 15 * sz);
    g.beginPath(); g.moveTo(X(0), Z(-7.5)); g.lineTo(X(0), Z(7.5)); g.stroke();
    g.beginPath(); g.ellipse(X(0), Z(0), 1.8 * sx, 1.8 * sz, 0, 0, Math.PI * 2); g.stroke();
    const hoopX = 14 - 1.575;
    g.fillStyle = 'rgba(160,70,40,.34)'; g.fillRect(X(14 - 5.8), Z(-2.45), 5.8 * sx, 4.9 * sz);
    g.strokeRect(X(14 - 5.8), Z(-2.45), 5.8 * sx, 4.9 * sz);
    g.beginPath(); g.ellipse(X(14 - 5.8), Z(0), 1.8 * sx, 1.8 * sz, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.beginPath(); g.ellipse(X(hoopX), Z(0), 6.75 * sx, 6.75 * sz, 0, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
  }, 34, 22);

  // The inside of a star: a slow sea of plasma on the inside of a sphere around the camera's world, kept below the bloom threshold so subjects stay readable.
  kit.plasma = (o = {}) => {
    const u = { uT, uA: { value: new THREE.Color(o.a ?? '#c8460f') }, uB: { value: new THREE.Color(o.b ?? '#ffb257') }, uP: { value: o.power ?? 0.85 }, uO: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uT,uP,uO; uniform vec3 uA,uB; varying vec3 vP; ${NOISE} void main(){ vec3 d=normalize(vP); float n=fb(d*2.6+vec3(uT*.05,-uT*.035,uT*.03)); float g=fb(d*7.+vec3(n*3.,uT*.08,-uT*.05)); float k=clamp(n*.9+g*.55-.18,0.,1.); gl_FragColor=vec4(mix(uA,uB,k)*uP*(.55+.75*k),uO); }`,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 120, 48, 32), m);
    s.renderOrder = -5; s.frustumCulled = false;
    scene.add(s);
    const part = basePart(s);
    part.show = (v) => { s.visible = v > 0.001; u.uO.value = v; return part; };
    return register(o.id, part);
  };

  // Hot gas with soft edges and slow moving texture. It can be clipped to a cylinder, so a flame fills an engine's bore instead of poking through its walls.
  kit.fireball = (o = {}) => {
    const u = {
      uT, uHot: { value: new THREE.Color(o.hot ?? '#fff0c4').multiplyScalar(o.power ?? 1.9) }, uMid: { value: new THREE.Color(o.mid ?? '#ff9a2e').multiplyScalar(o.power ?? 1.9) }, uCool: { value: new THREE.Color(o.cool ?? '#a8320c').multiplyScalar(o.power ?? 1.9) },
      uHeat: { value: 1 }, uO: { value: 1 }, uFill: { value: o.fill ? 1 : 0 }, uR: { value: 1e6 }, uY0: { value: -1e6 }, uY1: { value: 1e6 }, uC: { value: new THREE.Vector2() }, uScale: { value: o.noiseScale ?? 40 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vL=position; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT,uHeat,uO,uFill,uR,uY0,uY1,uScale; uniform vec2 uC; uniform vec3 uHot,uMid,uCool; varying vec3 vN; varying vec3 vW; varying vec3 vL; ${NOISE}
        void main(){ if(length(vW.xz-uC)>uR||vW.y<uY0||vW.y>uY1) discard;
          vec3 V=normalize(cameraPosition-vW); float r=abs(dot(normalize(vN),V)); float n=fb(vW*uScale+vec3(0.,-uT*.5,uT*.22)); float a=mix(pow(r,1.1),.72,uFill);
          float k=clamp(a*.75+(n-.35)*.9,0.,1.)*uHeat; vec3 c=mix(uCool,uMid,smoothstep(.1,.55,k)); c=mix(c,uHot,smoothstep(.55,.95,k)); gl_FragColor=vec4(c*(.3+.7*a)*(.55+.9*n)*uO,1.); }`,
    });
    const g = o.geometry ?? new THREE.SphereGeometry(1, 40, 28);
    const s = new THREE.Mesh(g, m);
    s.frustumCulled = false;
    scene.add(s);
    const part = basePart(s);
    part.clip = (r, y0, y1, cx = 0, cz = 0) => { u.uR.value = r; u.uY0.value = y0; u.uY1.value = y1; u.uC.value.set(cx, cz); return part; };
    part.heat = (k) => { u.uHeat.value = k; return part; };
    part.show = (v) => { s.visible = v > 0.001; u.uO.value = v; return part; };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  };

  // An expanding shell of glowing gas, brightest at its limb and torn into filaments, the way a supernova remnant looks.
  kit.nebula = (o = {}) => {
    const u = { uT, uA: { value: new THREE.Color(o.a ?? '#ff6a3a') }, uB: { value: new THREE.Color(o.b ?? '#6fd0d8') }, uI: { value: 1 }, uSeed: { value: o.seed ?? 2.3 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vL=normalize(position); vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT,uI,uSeed; uniform vec3 uA,uB; varying vec3 vN; varying vec3 vW; varying vec3 vL; ${NOISE} void main(){ vec3 V=normalize(cameraPosition-vW); float r=1.-abs(dot(normalize(vN),V)); float f=fb(vL*3.4+uSeed+vec3(uT*.02)); float f2=fb(vL*9.+f*4.+uSeed); float fil=smoothstep(.34,.7,f*.75+f2*.5); vec3 c=mix(uB,uA,clamp(pow(r,1.2)+.25*(f2-.5),0.,1.)); gl_FragColor=vec4(c*(pow(r,1.5)*1.25+.08)*(.25+1.25*fil)*uI,1.); }`,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 44), m);
    s.frustumCulled = false;
    scene.add(s);
    const part = basePart(s);
    part.radius = 1;
    part.expand = (r) => { s.scale.setScalar(Math.max(r, 0.001)); part.radius = r; return part; };
    part.show = (v) => { s.visible = v > 0.001; u.uI.value = v * (o.intensity ?? 1); return part; };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  };

  // A classic ball: dark patches at the twelve corners of an icosahedron, so its spin can be read.
  kit.football = (o = {}) => {
    const r = o.radius ?? 0.11;
    const ph = (1 + Math.sqrt(5)) / 2;
    const raw = [[0, 1, ph], [0, 1, -ph], [0, -1, ph], [0, -1, -ph], [1, ph, 0], [1, -ph, 0], [-1, ph, 0], [-1, -ph, 0], [ph, 0, 1], [ph, 0, -1], [-ph, 0, 1], [-ph, 0, -1]];
    const verts = raw.map((v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; });
    const map = paint(1024, 512, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
        const lon = (xx / w) * Math.PI * 2, lat = (y / h) * Math.PI;
        const d = [-Math.cos(lon) * Math.sin(lat), Math.cos(lat), Math.sin(lon) * Math.sin(lat)];
        let best = 0, second = 0;
        for (const v of verts) { const c = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]; if (c > best) { second = best; best = c; } else if (c > second) second = c; }
        const ang = Math.acos(Math.min(best, 1));
        const seam = Math.abs(best - second) < 0.006;
        const i = (y * w + xx) * 4;
        const v = ang < 0.27 ? 28 : seam ? 150 : 232;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.97; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    });
    const part = kit.mesh({ id: o.id, geometry: new THREE.SphereGeometry(r, 48, 32), material: 'plastic', color: '#ffffff', at: o.at });
    part.material.map = map;
    part.material.needsUpdate = true;
    part.radius = r;
    return part;
  };

  // A basket at x, facing -x: rim at 3.05 m, backboard, post and a net that swishes when told to.
  kit.hoop = (o = {}) => {
    const root = new THREE.Group();
    const rimR = 0.2286, rimH = o.rimHeight ?? 3.05;
    const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9572a'), metalness: 0.6, roughness: 0.35 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.012, 12, 48).rotateX(Math.PI / 2), rimMat);
    rim.position.set(0, rimH, 0);
    root.add(rim);
    const boardMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f4f3ee'), roughness: 0.3, transparent: true, opacity: 0.5, envMapIntensity: 0.7, depthWrite: false });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.05, 1.8), boardMat);
    board.position.set(rimR + 0.15, rimH + 0.3, 0);
    root.add(board);
    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2c31'), metalness: 0.4, roughness: 0.5 });
    const square = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.59), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a2c31'), wireframe: true }));
    square.position.set(rimR + 0.15, rimH + 0.27, 0);
    root.add(square);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), frameMat);
    arm.position.set(rimR + 0.6, rimH + 0.25, 0);
    root.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, rimH + 0.3, 16), frameMat);
    post.position.set(rimR + 1.05, (rimH + 0.3) / 2, 0);
    root.add(post);
    const netU = { uSwish: { value: 0 }, uC: { value: new THREE.Color(kit.theme === 'light' ? '#6d6558' : '#e8e4da') } };
    const netMat = new THREE.ShaderMaterial({
      uniforms: netU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'uniform float uSwish; varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; float k=1.-uv.y; p.xz*=1.+uSwish*.32*sin(3.14*k); p.y-=uSwish*.05*k; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }',
      fragmentShader: 'uniform vec3 uC; varying vec2 vUv; void main(){ float a=abs(fract(vUv.x*24.+vUv.y*5.)-.5); float b=abs(fract(vUv.x*24.-vUv.y*5.)-.5); float m=smoothstep(.1,.02,min(a,b)); if(m<.05) discard; gl_FragColor=vec4(uC,m*.9); }',
    });
    const net = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.62, 0.42, 32, 6, true), netMat);
    net.position.set(0, rimH - 0.21, 0);
    root.add(net);
    scene.add(root);
    if (o.at) root.position.set(o.at[0], o.at[1] ?? 0, o.at[2] ?? 0);
    const part = basePart(root);
    part.radius = rimR;
    part.swish = (v) => { netU.uSwish.value = v; return part; };
    part.rimHeight = rimH;
    part.show = (v) => { root.visible = v > 0.001; return part; };
    return register(o.id, part);
  };

  void issue;
  void pbrMaterial;
  return kit;
}
