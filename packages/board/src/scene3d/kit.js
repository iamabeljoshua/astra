import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { addStudio } from './studio.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export const ease = {
  linear: (x) => x,
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outBack: (x) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p){ p=fract(p*vec3(.1031,.11369,.13787)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uT: { value: 0 }, uZoom: { value: 0 }, uExposure: { value: 1 }, uFade: { value: 1 },
    uVignette: { value: 0.32 }, uGrain: { value: 0.022 }, uAspect: { value: 1 }, uLensPos: { value: new THREE.Vector2(0.5, 0.5) },
    uLensR: { value: 0 }, uLensShadow: { value: 0 }, uAberration: { value: 0.0012 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    uniform float uT,uZoom,uExposure,uFade,uVignette,uGrain,uAspect,uLensR,uLensShadow,uAberration; uniform vec2 uLensPos;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uT*43.0)*43758.5453); }
    vec3 fetch(vec2 uv){
      vec2 c=uv-.5; float r2=dot(c,c);
      vec2 d=c*r2*uAberration*2.;
      return vec3(texture2D(tDiffuse,uv+d).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-d).b);
    }
    void main(){
      vec2 uv=vUv; float shadow=0.;
      if(uLensR>0.0005){
        vec2 d=(uv-uLensPos)*vec2(uAspect,1.); float r=max(length(d),1e-4);
        vec2 dir=d/r; float bend=uLensR*uLensR/r;
        uv-=dir*min(bend,r*2.+uLensR)/vec2(uAspect,1.);
        shadow=1.-smoothstep(uLensShadow*.96,uLensShadow*1.04,r);
      }
      vec3 col;
      if(uZoom>0.002){
        col=vec3(0.); vec2 c=uv-.5; float w=0.;
        float j=rnd(vUv*vec2(913.,717.)); for(int i=0;i<22;i++){ float f=(float(i)+j)/22.; float s=1.-uZoom*f*.2; float k=1.-f*.7; col+=texture2D(tDiffuse,.5+c*s).rgb*k; w+=k; }
        col/=w;
      } else col=fetch(uv);
      col*=1.-shadow;
      col=aces(col*uExposure);
      vec2 q=(vUv-.5)*vec2(uAspect,1.); float v=smoothstep(.35,1.05,length(q)); col*=1.-uVignette*v;
      col=pow(col,vec3(1./2.2));
      col+=(rnd(vUv*vec2(1920.,1080.))-.5)*uGrain;
      gl_FragColor=vec4(col*uFade,1.);
    }`,
};

const PRESETS = {
  sun: { map: '2k_sun' },
  mercury: { map: '2k_mercury', airless: true },
  venus: { map: '2k_venus_atmosphere', atmosphere: '#e9c88e', atmoPower: 0.9 },
  earth: { map: '2k_earth_daymap', night: '2k_earth_nightmap', clouds: '2k_earth_clouds', atmosphere: '#6aa8ff', tilt: 23.4, ocean: true },
  moon: { map: '2k_moon', airless: true, tilt: 6.7, power: 1.5 },
  mars: { map: '2k_mars', atmosphere: '#e09a68', atmoPower: 0.5, tilt: 25.2 },
  jupiter: { map: '2k_jupiter', atmosphere: '#e8cfa8', atmoPower: 0.35, tilt: 3.1 },
  saturn: { map: '2k_saturn', atmosphere: '#ecd9ae', atmoPower: 0.35, tilt: 26.7, rings: '2k_saturn_ring_alpha' },
  uranus: { map: '2k_uranus', atmosphere: '#a6e4ea', atmoPower: 0.5, tilt: 97.8 },
  neptune: { map: '2k_neptune', atmosphere: '#6f93ff', atmoPower: 0.6, tilt: 28.3 },
};
export const TEXTURES_BY_PRESET = Object.fromEntries(
  Object.entries(PRESETS).map(([k, p]) => [k, [p.map, p.night, p.clouds, p.rings].filter(Boolean)]),
);

const PLANET_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vLocal;
  void main(){ vUv=uv; vLocal=position; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const PLANET_FS = /* glsl */ `
  uniform sampler2D uMap,uNight,uClouds; uniform vec3 uSun; uniform float uHasNight,uHasClouds,uOcean,uAirless,uBump,uPower,uOpacity,uGlow,uT;
  uniform vec3 uAtmo; uniform float uAtmoPower;
  varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vLocal;
  void main(){
    vec3 N=normalize(vN), V=normalize(cameraPosition-vW), L=normalize(uSun-vW);
    vec3 alb=texture2D(uMap,vUv).rgb;
    if(uBump>0.){
      float h=dot(texture2D(uMap,vUv,1.6).rgb,vec3(.33));
      vec3 dpx=dFdx(vW),dpy=dFdy(vW); float dhx=dFdx(h),dhy=dFdy(h);
      vec3 r1=cross(dpy,N),r2=cross(N,dpx); float det=dot(dpx,r1);
      vec3 g=sign(det)*(dhx*r1+dhy*r2);
      N=normalize(abs(det)*N-uBump*g*0.6);
    }
    float ndl=dot(N,L), ndlGeo=dot(normalize(vN),L), ndv=max(dot(normalize(vN),V),0.);
    float wrap=mix(smoothstep(-.10,.28,ndlGeo),smoothstep(-.012,.05,ndlGeo),uAirless);
    float lambert=max(ndl,0.)*.82+.18*wrap;
    vec3 col=alb*lambert*uPower*wrap;
    if(uOcean>.5){
      float water=smoothstep(.02,.16,alb.b-max(alb.r,alb.g*.92));
      vec3 H=normalize(L+V); float sp=pow(max(dot(normalize(vN),H),0.),340.);
      float sp2=pow(max(dot(normalize(vN),H),0.),42.);
      col+=water*(sp*1.5+sp2*.075)*vec3(1.,.96,.88)*wrap;
      col=mix(col,col*vec3(.78,.9,1.15),water*.55);
    }
    if(uHasClouds>.5){
      vec2 sh=vUv+vec2(uT*.0009+0.004,0.);
      float c=texture2D(uClouds,sh).r;
      col*=1.-c*.55*wrap;
    }
    if(uHasNight>.5){
      vec3 n=texture2D(uNight,vUv).rgb; float dark=1.-smoothstep(-.14,.08,ndlGeo);
      col+=n*n*dark*vec3(1.2,.96,.72)*.95;
    }
    if(uAtmoPower>0.){
      float rim=pow(1.-ndv,3.2);
      col+=uAtmo*rim*wrap*uAtmoPower*.85;
      float band=smoothstep(.22,0.,abs(ndlGeo))*smoothstep(-.12,.06,ndlGeo);
      col+=vec3(1.,.46,.2)*band*.035*uAtmoPower;
    }
    gl_FragColor=vec4(col+alb*uGlow,uOpacity);
  }`;

const ATMO_VS = /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const ATMO_FS = /* glsl */ `
  uniform vec3 uColor,uSun; uniform float uPower,uOpacity,uFmax,uSunset; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N=normalize(vN),V=normalize(cameraPosition-vW),L=normalize(uSun-vW);
    float f=clamp(dot(-N,V),0.,1.);
    float k=pow(clamp(f/uFmax,0.,1.),2.4);
    float nl=dot(N,L);
    float sun=smoothstep(-.3,.45,nl);
    float sunset=smoothstep(.34,.0,abs(nl));
    vec3 c=mix(uColor,vec3(1.,.5,.26),sunset*uSunset);
    gl_FragColor=vec4(c*k*sun*uPower*1.5*uOpacity,1.);
  }`;

const SUN_FS = /* glsl */ `
  uniform float uT,uOpacity; uniform sampler2D uMap; varying vec3 vN; varying vec3 vW; varying vec3 vLocal; varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    vec3 V=normalize(cameraPosition-vW), N=normalize(vN);
    vec3 p=normalize(vLocal);
    float a=fbm(p*2.3+vec3(0.,uT*.03,uT*.018));
    float g=fbm(p*13.+vec3(a*1.6,uT*.05,-uT*.04));
    float fine=fbm(p*44.+vec3(g*1.5,-uT*.08,uT*.06));
    float heat=clamp(.5+.8*(g-.5)+.55*(fine-.5)+.5*(a-.5),0.,1.);
    vec3 c=mix(vec3(1.,.2,.02),vec3(1.,.5,.1),smoothstep(.22,.62,heat)); c=mix(c,vec3(1.,.74,.3),smoothstep(.6,.95,heat));
    float mu=max(dot(N,V),0.); float limb=.34+.66*pow(mu,.5);
    gl_FragColor=vec4(c*limb*(1.0+heat*.95)*uOpacity,uOpacity);
  }`;

const CORONA_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uT,uOpacity,uInner,uRays; varying vec2 vUv;
  ${NOISE_GLSL}
  void main(){
    vec2 q=vUv*2.-1.; float r=length(q); if(r>1.) discard; float a=atan(q.y,q.x);
    float e=(r-uInner)/(1.-uInner); e=max(e,0.);
    vec3 dir=vec3(cos(a),sin(a),0.);
    float n=fbm(dir*3.4+vec3(uT*.05,uT*.03,e*1.4));
    float n2=fbm(dir*11.+vec3(-uT*.04,uT*.05,e*2.));
    float glow=pow(1.-e,3.6)*(1.+uRays*(n*1.6-.5))+pow(1.-e,12.)*1.5;
    glow+=uRays*pow(1.-e,2.4)*smoothstep(.56,.8,n2)*.9;
    gl_FragColor=vec4(uColor*max(glow,0.)*uOpacity*smoothstep(1.,.86,r),1.);
  }`;

const RING_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor,uSun,uHot,uBlocker; uniform float uHas,uInner,uOuter,uOpacity,uT,uSpin,uDoppler,uGlow,uBlockR; uniform vec3 uCamRight;
  varying vec3 vW; varying vec2 vUv; varying vec3 vLocal; varying vec3 vTan;
  ${NOISE_GLSL}
  void main(){
    float r=length(vLocal.xz); float k=(r-uInner)/(uOuter-uInner);
    if(k<0.||k>1.) discard;
    vec3 c; float alpha;
    if(uHas>.5){
      vec4 m=texture2D(uMap,vec2(k,.5)); float a=m.a>.99? dot(m.rgb,vec3(.33)):m.a;
      c=uColor*(m.rgb*.8+.2); alpha=a;
      vec3 L=normalize(uSun-vW); vec3 O=uBlocker-vW; float b=dot(O,L);
      if(b>0.){ float d=length(O-L*b); c*=smoothstep(uBlockR*.96,uBlockR*1.06,d); }
    } else {
      float ang=atan(vLocal.z,vLocal.x)+uT*uSpin*(1.6/(.25+k*k+.25));
      vec3 p=vec3(cos(ang)*(1.+k*2.)*2.,k*16.,sin(ang)*(1.+k*2.)*2.);
      float s=fbm(p)*1.5; float streak=smoothstep(.25,.95,s);
      float fall=pow(1.-k,1.6);
      c=mix(uColor,uHot,pow(1.-k,3.))*(.22+streak*1.05)*fall*(.62+1.2*pow(1.-k,4.));
      float dop=1.+uDoppler*dot(normalize(vTan),normalize(vW-cameraPosition));
      c*=dop*dop;
      alpha=smoothstep(0.,.06,k)*smoothstep(1.,.55,k)*(.35+streak*.65);
    }
    gl_FragColor=vec4(c*(1.+uGlow),alpha*uOpacity);
  }`;

const RIBBON_VS = /* glsl */ `
  attribute vec3 aPrev,aNext; attribute float aSide,aU;
  uniform vec2 uRes; uniform float uWidth,uWorld; varying float vU,vSide;
  void main(){
    vU=aU; vSide=aSide;
    mat4 pv=projectionMatrix*modelViewMatrix;
    vec4 c=pv*vec4(position,1.), p=pv*vec4(aPrev,1.), n=pv*vec4(aNext,1.);
    vec2 asp=vec2(uRes.x/uRes.y,1.);
    vec2 sc=c.xy/max(c.w,1e-3)*asp, sp=p.xy/max(p.w,1e-3)*asp, sn=n.xy/max(n.w,1e-3)*asp;
    vec2 d=sn-sp; float l=length(d); d=l>1e-5?d/l:vec2(1.,0.);
    vec2 nrm=vec2(-d.y,d.x)/asp;
    float px=uWorld>0.?uWorld*projectionMatrix[1][1]/max(c.w,1e-3)*uRes.y*.5:uWidth;
    c.xy+=nrm*aSide*max(px,1.)/uRes.y*c.w*2.;
    gl_Position=c;
  }`;
const RIBBON_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uReveal,uFrom,uOpacity,uGlow,uDash,uFlow,uHead,uT; varying float vU,vSide;
  void main(){
    if(vU>uReveal||vU<uFrom) discard;
    float edge=smoothstep(1.,.45,abs(vSide));
    float a=edge*uOpacity;
    if(uDash>0.){ a*=step(.5,fract(vU*uDash-uT*uFlow)); }
    float head=uHead*smoothstep(uReveal-.04,uReveal,vU)*step(uReveal,.999);
    gl_FragColor=vec4(uColor*(.72+min(uGlow,3.)*.3+head*4.)*a,a);
  }`;

function makeRibbon(pts, closed) {
  const n = pts.length;
  const pos = new Float32Array(n * 6), prev = new Float32Array(n * 6), next = new Float32Array(n * 6);
  const side = new Float32Array(n * 2), u = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  for (let i = 0; i < n; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; u[i * 2] = u[i * 2 + 1] = n > 1 ? i / (n - 1) : 0; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aNext', new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setIndex(idx);
  const write = (points) => {
    for (let i = 0; i < n; i++) {
      const c = points[i];
      const p = points[i === 0 ? (closed ? n - 2 : 0) : i - 1];
      const m = points[i === n - 1 ? (closed ? 1 : n - 1) : i + 1];
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        pos[k] = c[0]; pos[k + 1] = c[1]; pos[k + 2] = c[2];
        prev[k] = p[0]; prev[k + 1] = p[1]; prev[k + 2] = p[2];
        next[k] = m[0]; next[k + 1] = m[1]; next[k + 2] = m[2];
      }
    }
    g.attributes.position.needsUpdate = g.attributes.aPrev.needsUpdate = g.attributes.aNext.needsUpdate = true;
    g.computeBoundingSphere();
    if (!Number.isFinite(g.boundingSphere?.radius)) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  };
  write(pts);
  return { geometry: g, write };
}

function polygonize(field, min, max, res) {
  const nx = res, ny = res, nz = res;
  const sx = (max[0] - min[0]) / (nx - 1), sy = (max[1] - min[1]) / (ny - 1), sz = (max[2] - min[2]) / (nz - 1);
  const vals = new Float32Array(nx * ny * nz);
  const I = (x, y, z) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    vals[I(x, y, z)] = field(min[0] + x * sx, min[1] + y * sy, min[2] + z * sz);
  }
  const vid = new Int32Array(nx * ny * nz).fill(-1);
  const verts = [];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0; const v = [];
    for (let c = 0; c < 8; c++) { const q = vals[I(x + corners[c][0], y + corners[c][1], z + corners[c][2])]; v.push(q); if (q < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      px += corners[a][0] + t * (corners[b][0] - corners[a][0]);
      py += corners[a][1] + t * (corners[b][1] - corners[a][1]);
      pz += corners[a][2] + t * (corners[b][2] - corners[a][2]);
      cnt++;
    }
    vid[I(x, y, z)] = verts.length / 3;
    verts.push(min[0] + (x + px / cnt) * sx, min[1] + (y + py / cnt) * sy, min[2] + (z + pz / cnt) * sz);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const here = vals[I(x, y, z)] < 0;
    if (here !== (vals[I(x + 1, y, z)] < 0)) quad(vid[I(x, y - 1, z - 1)], vid[I(x, y, z - 1)], vid[I(x, y, z)], vid[I(x, y - 1, z)], !here);
    if (here !== (vals[I(x, y + 1, z)] < 0)) quad(vid[I(x - 1, y, z - 1)], vid[I(x - 1, y, z)], vid[I(x, y, z)], vid[I(x, y, z - 1)], !here);
    if (here !== (vals[I(x, y, z + 1)] < 0)) quad(vid[I(x - 1, y - 1, z)], vid[I(x, y - 1, z)], vid[I(x, y, z)], vid[I(x - 1, y, z)], !here);
  }
  return { positions: new Float32Array(verts), indices: idx };
}

const hexOf = (c) => new THREE.Color(c ?? '#ffffff');

export function createKit({ canvas, overlay, timing, textures, quality = 'high', theme = 'dark', onIssue = () => {} }) {
  const Q = {
    high: { dpr: Math.min(window.devicePixelRatio || 1, 2), samples: 4, bloomScale: 1, bloom: true },
    x2: { dpr: 2, samples: 4, bloomScale: 1, bloom: true },
    med: { dpr: Math.min(window.devicePixelRatio || 1, 1.25), samples: 2, bloomScale: 0.5, bloom: true },
    low: { dpr: 1, samples: 0, bloomScale: 0.35, bloom: true },
  }[quality] || {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
  renderer.setPixelRatio(Q.dpr);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const W = () => canvas.clientWidth || 960, H = () => canvas.clientHeight || 540;
  renderer.setSize(W(), H(), false);

  const scene = new THREE.Scene();
  const sky = new THREE.Group(); sky.renderOrder = -10; scene.add(sky);
  const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.01, 2e5);

  const rt = new THREE.WebGLRenderTarget(W() * Q.dpr, H() * Q.dpr, { type: THREE.HalfFloatType, samples: Q.samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Q.dpr);
  composer.setSize(W(), H());
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(W() * Q.bloomScale, H() * Q.bloomScale), 0.42, 0.72, 1.05);
  composer.addPass(bloomPass);
  const grade = new ShaderPass(GRADE_SHADER);
  composer.addPass(grade);

  const uT = { value: 0 };
  const uRes = { value: new THREE.Vector2(W() * Q.dpr, H() * Q.dpr) };
  const uSun = { value: new THREE.Vector3(-60, 8, 30) };
  const parts = {};
  const tickers = [];
  const labels = [];
  const insets = [];
  const issues = [];
  const issue = (m) => { if (issues.length < 40) { issues.push(m); onIssue(m); } };

  const texCache = {};
  const tex = (name, opts = {}) => {
    if (!name) return null;
    if (texCache[name]) return texCache[name];
    const bmp = textures[name];
    if (!bmp) { issue(`texture not loaded: ${name}`); return null; }
    const t = new THREE.CanvasTexture(bmp);
    t.flipY = false;
    t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.wrapS = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    texCache[name] = t;
    return t;
  };

  const moments = timing.moments || {};
  const duration = timing.duration || 20;
  const timeOf = (m) => {
    if (typeof m === 'number') return m;
    if (m == null) return 0;
    if (m === 'start') return 0;
    if (m === 'end') return duration;
    if (m in moments) return moments[m];
    issue(`unknown moment: ${m}`);
    return duration + 999;
  };
  const progress = (t, m, over = 1, e = 'inOutCubic') => {
    const fn = typeof e === 'function' ? e : ease[e] || ease.inOutCubic;
    return fn(clamp01((t - timeOf(m)) / Math.max(over, 1e-3)));
  };
  const envelope = (t, a, b, fade = 0.6) => {
    const inn = clamp01((t - timeOf(a)) / fade);
    const out = b === undefined || b === null || b === 'end' ? 1 : 1 - clamp01((t - timeOf(b)) / fade);
    return ease.inOutSine(inn) * ease.inOutSine(out);
  };

  let envMap = null;
  const buildEnv = (intensity = 1) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x05060a);
    const box = (w, h, x, y, z, color, power) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    };
    box(6, 10, 7, 6, 5, '#fff2df', 16 * intensity);
    box(3, 12, -9, 2, 3, '#a9c6ff', 7 * intensity);
    box(12, 2, 0, -8, 3, '#ffb37a', 1.5 * intensity);
    box(14, 6, 0, 10, -5, '#ffffff', 2.6 * intensity);
    box(2, 14, 2, 0, -10, '#ffd9b0', 8 * intensity);
    envMap = pm.fromScene(s, 0.035).texture;
    pm.dispose();
    scene.environment = envMap;
  };

  const register = (id, part) => {
    if (id) { if (parts[id]) issue(`duplicate part id: ${id}`); parts[id] = part; part.id = id; }
    return part;
  };

  const basePart = (object) => ({
    object,
    place(p) { object.position.set(p[0], p[1], p[2]); return this; },
    scale(s) { Array.isArray(s) ? object.scale.set(s[0], s[1], s[2]) : object.scale.setScalar(s); return this; },
    turn(x = 0, y = 0, z = 0) { object.rotation.set(x, y, z); return this; },
    visible(v) { object.visible = !!v; return this; },
    world() { object.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld); },
  });

  function stage(kind = 'space', o = {}) {
    if (kind === 'space') {
      const skyTex = textures['2k_stars_milky_way'] ? tex('2k_stars_milky_way') : null;
      if (skyTex) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthTest: false, depthWrite: false, color: new THREE.Color(1, 1, 1).multiplyScalar(o.sky ?? 0.26) }));
        m.scale.setScalar(5e4); m.renderOrder = -10; m.rotation.set(0.5, 0.3, 0.9); sky.add(m);
      }
      const rnd = mulberry(o.seed ?? 7);
      const n = o.stars ?? 9000;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n);
      const pal = [[.62,.74,1],[.78,.86,1],[1,1,1],[1,.95,.84],[1,.84,.62],[1,.68,.46]];
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const band = rnd() < 0.45 ? (rnd() - 0.5) * 0.34 : u;
        const uu = band, ss = Math.sqrt(1 - uu * uu);
        pos[i * 3] = ss * Math.cos(a) * 4e4; pos[i * 3 + 1] = uu * 4e4; pos[i * 3 + 2] = ss * Math.sin(a) * 4e4;
        const m = Math.pow(rnd(), 14);
        const c = pal[Math.floor(rnd() * pal.length)];
        const b = (0.16 + rnd() * rnd() * 0.5) + m * 5;
        col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
        siz[i] = 0.85 + m * 1.7;
        void s;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aC', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aS', new THREE.BufferAttribute(siz, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uD: { value: Q.dpr } }, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 aC; attribute float aS; uniform float uD; varying vec3 vC; void main(){ vC=aC; gl_PointSize=aS*uD*1.35; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard; gl_FragColor=vec4(vC*pow(1.-r,2.2),1.); }`,
      });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = -9; sky.add(pts);
      buildEnv(0.5);
      scene.background = new THREE.Color(0x000000);
      const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x0a0a12, 0.12); scene.add(hemi);
      kit.sunLight = new THREE.DirectionalLight(0xfff3e0, 3.2); scene.add(kit.sunLight, kit.sunLight.target);
    } else {
      const top = hexOf(o.top ?? '#141b2b'), bottom = hexOf(o.bottom ?? '#020204'), accent = hexOf(o.accent ?? '#34222a');
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthTest: false, depthWrite: false,
        uniforms: { uTop: { value: top }, uBot: { value: bottom }, uAcc: { value: accent }, uT },
        vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 uTop,uBot,uAcc; uniform float uT; varying vec3 vP; ${NOISE_GLSL}
          void main(){ vec3 d=normalize(vP); float h=d.y*.5+.5; vec3 c=mix(uBot,uTop,smoothstep(.1,.95,h));
            float n=fbm(d*2.4+vec3(uT*.012,0.,uT*.008)); c+=uAcc*smoothstep(.42,.86,n)*.75; gl_FragColor=vec4(c*.62,1.); }`,
      }));
      m.scale.setScalar(5e4); m.renderOrder = -10; sky.add(m);
      buildEnv(o.env ?? 1);
      scene.environmentIntensity = o.envIntensity ?? 0.6;
      const key = new THREE.DirectionalLight(hexOf(o.key ?? '#fff1de'), o.keyPower ?? 2.2); key.position.set(5, 7, 6); scene.add(key);
      const rim = new THREE.DirectionalLight(hexOf(o.rim ?? '#86a8ff'), o.rimPower ?? 3.0); rim.position.set(-6, 3, -7); scene.add(rim);
      const fill = new THREE.DirectionalLight(hexOf(o.fill ?? '#ffb080'), 0.5); fill.position.set(-2, -5, 4); scene.add(fill);
      if (o.dust !== false) dust({ count: 700, radius: o.dustRadius ?? 9 });
    }
    return kit;
  }

  function planet(o) {
    const preset = PRESETS[o.preset ?? o.map] || {};
    const p = { ...preset, ...o };
    const radius = p.radius ?? 1;
    const group = new THREE.Group();
    const spinner = new THREE.Group();
    group.add(spinner);
    group.rotation.z = THREE.MathUtils.degToRad(p.tilt ?? 0);
    const seg = p.segments ?? 96;
    const mapName = preset.map ?? p.map;
    const uniforms = {
      uMap: { value: tex(mapName) }, uNight: { value: tex(p.night) }, uClouds: { value: tex(p.clouds, { linear: true }) },
      uSun, uHasNight: { value: p.night ? 1 : 0 }, uHasClouds: { value: p.clouds ? 1 : 0 }, uOcean: { value: p.ocean ? 1 : 0 },
      uAirless: { value: p.airless ? 1 : 0 }, uBump: { value: p.bump ?? 0 }, uPower: { value: p.power ?? 1.55 }, uOpacity: { value: 1 }, uGlow: { value: 0 }, uT,
      uAtmo: { value: hexOf(p.atmosphere ?? '#000000') }, uAtmoPower: { value: p.atmosphere ? (p.atmoPower ?? 1) : 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: PLANET_VS, fragmentShader: PLANET_FS, transparent: false });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg * 0.66), mat);
    spinner.add(sphere);
    let clouds = null, atmo = null, ring = null;
    if (p.clouds) {
      const cm = new THREE.ShaderMaterial({
        uniforms: { uC: { value: tex(p.clouds, { linear: true }) }, uSun, uO: { value: 1 }, uG: { value: p.cloudGain ?? 2.1 } }, transparent: true, depthWrite: false,
        vertexShader: PLANET_VS,
        fragmentShader: `uniform sampler2D uC; uniform vec3 uSun; uniform float uO,uG; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
          void main(){ float a=texture2D(uC,vUv).r; a=smoothstep(.12,.9,a); vec3 L=normalize(uSun-vW); float d=dot(normalize(vN),L);
            float w=smoothstep(-.1,.3,d); vec3 c=mix(vec3(1.,.6,.42),vec3(1.),smoothstep(0.,.42,d))*max(d*.9+.18,0.)*uG; gl_FragColor=vec4(c*w,a*uO*(.25+.75*w)); }`,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.006, seg, seg * 0.66), cm);
      spinner.add(clouds);
    }
    if (p.atmosphere && !p.airless) {
      const am = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: hexOf(p.atmosphere) }, uSun, uPower: { value: p.atmoPower ?? 1 }, uOpacity: { value: 1 }, uFmax: { value: Math.sqrt(1 - 1 / Math.pow(p.atmoScale ?? 1.03, 2)) }, uSunset: { value: p.sunset ?? 0.7 } },
        vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * (p.atmoScale ?? 1.03), 96, 64), am);
      group.add(atmo);
    }
    if (p.rings) {
      const inner = radius * 1.24, outer = radius * 2.27;
      ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex(p.rings) }, uColor: { value: hexOf('#e8d9b8') }, uHot: { value: hexOf('#ffffff') }, uSun, uHas: { value: 1 }, uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: 1 }, uT, uSpin: { value: 0 }, uDoppler: { value: 0 }, uGlow: { value: 0 }, uBlocker: { value: new THREE.Vector3() }, uBlockR: { value: radius }, uCamRight: { value: new THREE.Vector3() } },
        vertexShader: `varying vec3 vW; varying vec2 vUv; varying vec3 vLocal; varying vec3 vTan; void main(){ vUv=uv; vLocal=position; vTan=mat3(modelMatrix)*vec3(-position.z,0.,position.x); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      group.add(ring);
      tickers.push(() => { group.getWorldPosition(ring.material.uniforms.uBlocker.value); });
    }
    scene.add(group);
    const spin = p.spin ?? 6;
    const startSpin = THREE.MathUtils.degToRad(p.spinStart ?? 0);
    tickers.push((t) => { spinner.rotation.y = startSpin + THREE.MathUtils.degToRad(spin) * t; if (clouds) clouds.rotation.y = 0.0009 * t * 6.28 * 3; });
    const part = basePart(group);
    part.radius = radius;
    part.preset = o.preset ?? o.map ?? null;
    part.show = (v) => {
      group.visible = v > 0.001;
      mat.transparent = v < 0.999; uniforms.uOpacity.value = v;
      if (clouds) clouds.material.uniforms.uO.value = v;
      if (atmo) atmo.material.uniforms.uOpacity.value = v;
      if (ring) ring.material.uniforms.uOpacity.value = v;
      return part;
    };
    part.glow = (v) => { uniforms.uGlow.value = v; return part; };
    part.spinTo = (deg) => { spinner.rotation.y = THREE.MathUtils.degToRad(deg); return part; };
    if (p.at) part.place(p.at);
    return register(p.id, part);
  }

  function sun(o = {}) {
    const radius = o.radius ?? 2;
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ uniforms: { uT, uOpacity: { value: 1 } }, vertexShader: PLANET_VS, fragmentShader: SUN_FS });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
    group.add(sphere);
    const corona = new THREE.Sprite(new THREE.SpriteMaterial());
    const cm = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: hexOf(o.color ?? '#ff9a3c') }, uT, uOpacity: { value: Math.min(o.corona ?? 0.55, 0.7) }, uInner: { value: 0.16 }, uRays: { value: Math.min(o.rays ?? 0.45, 0.6) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=(position.xy)*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: CORONA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cm);
    quad.scale.setScalar(radius * Math.min(o.coronaScale ?? 6.5, 8));
    group.add(quad); void corona;
    scene.add(group);
    const part = basePart(group);
    part.radius = radius;
    part.show = (v) => { group.visible = v > 0.001; mat.uniforms.uOpacity.value = v; cm.uniforms.uOpacity.value = v * Math.min(o.corona ?? 0.55, 0.7); return part; };
    if (o.at) part.place(o.at);
    tickers.push(() => { group.getWorldPosition(uSun.value); if (kit.sunLight) { kit.sunLight.position.copy(uSun.value); } });
    uSun.value.copy(group.position);
    return register(o.id, part);
  }

  function glow(o = {}) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: hexOf(o.color ?? '#ffd9a0') }, uI: { value: o.intensity ?? 2 } }, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz)); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uI; varying vec2 vUv; void main(){ float r=length(vUv*2.-1.); float g=pow(max(1.-r,0.),2.6)+pow(max(1.-r,0.),12.)*2.; gl_FragColor=vec4(uColor*g*uI,1.); }`,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    q.scale.setScalar(o.size ?? 1);
    scene.add(q);
    const part = basePart(q);
    part.show = (v) => { q.visible = v > 0.001; m.uniforms.uI.value = (o.intensity ?? 2) * v; return part; };
    part.intensity = (v) => { m.uniforms.uI.value = v; return part; };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  }

  function sampleFn(fn, n) { const a = []; for (let i = 0; i < n; i++) a.push(fn(i / (n - 1))); return a; }
  function smoothPts(points, n, closed) {
    const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!closed, 'centripetal');
    return c.getPoints(n - 1).map((v) => [v.x, v.y, v.z]);
  }

  function path(o) {
    const n = o.segments ?? (o.fn ? 256 : Math.max(64, (o.points?.length || 2) * 16));
    const pts = o.fn ? sampleFn(o.fn, n) : (o.raw ? o.points : smoothPts(o.points, n, o.closed));
    const rb = makeRibbon(pts, o.closed);
    const uniforms = {
      uRes, uWidth: { value: Math.min(o.width ?? 2, 5) * Q.dpr }, uWorld: { value: o.worldWidth ?? 0 }, uColor: { value: hexOf(o.color ?? '#ffcc94') }, uReveal: { value: o.reveal ?? 1 }, uFrom: { value: 0 },
      uOpacity: { value: o.opacity ?? 1 }, uGlow: { value: o.glow ?? 1.5 }, uDash: { value: o.dash ?? 0 }, uFlow: { value: o.flow ?? 0 }, uHead: { value: o.head ?? 0.6 }, uT,
    };
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: o.solid ? THREE.NormalBlending : THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(rb.geometry, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const part = basePart(mesh);
    part.points = pts;
    part.reveal = (v, from = 0) => { uniforms.uReveal.value = v; uniforms.uFrom.value = from; mesh.visible = v > 0.0005; return part; };
    part.show = (v) => { uniforms.uOpacity.value = (o.opacity ?? 1) * v; mesh.visible = v > 0.001; return part; };
    part.color = (c) => { uniforms.uColor.value.set(c); return part; };
    part.glow = (v) => { uniforms.uGlow.value = v; return part; };
    part.setFn = (fn) => { for (let i = 0; i < n; i++) pts[i] = fn(i / (n - 1)); rb.write(pts); return part; };
    part.setPoints = (a) => { const s = a.length === n ? a : smoothPts(a, n, o.closed); for (let i = 0; i < n; i++) pts[i] = s[i]; rb.write(pts); return part; };
    part.pointAt = (u) => { const f = clamp01(u) * (n - 1); const i = Math.min(Math.floor(f), n - 2); const k = f - i; return [0, 1, 2].map((j) => pts[i][j] + (pts[i + 1][j] - pts[i][j]) * k); };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  }

  function orbitPath(o) {
    const r = o.radius ?? 5, c = o.center ?? [0, 0, 0], inc = THREE.MathUtils.degToRad(o.inclination ?? 0);
    return path({ width: 1, glow: 0.2, opacity: 0.5, color: '#cdd7ea', head: 0, segments: 256, closed: false, ...o,
      fn: (u) => { const a = u * Math.PI * 2; const y = Math.sin(a) * Math.sin(inc) * r; return [c[0] + Math.cos(a) * r, c[1] + y, c[2] + Math.sin(a) * r * Math.cos(inc)]; } });
  }

  function flow(o) {
    const count = o.count ?? 60;
    const a = new Float32Array(count), s = new Float32Array(count);
    const r = mulberry(o.seed ?? 3);
    for (let i = 0; i < count; i++) { a[i] = i / count + (r() - 0.5) * 0.4 / count; s[i] = 0.6 + r() * 0.8; }
    let pts = null;
    if (typeof o.along === 'function') pts = sampleFn(o.along, 256);
    else if (Array.isArray(o.along)) pts = smoothPts(o.along, 256);
    else if (typeof o.along === 'string') { pts = parts[o.along]?.points ?? null; if (!pts) issue(`flow along unknown path: ${o.along}`); }
    else if (o.fn) pts = sampleFn(o.fn, 256);
    else if (o.points) pts = smoothPts(o.points, 256);
    if (!pts) { pts = [[0, 0, 0], [0, 0, 0]]; }
    const dataTex = new Float32Array(pts.length * 4);
    pts.forEach((p, i) => { dataTex.set([p[0], p[1], p[2], 1], i * 4); });
    const dt = new THREE.DataTexture(dataTex, pts.length, 1, THREE.RGBAFormat, THREE.FloatType);
    dt.minFilter = dt.magFilter = THREE.NearestFilter; dt.needsUpdate = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(a, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    const uniforms = { uPath: { value: dt }, uN: { value: pts.length }, uT, uSpeed: { value: o.speed ?? 0.2 }, uSize: { value: (o.size ?? 5) * Q.dpr }, uColor: { value: hexOf(o.color ?? '#fff1d6') }, uI: { value: o.intensity ?? 3 }, uRes };
    const m = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aA,aS; uniform sampler2D uPath; uniform float uN,uT,uSpeed,uSize; varying float vF;
        void main(){ float f=fract(aA+uT*uSpeed); vF=f; float x=f*(uN-1.); float i=floor(x); float k=x-i;
          vec3 a=texelFetch(uPath,ivec2(int(i),0),0).xyz, b=texelFetch(uPath,ivec2(int(min(i+1.,uN-1.)),0),0).xyz;
          vec4 mv=modelViewMatrix*vec4(mix(a,b,k),1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*aS; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vF; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard; float e=smoothstep(0.,.05,vF)*smoothstep(1.,.95,vF); gl_FragColor=vec4(uColor*uI*pow(1.-r,2.)*e,1.); }`,
    });
    const pointsMesh = new THREE.Points(g, m); pointsMesh.frustumCulled = false;
    scene.add(pointsMesh);
    const part = basePart(pointsMesh);
    part.show = (v) => { pointsMesh.visible = v > 0.001; uniforms.uI.value = (o.intensity ?? 3) * v; return part; };
    return register(o.id, part);
  }

  function dust(o = {}) {
    const n = o.count ?? 600, R = o.radius ?? 8;
    const r = mulberry(o.seed ?? 11);
    const pos = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n * 3; i++) pos[i] = (r() * 2 - 1) * R;
    for (let i = 0; i < n; i++) s[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    const uniforms = { uT, uD: { value: Q.dpr }, uR: { value: R }, uI: { value: o.intensity ?? 1 }, uC: { value: hexOf(o.color ?? '#ffe8cc') } };
    const m = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aS; uniform float uT,uD,uR; varying float vA;
        void main(){ vec3 p=position; float a=aS*6.28; p+=vec3(sin(uT*.07+a)*.5,cos(uT*.05+a*2.)*.35+uT*.012,sin(uT*.06+a*3.)*.5);
          p=mod(p+uR,2.*uR)-uR; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; float d=-mv.z; gl_PointSize=clamp((1.+aS*2.5)*uD*7./max(d,.5),1.,10.*uD); vA=(.22+.5*aS*aS)*smoothstep(.4,2.,d); }`,
      fragmentShader: `uniform vec3 uC; uniform float uI; varying float vA; void main(){ vec2 q=gl_PointCoord*2.-1.; float r=dot(q,q); if(r>1.) discard; gl_FragColor=vec4(uC*vA*uI*pow(1.-r,3.)*.6,1.); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false;
    scene.add(pts);
    const part = basePart(pts);
    part.show = (v) => { pts.visible = v > 0.001; uniforms.uI.value = (o.intensity ?? 1) * v; return part; };
    return register(o.id, part);
  }

  function pbrMaterial(name = 'ceramic', color = '#d8d2c6', o = {}) {
    const c = hexOf(color);
    const base = { color: c, envMapIntensity: o.env ?? 1 };
    let mat;
    switch (name) {
      case 'metal': mat = new THREE.MeshPhysicalMaterial({ ...base, metalness: 1, roughness: o.roughness ?? 0.26 }); break;
      case 'glass': mat = new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: o.roughness ?? 0.06, transparent: true, opacity: o.opacity ?? 0.26, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide }); break;
      case 'matte': mat = new THREE.MeshStandardMaterial({ ...base, metalness: 0, roughness: o.roughness ?? 0.82 }); break;
      case 'plastic': mat = new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: o.roughness ?? 0.32, clearcoat: 0.4, clearcoatRoughness: 0.3 }); break;
      case 'wet': mat = new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: o.roughness ?? 0.5, clearcoat: 0.7, clearcoatRoughness: 0.28, sheen: 0.18, sheenRoughness: 0.6, sheenColor: c.clone().lerp(new THREE.Color('#ff8a70'), 0.4), envMapIntensity: 0.55 }); break;
      case 'emissive': mat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(o.power ?? 2.5), transparent: true }); break;
      case 'void': mat = new THREE.MeshBasicMaterial({ color: 0x000000 }); break;
      case 'ceramic':
      default: mat = new THREE.MeshPhysicalMaterial({ ...base, metalness: 0, roughness: o.roughness ?? 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25 }); break;
    }
    if (o.emissive && mat.emissive) { mat.emissive = hexOf(o.emissive); mat.emissiveIntensity = o.emissivePower ?? 0.6; }
    mat.userData.baseOpacity = mat.opacity;
    return mat;
  }
  const fadeMaterial = (mat, v) => {
    const b = mat.userData.baseOpacity ?? 1;
    mat.opacity = b * v;
    const wantTransparent = b < 1 || v < 0.999 || mat.userData.alwaysTransparent;
    if (mat.transparent !== wantTransparent) { mat.transparent = wantTransparent; mat.needsUpdate = true; }
    if (!mat.isMeshBasicMaterial && b >= 1) mat.depthWrite = v > 0.5;
  };

  function geometryFor(shape, s = {}) {
    const a = s.size ?? s.radius ?? 1;
    switch (shape) {
      case 'box': return new THREE.BoxGeometry(s.x ?? a, s.y ?? a, s.z ?? a, 1, 1, 1);
      case 'capsule': return new THREE.CapsuleGeometry(s.radius ?? 0.2, s.length ?? 1, 10, 20);
      case 'cylinder': return new THREE.CylinderGeometry(s.radiusTop ?? s.radius ?? 0.5, s.radiusBottom ?? s.radius ?? 0.5, s.length ?? 1, s.sides ?? 40);
      case 'cone': return new THREE.ConeGeometry(s.radius ?? 0.5, s.length ?? 1, 40);
      case 'torus': return new THREE.TorusGeometry(s.radius ?? 1, s.tube ?? 0.12, 24, 96);
      case 'icosa': return new THREE.IcosahedronGeometry(a, s.detail ?? 1);
      case 'plane': return new THREE.PlaneGeometry(s.x ?? a, s.y ?? a);
      case 'sphere':
      default: return new THREE.SphereGeometry(a, s.segments ?? 64, s.segments ? s.segments * 0.66 : 44);
    }
  }

  function mesh(o = {}) {
    const mat = o.customMaterial ?? pbrMaterial(o.material, o.color, o);
    const m = new THREE.Mesh(o.geometry ?? geometryFor(o.shape, o), mat);
    scene.add(m);
    const part = basePart(m);
    part.material = mat;
    part.show = (v) => { m.visible = v > 0.001; fadeMaterial(mat, v); return part; };
    part.glow = (v) => { if (mat.emissive) { mat.emissive.copy(mat.color); mat.emissiveIntensity = v; } return part; };
    part.color = (c) => { mat.color.set(c); return part; };
    if (o.at) part.place(o.at);
    if (o.rotation) m.rotation.set(...o.rotation);
    return register(o.id, part);
  }

  function group(o = {}) {
    const g = new THREE.Group();
    scene.add(g);
    const part = basePart(g);
    part.add = (...children) => { children.forEach((c) => g.add(c.object ?? c)); return part; };
    part.show = (v) => { g.traverse((c) => { if (c.material?.opacity !== undefined && c.material.userData) fadeMaterial(c.material, v); }); g.visible = v > 0.001; return part; };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  }

  function organic(o) {
    const blobs = o.blobs.map((b) => {
      const a = new THREE.Vector3(...b.p);
      const c = b.to ? new THREE.Vector3(...b.to) : a.clone();
      return { a, b: c, r: b.r ?? 0.5, r2: b.r2 ?? b.r ?? 0.5, color: b.color ? hexOf(b.color) : null, group: b.group ?? null, sub: !!b.subtract };
    });
    const k = o.smooth ?? 0.25;
    const groups = [...new Set(blobs.map((b) => b.group).filter(Boolean))].slice(0, 6);
    const dist = (b, x, y, z) => {
      const bax = b.b.x - b.a.x, bay = b.b.y - b.a.y, baz = b.b.z - b.a.z;
      const pax = x - b.a.x, pay = y - b.a.y, paz = z - b.a.z;
      const dd = bax * bax + bay * bay + baz * baz;
      const h = dd > 0 ? clamp01((pax * bax + pay * bay + paz * baz) / dd) : 0;
      const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - (b.r + (b.r2 - b.r) * h);
    };
    const field = (x, y, z) => {
      let d = 1e9;
      for (const b of blobs) { if (b.sub) continue; const q = dist(b, x, y, z); const h = clamp01(0.5 + 0.5 * (d - q) / k); d = d * (1 - h) + q * h - k * h * (1 - h); }
      for (const b of blobs) { if (!b.sub) continue; const q = -dist(b, x, y, z); const h = clamp01(0.5 - 0.5 * (d - q) / k); d = d * (1 - h) + q * h + k * h * (1 - h); }
      return d;
    };
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const b of blobs) for (const e of [b.a, b.b]) { const R = Math.max(b.r, b.r2) + k + 0.1; ['x', 'y', 'z'].forEach((c, i) => { min[i] = Math.min(min[i], e[c] - R); max[i] = Math.max(max[i], e[c] + R); }); }
    const { positions, indices } = polygonize(field, min, max, Math.min(o.res ?? 72, 110));
    const nv = positions.length / 3;
    const normals = new Float32Array(nv * 3), colors = new Float32Array(nv * 3);
    const gi = groups.length ? new Float32Array(nv * 4).fill(0) : null;
    const base = hexOf(o.color ?? '#b64a44');
    const e = 0.012;
    for (let i = 0; i < nv; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const nx = field(x + e, y, z) - field(x - e, y, z), ny = field(x, y + e, z) - field(x, y - e, z), nz = field(x, y, z + e) - field(x, y, z - e);
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l;
      let wSum = 0, r = 0, g = 0, bl = 0;
      const gw = new Array(groups.length).fill(0);
      for (const b of blobs) {
        if (b.sub) continue;
        const d = Math.max(dist(b, x, y, z), 0.001);
        const w = 1 / Math.pow(d + 0.05, 5);
        const c = b.color ?? base;
        wSum += w; r += c.r * w; g += c.g * w; bl += c.b * w;
        if (b.group) gw[groups.indexOf(b.group)] += w;
      }
      // Field-sampled ambient occlusion darkens the creases where forms meet, which is most of what makes a soft form read as sculpted.
      let ao = 0;
      for (const [dist0, w0] of [[0.05, 0.5], [0.12, 0.3], [0.26, 0.2]]) ao += w0 * clamp01(field(x + normals[i * 3] * dist0, y + normals[i * 3 + 1] * dist0, z + normals[i * 3 + 2] * dist0) / dist0);
      const shade = 0.16 + 0.84 * ao * ao;
      colors[i * 3] = (r / wSum) * shade; colors[i * 3 + 1] = (g / wSum) * shade; colors[i * 3 + 2] = (bl / wSum) * shade;
      if (gi) { for (let q = 0; q < Math.min(groups.length, 4); q++) gi[i * 4 + q] = gw[q] / wSum; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (gi) geo.setAttribute('aG', new THREE.BufferAttribute(gi, 4));
    geo.setIndex(indices);
    const mat = pbrMaterial(o.material ?? 'wet', '#ffffff', o);
    mat.vertexColors = true;
    const uGC = { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
    const uGS = { value: new THREE.Vector4(1, 1, 1, 1) };
    groups.slice(0, 4).forEach((gname, i) => {
      const bs = blobs.filter((b) => b.group === gname);
      const c = new THREE.Vector3(); bs.forEach((b) => c.add(b.a).add(b.b)); c.multiplyScalar(1 / (bs.length * 2)); uGC.value[i] = c;
    });
    const detailScale = o.detail?.scale ?? 7, detailAmount = o.detail?.amount ?? 0.35;
    mat.onBeforeCompile = (s) => {
      s.uniforms.uGC = uGC; s.uniforms.uGS = uGS; s.uniforms.uDS = { value: detailScale }; s.uniforms.uDA = { value: detailAmount };
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nattribute vec4 aG; uniform vec3 uGC[4]; uniform vec4 uGS; varying vec3 vObj;`)
        .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); ${gi ? 'for(int i=0;i<4;i++){ transformed=mix(transformed,uGC[i]+(transformed-uGC[i])*uGS[i],aG[i]); }' : ''} vObj=position;`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDS,uDA; ${NOISE_GLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { float h=fbm(vObj*uDS*vec3(1.,.42,1.)+vec3(fbm(vObj*uDS*.4)*1.6)); vec3 dx=dFdx(vec3(h)),dy=dFdy(vec3(h)); vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);
            vec3 r1=cross(dpy,normal),r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dx.x*r1+dy.x*r2); normal=normalize(abs(det)*normal-uDA*.22*g);
            diffuseColor.rgb*=.62+.72*h; }`);
    };
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    const part = basePart(m);
    part.material = mat;
    part.groups = groups;
    part.squeeze = (name, s) => { const i = groups.indexOf(name); if (i >= 0 && i < 4) uGS.value.setComponent(i, s); else issue(`organic: unknown group ${name}`); return part; };
    part.show = (v) => { m.visible = v > 0.001; fadeMaterial(mat, v); return part; };
    part.glow = (v) => { if (mat.emissive) { mat.emissive.set('#ffffff'); mat.emissiveIntensity = v * 0.25; } return part; };
    if (o.at) part.place(o.at);
    return register(o.id, part);
  }

  function tube(o) {
    const n = o.segments ?? 200;
    const pts = o.fn ? sampleFn(o.fn, Math.max(n / 2, 8) | 0) : o.points;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), !!o.closed, 'centripetal');
    const radial = o.radial ?? 14;
    const g = new THREE.TubeGeometry(curve, n, o.radius ?? 0.05, radial, !!o.closed);
    const mat = pbrMaterial(o.material ?? 'ceramic', o.color, o);
    const m = new THREE.Mesh(g, mat);
    scene.add(m);
    const part = basePart(m);
    part.material = mat;
    const total = g.index.count;
    part.reveal = (v) => { g.setDrawRange(0, Math.floor(total * clamp01(v) / 6) * 6); m.visible = v > 0.001; return part; };
    part.show = (v) => { m.visible = v > 0.001; fadeMaterial(mat, v); return part; };
    part.color = (c) => { mat.color.set(c); return part; };
    part.glow = (v) => { if (mat.emissive) { mat.emissive.copy(mat.color); mat.emissiveIntensity = v; } return part; };
    part.pointAt = (u) => { const v = curve.getPoint(clamp01(u)); return [v.x, v.y, v.z]; };
    part.points = curve.getPoints(255).map((v) => [v.x, v.y, v.z]);
    if (o.at) part.place(o.at);
    return register(o.id, part);
  }

  function instances(o) {
    const count = o.count ?? 50;
    const mat = pbrMaterial(o.material, o.color ?? '#ffffff', o);
    const im = new THREE.InstancedMesh(o.geometry ?? geometryFor(o.shape ?? 'sphere', { segments: 18, ...o }), mat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    if (o.colorAt) { const c = new THREE.Color(); for (let i = 0; i < count; i++) { im.setColorAt(i, c.set(o.colorAt(i))); } }
    scene.add(im);
    const dummy = new THREE.Object3D();
    const out = { p: [0, 0, 0], s: 1, q: null, look: null, r: null, scale3: null };
    const part = basePart(im);
    part.material = mat;
    part.update = (t) => {
      for (let i = 0; i < count; i++) {
        out.p = [0, 0, 0]; out.s = 1; out.look = null; out.r = null; out.scale3 = null;
        const res = o.at(i, t, out) || out;
        dummy.position.set(res.p[0], res.p[1], res.p[2]);
        if (res.look) dummy.lookAt(res.look[0], res.look[1], res.look[2]); else if (res.r) dummy.rotation.set(res.r[0], res.r[1], res.r[2]); else dummy.rotation.set(0, 0, 0);
        if (res.scale3) dummy.scale.set(res.scale3[0], res.scale3[1], res.scale3[2]); else dummy.scale.setScalar(res.s ?? 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      return part;
    };
    part.setColor = (i, c) => { im.setColorAt(i, hexOf(c)); im.instanceColor.needsUpdate = true; return part; };
    part.show = (v) => { im.visible = v > 0.001; fadeMaterial(mat, v); return part; };
    tickers.push((t) => part.update(t));
    return register(o.id, part);
  }

  function disk(o = {}) {
    const inner = o.inner ?? 1.5, outer = o.outer ?? 5;
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uColor: { value: hexOf(o.color ?? '#ff8a3a') }, uHot: { value: hexOf(o.hot ?? '#fff1d6') }, uSun, uHas: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uOpacity: { value: 1 }, uT, uSpin: { value: o.spin ?? 1.2 }, uDoppler: { value: o.doppler ?? 0.55 }, uGlow: { value: o.glow ?? 0 }, uBlocker: { value: new THREE.Vector3() }, uBlockR: { value: 0 }, uCamRight: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; varying vec2 vUv; varying vec3 vLocal; varying vec3 vTan; void main(){ vUv=uv; vLocal=position; vTan=mat3(modelMatrix)*vec3(-position.z,0.,position.x); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const r = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 4).rotateX(-Math.PI / 2), m);
    scene.add(r);
    const part = basePart(r);
    part.show = (v) => { r.visible = v > 0.001; m.uniforms.uOpacity.value = v; return part; };
    part.glow = (v) => { m.uniforms.uGlow.value = v; return part; };
    if (o.at) part.place(o.at);
    if (o.tilt) r.rotation.set(...o.tilt.map((d) => THREE.MathUtils.degToRad(d)));
    return register(o.id, part);
  }

  // Camera rig. pose(i,t) = lerp(pose(i-1,t), shot i at t), so every move is a pure function of t and hands off without a pop.
  const shots = [];
  const sounds = [];
  const zoomBlurs = [];
  const v3 = (x) => new THREE.Vector3(x[0], x[1], x[2]);
  const resolveTarget = (target, offset) => {
    let p;
    if (Array.isArray(target)) p = v3(target);
    else if (typeof target === 'string') {
      if (!parts[target]) { issue(`camera target unknown: ${target}`); p = new THREE.Vector3(); }
      else p = parts[target].world();
    } else if (target && target.world) p = target.world();
    else p = new THREE.Vector3();
    if (offset) p.add(v3(offset));
    return p;
  };
  const addShot = (s) => {
    const shot = { move: 'dollyTo', over: 2.5, ease: 'inOutCubic', azimuth: 0, elevation: 8, distance: 8, fov: 38, roll: 0, orbit: 0, ...s };
    shot.start = timeOf(shot.at ?? 0);
    if (shot.move === 'cut') shot.over = 0.0001;
    if (shot.move === 'fastZoom') {
      shot.ease = shot.ease === 'inOutCubic' ? 'inOutQuint' : shot.ease;
      shot.over = s.over ?? 1.6;
      zoomBlurs.push({ start: shot.start, over: shot.over, strength: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : Math.min(s.blur ?? 0.7, 0.8) });
      sounds.push({ t: shot.start, kind: 'swell', dur: shot.over + 1.6, gain: s.soundGain ?? 1 });
    }
    if (shot.move === 'dollyTo' && shot.over >= 2.5 && s.sound !== false) sounds.push({ t: shot.start, kind: 'air', dur: shot.over + 0.8, gain: 0.5 });
    shots.push(shot);
    shots.sort((a, b) => a.start - b.start);
    return kit;
  };
  const angleLerp = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return a + d * k; };
  const poseOf = (s, t) => ({
    target: resolveTarget(s.target, s.offset),
    distance: s.distance,
    azimuth: s.azimuth + (s.orbit || 0) * Math.max(t - s.start, 0),
    elevation: s.elevation + (s.bob ? Math.sin(Math.max(t - s.start, 0) * 0.35) * s.bob : 0),
    fov: s.fov, roll: s.roll,
    screen: s.screen || [0, 0],
  });
  const evalCamera = (t) => {
    let pose = null;
    for (const s of shots) {
      if (t < s.start && pose) break;
      const next = poseOf(s, t);
      if (!pose) { pose = next; continue; }
      const k = (ease[s.ease] || ease.inOutCubic)(clamp01((t - s.start) / Math.max(s.over, 1e-3)));
      pose = {
        target: pose.target.clone().lerp(next.target, k),
        distance: Math.exp(THREE.MathUtils.lerp(Math.log(Math.max(pose.distance, 1e-4)), Math.log(Math.max(next.distance, 1e-4)), k)),
        azimuth: angleLerp(pose.azimuth, next.azimuth, k),
        elevation: THREE.MathUtils.lerp(pose.elevation, next.elevation, k),
        fov: THREE.MathUtils.lerp(pose.fov, next.fov, k),
        roll: THREE.MathUtils.lerp(pose.roll, next.roll, k),
        screen: [THREE.MathUtils.lerp(pose.screen[0], next.screen[0], k), THREE.MathUtils.lerp(pose.screen[1], next.screen[1], k)],
      };
    }
    if (!pose) pose = { target: new THREE.Vector3(), distance: 10, azimuth: 0, elevation: 10, fov: 38, roll: 0, screen: [0, 0] };
    const az = THREE.MathUtils.degToRad(pose.azimuth), el = THREE.MathUtils.degToRad(pose.elevation);
    camera.position.set(pose.target.x + pose.distance * Math.cos(el) * Math.sin(az), pose.target.y + pose.distance * Math.sin(el), pose.target.z + pose.distance * Math.cos(el) * Math.cos(az));
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.target);
    if (pose.roll) camera.rotateZ(THREE.MathUtils.degToRad(pose.roll));
    camera.fov = pose.fov;
    camera.near = Math.max(pose.distance * 0.015, 0.002);
    camera.far = Math.max(pose.distance * 900, 3000);
    camera.aspect = W() / H();
    if (pose.screen[0] || pose.screen[1]) camera.setViewOffset(W(), H(), -pose.screen[0] * W(), pose.screen[1] * H(), W(), H());
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    sky.scale.setScalar(Math.min(1, camera.far / 6e4));
    let z = 0;
    for (const b of zoomBlurs) { const k = clamp01((t - b.start) / b.over); z = Math.max(z, Math.pow(Math.sin(Math.PI * k), 2) * b.strength); }
    grade.uniforms.uZoom.value = z;
  };

  const lensState = { part: null, radius: 0, shadow: 0 };
  const lens = (o) => { lensState.part = o.at; lensState.radius = o.radius ?? 1; lensState.shadow = o.shadow ?? 0.7; lensState.strength = 1; return kit; };
  const lensAmount = (v) => { lensState.strength = v; return kit; };

  // Labels: DOM on top of the canvas, laid out each frame as a function of the camera only.
  const svgNS = 'http://www.w3.org/2000/svg';
  const leaderSvg = document.createElementNS(svgNS, 'svg');
  leaderSvg.setAttribute('class', 'leaders');
  overlay.appendChild(leaderSvg);
  function label(text, o = {}) {
    const el = document.createElement('div');
    el.className = 'lbl' + (o.big ? ' big' : '');
    const main = document.createElement('div'); main.className = 'lbl-main'; main.textContent = text; el.appendChild(main);
    let sub = null;
    if (o.sub) { sub = document.createElement('div'); sub.className = 'lbl-sub'; sub.textContent = o.sub; el.appendChild(sub); }
    overlay.appendChild(el);
    const line = document.createElementNS(svgNS, 'line');
    leaderSvg.appendChild(line);
    const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('r', '2.2'); leaderSvg.appendChild(dot);
    const l = { text, o, el, line, dot, main, sub, w: 0, h: 0, opacity: 1, id: o.id };
    l.set = (txt, s) => { if (txt != null) main.textContent = txt; if (s != null && sub) sub.textContent = s; l.w = 0; return l; };
    l.fade = (v) => { l.opacity = v; return l; };
    labels.push(l);
    if (o.id) parts[`label:${o.id}`] = l;
    return l;
  }
  function title(text, o = {}) {
    const el = document.createElement('div');
    el.className = 'ttl ' + (o.place ?? 'lower');
    const m = document.createElement('div'); m.className = 'ttl-main'; m.textContent = text; el.appendChild(m);
    if (o.sub) { const s = document.createElement('div'); s.className = 'ttl-sub'; s.textContent = o.sub; el.appendChild(s); }
    overlay.appendChild(el);
    const entry = { el, o };
    titles.push(entry);
    return { el, set: (txt) => { m.textContent = txt; } };
  }
  const titles = [];
  let lastPlaced = [];
  const layoutLabels = (t) => {
    const w = W(), h = H();
    const v = new THREE.Vector3();
    const placed = kit.__layoutHud();
    for (const e of titles) { const k = envelope(t, e.o.show ?? 0, e.o.hide, 0.55); if (k < 0.01) continue; const b = e.el; if (!e.w) { e.w = b.offsetWidth; e.h = b.offsetHeight; } const place = e.o.place ?? 'lower'; const tx = place === 'corner' ? w - 18 - e.w : 28; const ty = place === 'corner' ? h - 14 - e.h : place === 'upper' ? 24 : h - 26 - e.h; placed.push({ x: tx, y: ty, w: e.w, h: e.h, kind: 'title', name: b.textContent, op: k }); }
    lastPlaced = placed;
    for (const l of labels) {
      const showK = (l.o.show !== undefined ? envelope(t, l.o.show, l.o.hide, 0.45) : 1) * l.opacity;
      if (showK < 0.01) { l.el.style.opacity = '0'; l.line.style.opacity = '0'; l.dot.style.opacity = '0'; continue; }
      const at = l.o.at;
      let p3;
      if (Array.isArray(at)) p3 = v.set(at[0], at[1], at[2]);
      else if (typeof at === 'string' && parts[at]) p3 = v.copy(parts[at].world());
      else if (at && at.world) p3 = v.copy(at.world());
      else { if (typeof at === 'string') issue(`label target unknown: ${at}`); l.el.style.opacity = '0'; continue; }
      const anchorPart = typeof at === 'string' ? parts[at] : null;
      const cam3 = p3.clone().applyMatrix4(camera.matrixWorldInverse);
      const ndc = p3.clone().project(camera);
      if (cam3.z > 0 || Math.abs(ndc.x) > 1.25 || Math.abs(ndc.y) > 1.25) { l.el.style.opacity = '0'; l.line.style.opacity = '0'; l.dot.style.opacity = '0'; continue; }
      if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
      const x = (ndc.x * 0.5 + 0.5) * w, y = (-ndc.y * 0.5 + 0.5) * h;
      let screenR = 0;
      if (anchorPart?.radius) { const d = -cam3.z; screenR = (anchorPart.radius / d) * (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)); }
      const side = l.o.side ?? (x > w * 0.58 ? 'left' : 'right');
      const gap = 28 + screenR * 0.72;
      const rise = l.o.rise ?? 22 + screenR * 0.6;
      let lx = side === 'left' ? x - gap - l.w : x + gap;
      let ly = y - rise - l.h * 0.5;
      const clampX = (v) => Math.min(w - l.w - 14, Math.max(14, v)), clampY = (v) => Math.min(h - l.h - 14, Math.max(14, v));
      const free = (ax, ay) => !placed.some((q) => ax < q.x + q.w + 6 && ax + l.w + 6 > q.x && ay < q.y + q.h + 4 && ay + l.h + 4 > q.y);
      const other = side === 'left' ? x + gap : x - gap - l.w;
      const step = l.h + 6;
      const tries = [[lx, ly], [other, ly], [lx, ly + step], [lx, ly - step], [other, ly + step], [other, ly - step], [lx, ly + 2 * step], [lx, ly - 2 * step], [other, ly + 2 * step], [other, ly - 2 * step], [lx, ly + 3 * step], [other, ly + 3 * step], [lx, ly - 3 * step], [other, ly - 3 * step]];
      let found = null;
      for (const [ax, ay] of tries) { const cx = clampX(ax), cy = clampY(ay); if (free(cx, cy)) { found = [cx, cy]; break; } }
      if (!found) { lx = clampX(lx); ly = clampY(ly); } else [lx, ly] = found;
      placed.push({ x: lx, y: ly, w: l.w, h: l.h, kind: 'label', name: l.main.textContent, op: showK });
      l.el.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`;
      l.el.style.opacity = String(showK);
      const anchorX = lx + (lx > x ? 0 : l.w), anchorY = ly + l.h * 0.5;
      const dirx = anchorX - x, diry = anchorY - y, dl = Math.hypot(dirx, diry) || 1;
      const sx = x + (dirx / dl) * screenR * 0.82, sy = y + (diry / dl) * screenR * 0.82;
      l.line.setAttribute('x1', sx.toFixed(1)); l.line.setAttribute('y1', sy.toFixed(1));
      l.line.setAttribute('x2', anchorX.toFixed(1)); l.line.setAttribute('y2', anchorY.toFixed(1));
      l.dot.setAttribute('cx', sx.toFixed(1)); l.dot.setAttribute('cy', sy.toFixed(1));
      l.line.style.opacity = String(showK * 0.75); l.dot.style.opacity = String(showK);
    }
    for (const e of titles) {
      const k = envelope(t, e.o.show ?? 0, e.o.hide, 0.55);
      e.el.style.opacity = String(k);
      e.el.style.transform = `translateY(${((1 - k) * 8).toFixed(1)}px)`;
    }
  };

  function inset(o) {
    const cam = new THREE.PerspectiveCamera(o.fov ?? 6, 1, 0.01, 2e5);
    const entry = { o, cam, k: 1 };
    const frame = document.createElement('div'); frame.className = 'inset-frame';
    const cap = document.createElement('div'); cap.className = 'inset-cap'; cap.textContent = o.title ?? ''; frame.appendChild(cap);
    overlay.appendChild(frame);
    entry.frame = frame;
    insets.push(entry);
    return entry;
  }
  const drawInsets = (t) => {
    const w = W(), h = H();
    for (const e of insets) {
      const k = e.o.show !== undefined ? envelope(t, e.o.show, e.o.hide, 0.5) : 1;
      e.frame.style.opacity = String(k);
      if (k < 0.02) continue;
      const size = Math.round((e.o.size ?? 0.34) * h);
      const margin = 14;
      const corner = e.o.corner ?? 'tr';
      const x = corner.includes('l') ? margin : w - size - margin;
      const yTop = corner.includes('b') ? h - size - margin : margin;
      e.frame.style.cssText += `;left:${x}px;top:${yTop}px;width:${size}px;height:${size}px`;
      const from = resolveTarget(e.o.from, e.o.fromOffset);
      const look = resolveTarget(e.o.look);
      e.cam.position.copy(from); e.cam.up.set(0, 1, 0); e.cam.lookAt(look);
      // Fit the subject automatically and leave out the part the view is taken from, so an inset cannot show the inside of a planet or a blank patch.
      const dist = from.distanceTo(look);
      const lookPart = typeof e.o.look === 'string' ? parts[e.o.look] : null;
      if (lookPart?.radius) e.cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan((lookPart.radius * 1.7) / Math.max(dist, 1e-3)));
      else if (typeof e.o.fov === 'function') e.cam.fov = e.o.fov(t);
      e.cam.aspect = 1; e.cam.near = Math.max(dist * 0.05, 0.002); e.cam.far = 2e5; e.cam.updateProjectionMatrix(); e.cam.updateMatrixWorld();
      const fromPart = typeof e.o.from === 'string' ? parts[e.o.from] : null;
      const fromWasVisible = fromPart?.object.visible;
      if (fromPart) fromPart.object.visible = false;
      const y = h - yTop - size;
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, size, size);
      renderer.setScissor(x, y, size, size);
      const prevTM = renderer.toneMapping, prevCS = renderer.outputColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      if (e.o.hide3d) e.o.hide3d.forEach((n) => { if (parts[n]) parts[n].object.visible = false; });
      skyBackup = sky.position.clone(); sky.position.copy(e.cam.position);
      renderer.render(scene, e.cam);
      if (fromPart) fromPart.object.visible = fromWasVisible;
      sky.position.copy(skyBackup);
      renderer.toneMapping = prevTM; renderer.outputColorSpace = prevCS;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
    }
  };
  let skyBackup = null;

  const kit = {
    THREE, ease, smooth, clamp01, lerp: (a, b, k) => a + (b - a) * k, rng: mulberry, scene, camera, renderer, parts, uTime: uT, uSun, noiseGLSL: NOISE_GLSL, uRes,
    duration, moments, at: timeOf, p: progress, env: envelope,
    stage, planet, sun, glow, path, orbitPath, flow, dust, mesh, group, organic, tube, instances, disk, label, title, inset, lens, lensAmount,
    material: pbrMaterial, shot: addShot, shots: (list) => { list.forEach(addShot); return kit; }, sunAt: (p) => { uSun.value.set(p[0], p[1], p[2]); if (kit.sunLight) kit.sunLight.position.set(p[0], p[1], p[2]); return kit; },
    add: (o) => { scene.add(o); return o; },
    addPart: (id, object) => { scene.add(object); const part = basePart(object); part.show = (v) => { object.visible = v > 0.001; return part; }; return register(id, part); },
    onFrame: (fn) => { tickers.push(fn); },
    post: { set: (o) => { if (o.exposure !== undefined) grade.uniforms.uExposure.value = o.exposure; if (o.bloom !== undefined) bloomPass.strength = o.bloom; if (o.threshold !== undefined) bloomPass.threshold = o.threshold; if (o.vignette !== undefined) grade.uniforms.uVignette.value = o.vignette; if (o.radius !== undefined) bloomPass.radius = o.radius; return kit; } },
    sound: (m, kind = 'swell', dur = 3, gain = 1) => { sounds.push({ t: timeOf(m), kind, dur, gain }); return kit; },
    issue,
  };

  kit.__frame = (t, sceneRender) => {
    uT.value = t;
    grade.uniforms.uT.value = t;
    grade.uniforms.uFade.value = ease.inOutSine(clamp01(t / 0.7));
    grade.uniforms.uAspect.value = W() / H();
    if (sceneRender) sceneRender(t);
    scene.updateMatrixWorld(true);
    for (const f of tickers) f(t);
    evalCamera(t);
    if (lensState.part) {
      const v = resolveTarget(lensState.part).project(camera);
      grade.uniforms.uLensPos.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      const worldToNdc = (r) => {
        const d = resolveTarget(lensState.part).distanceTo(camera.position);
        return (r / d) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.5;
      };
      grade.uniforms.uLensR.value = worldToNdc(lensState.radius) * (lensState.strength ?? 1);
      grade.uniforms.uLensShadow.value = worldToNdc(lensState.radius * lensState.shadow) * (lensState.strength ?? 1);
    } else grade.uniforms.uLensR.value = 0;
    composer.render();
    drawInsets(t);
    layoutLabels(t);
  };
  kit.theme = theme;
  kit.__rects = () => lastPlaced;
  kit.__sounds = () => sounds;
  kit.__shots = () => shots.map((s) => ({ at: s.at, move: s.move, start: s.start }));
  kit.__issues = () => issues;
  kit.__pixelStats = () => {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let hash = 2166136261, sum = 0, sum2 = 0, lit = 0, n = 0;
    for (let i = 0; i < buf.length; i += 4 * 7) {
      const l = (buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722) / 255;
      sum += l; sum2 += l * l; if (l > 0.08) lit++; n++;
      hash = Math.imul(hash ^ buf[i], 16777619); hash = Math.imul(hash ^ buf[i + 1], 16777619); hash = Math.imul(hash ^ buf[i + 2], 16777619);
    }
    const mean = sum / n;
    return { hash: hash >>> 0, mean, std: Math.sqrt(Math.max(sum2 / n - mean * mean, 0)), lit: lit / n };
  };
  kit.__syncCost = () => {
    const gl = renderer.getContext();
    const b = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
  };
  kit.__resize = () => {
    renderer.setSize(W(), H(), false);
    composer.setSize(W(), H());
    uRes.value.set(W() * Q.dpr, H() * Q.dpr);
    for (const l of labels) l.w = 0;
  };
  // Race additions: scene state for truth checks, declared parameters, and domain functions that compute reality.
  const declared = {};
  kit.param = (name, o = {}) => { const d = typeof o === 'number' ? { default: o } : o; declared[name] = d; const v = timing?.params?.[name]; return v === undefined ? d.default : v; };
  kit.__params = () => declared;
  const norm3 = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const keyed = (keys, t) => {
    const k = keys;
    if (t <= k[0].t) { const rate = k.length > 1 ? (k[1].a - k[0].a) / Math.max(k[1].t - k[0].t, 0.01) : 20; return k[0].a + (t - k[0].t) * rate; }
    for (let i = 0; i < k.length - 1; i++) if (t <= k[i + 1].t) { const u = (t - k[i].t) / Math.max(k[i + 1].t - k[i].t, 0.01); return k[i].a + (k[i + 1].a - k[i].a) * ease.inOutSine(u); }
    const n = k.length; const rate = n > 1 ? (k[n - 1].a - k[n - 2].a) / Math.max(k[n - 1].t - k[n - 2].t, 0.01) : 20;
    return k[n - 1].a + (t - k[n - 1].t) * rate * 0.35;
  };
  const makeKeys = (moments, angleOf) => {
    const list = Object.entries(moments).map(([m, name]) => { if (angleOf[name] === undefined) issue('astro: unknown name ' + name); return { t: timeOf(m), a: angleOf[name] ?? 0 }; }).sort((x, y) => x.t - y.t);
    for (let i = 1; i < list.length; i++) while (list[i].a <= list[i - 1].a) list[i].a += 360;
    return list;
  };
  const partOf = (x) => (typeof x === 'string' ? parts[x] : x);
  kit.astro = {
    moonOrbit(o) {
      const earth = partOf(o.earth), moon = partOf(o.moon), R = o.radius ?? 6, s = norm3(o.sunDir ?? [1, 0, 0]), far = o.sunFar ?? 400;
      const keys = makeKeys(o.phases ?? {}, { new: 0, 'first-quarter': 90, full: 180, 'last-quarter': 270 });
      if (!earth || !moon) issue('astro.moonOrbit: unknown earth or moon part');
      const angle = (t) => keyed(keys, t);
      const api = {
        angle, litFraction: (t) => (1 - Math.cos(THREE.MathUtils.degToRad(angle(t)))) / 2,
        phaseName: (t) => { const a = ((angle(t) % 360) + 360) % 360; return a < 22.5 || a >= 337.5 ? 'New moon' : a < 67.5 ? 'Waxing crescent' : a < 112.5 ? 'First quarter' : a < 157.5 ? 'Waxing gibbous' : a < 202.5 ? 'Full moon' : a < 247.5 ? 'Waning gibbous' : a < 292.5 ? 'Last quarter' : 'Waning crescent'; },
        update(t) {
          const e = earth.world(), a = THREE.MathUtils.degToRad(angle(t));
          moon.place([e.x + R * (s[0] * Math.cos(a) + s[2] * Math.sin(a)), e.y + R * s[1], e.z + R * (s[2] * Math.cos(a) - s[0] * Math.sin(a))]);
          kit.sunAt([e.x + s[0] * far, e.y + s[1] * far, e.z + s[2] * far]);
          return api;
        },
      };
      return api;
    },
    seasons(o) {
      const earth = partOf(o.earth), sunPart = partOf(o.sun), R = o.radius ?? 10, tilt = o.tiltDeg ?? 23.44;
      const keys = makeKeys(o.moments ?? {}, { 'march-equinox': 90, 'june-solstice': 180, 'september-equinox': 270, 'december-solstice': 360 });
      if (!earth) issue('astro.seasons: unknown earth part');
      const angle = (t) => keyed(keys, t);
      const lat = (t) => tilt * Math.cos(THREE.MathUtils.degToRad(angle(t) - 180));
      const api = {
        angle, subsolarLat: lat, tiltDeg: tilt, northLeansToSun: (t) => lat(t) > 0,
        season(t, hemi = 'north') {
          const a = ((angle(t) % 360) + 360) % 360; const s = a >= 135 && a < 225 ? 'Summer' : a >= 225 && a < 315 ? 'Autumn' : a >= 45 && a < 135 ? 'Spring' : 'Winter';
          return hemi === 'north' ? s : { Summer: 'Winter', Winter: 'Summer', Spring: 'Autumn', Autumn: 'Spring' }[s];
        },
        update(t) {
          const c = sunPart ? sunPart.world() : new THREE.Vector3(), a = THREE.MathUtils.degToRad(angle(t));
          earth.place([c.x + R * Math.cos(a), c.y, c.z - R * Math.sin(a)]);
          earth.object.rotation.set(0, 0, -THREE.MathUtils.degToRad(tilt));
          kit.sunAt([c.x, c.y, c.z]);
          return api;
        },
      };
      return api;
    },
  };
  // Everyday objects drawn in our own style, so a student's interest never needs a third-party image.
  kit.prop = (o = {}) => {
    const kind = o.kind ?? 'plain-ball', r = o.radius ?? 0.5;
    const paint = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    let geometry = new THREE.SphereGeometry(r, 48, 32), color = '#d8d2c6', material = 'ceramic', map = null;
    if (kind === 'basketball') {
      color = '#ffffff'; material = 'matte';
      map = paint(1024, 512, (g, w, h) => {
        g.fillStyle = '#c8682c'; g.fillRect(0, 0, w, h);
        const rng = mulberry(11); g.fillStyle = 'rgba(70,30,10,.16)'; for (let i = 0; i < 9000; i++) g.fillRect(rng() * w, rng() * h, 1.6, 1.6);
        g.strokeStyle = '#1c120c'; g.lineWidth = 9;
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
        for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        for (const cx of [0, w / 2, w]) { g.beginPath(); for (let y = 0; y <= h; y += 6) { const u = (y / h) * Math.PI; const x = cx + Math.sin(u) * w * 0.12 * (y < h / 2 ? 1 : 1); if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); g.beginPath(); for (let y = 0; y <= h; y += 6) { const u = (y / h) * Math.PI; const x = cx - Math.sin(u) * w * 0.12; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      });
    } else if (kind === 'onion') {
      const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40, y = -r + 2.35 * r * u; const body = Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.1 * r) / (1.02 * r), 2))) * r; const neck = 0.12 * r * Math.max(0, 1 - (y - 0.8 * r) / (0.55 * r)); pts.push(new THREE.Vector2(Math.max(y > 0.8 * r ? Math.max(neck, 0.02 * r) : body, 0.001), y)); }
      geometry = new THREE.LatheGeometry(pts, 48); color = '#ffffff'; material = 'wet';
      map = paint(1024, 512, (g, w, h) => { g.fillStyle = '#c99a58'; g.fillRect(0, 0, w, h); const rng = mulberry(5); for (let i = 0; i < 70; i++) { g.strokeStyle = 'rgba(' + (120 + rng() * 40) + ',' + (72 + rng() * 30) + ',30,.55)'; g.lineWidth = 2 + rng() * 5; const x = rng() * w; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (rng() - .5) * 40, h / 2, x, h); g.stroke(); } });
    } else if (kind === 'melon') {
      color = '#ffffff'; material = 'wet';
      map = paint(1024, 512, (g, w, h) => { g.fillStyle = '#7d9a55'; g.fillRect(0, 0, w, h); const rng = mulberry(9); for (let i = 0; i < 16; i++) { const x = (i + .5) / 16 * w; g.strokeStyle = '#37502a'; g.lineWidth = 16 + rng() * 10; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (rng() - .5) * 30, h / 2, x, h); g.stroke(); } });
    } else if (kind === 'stone') {
      geometry = new THREE.IcosahedronGeometry(r, 4); color = '#8e8a81'; material = 'matte';
      const p = geometry.attributes.position, rng = mulberry(3), a = rng() * 9, b = rng() * 9;
      for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(p.getX(i) * 7 / r + a) * Math.cos(p.getY(i) * 5 / r + b) + 0.05 * Math.sin(p.getZ(i) * 13 / r); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.86, p.getZ(i) * k); }
      geometry.computeVertexNormals();
    } else if (kind !== 'plain-ball') issue('prop: unknown kind ' + kind);
    const part = kit.mesh({ id: o.id, geometry, material, color, at: o.at });
    if (map) { part.material.map = map; part.material.needsUpdate = true; }
    part.radius = r; part.kind = kind;
    return part;
  };
  kit.__snapshot = (t) => {
    const r = (x) => +x.toFixed(4);
    const out = { t, parts: {}, labels: [], titles: [], sun: uSun.value.toArray().map(r), camera: camera.position.toArray().map(r) };
    for (const [id, p] of Object.entries(parts)) {
      if (id.startsWith('label:') || !p.object) continue;
      const o = p.object; o.updateWorldMatrix(true, false);
      let vis = o.visible; o.traverseAncestors((a) => { if (!a.visible) vis = false; });
      const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(o.matrixWorld);
      const scale = new THREE.Vector3().setFromMatrixScale(o.matrixWorld);
      const ndc = pos.clone().project(camera);
      out.parts[id] = { p: pos.toArray().map(r), up: up.toArray().map(r), s: scale.toArray().map(r), v: vis, ndc: [r(ndc.x), r(ndc.y)], preset: p.preset ?? null, radius: p.radius ?? null };
    }
    for (const l of labels) {
      const op = +(l.el.style.opacity || 0);
      let ndc = null;
      const at = l.o.at;
      const w = typeof at === 'string' ? parts[at]?.world?.() : Array.isArray(at) ? new THREE.Vector3(at[0], at[1], at[2]) : null;
      if (w) { const v = w.clone().project(camera); ndc = [r(v.x), r(v.y)]; }
      out.labels.push({ text: l.main.textContent, sub: l.sub?.textContent ?? null, op: r(op), at: typeof at === 'string' ? at : null, ndc });
    }
    for (const e of titles) out.titles.push({ text: e.el.textContent, op: r(+(e.el.style.opacity || 0)) });
    return out;
  };
  addStudio(kit, { scene, register, basePart, pbrMaterial, fadeMaterial, uT, overlay, W, H, issue, tickers, parts });
  // Mean display luminance over a grid of tiles and the whole frame, for the flash check.
  kit.__tiles = (cols = 8, rows = 4) => {
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const sums = new Float64Array(cols * rows), counts = new Float64Array(cols * rows);
    let all = 0, n = 0;
    const lin = (c) => Math.pow(c / 255, 2.2);
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * lin(buf[i]) + 0.7152 * lin(buf[i + 1]) + 0.0722 * lin(buf[i + 2]);
      const k = Math.min(rows - 1, Math.floor((y / h) * rows)) * cols + Math.min(cols - 1, Math.floor((x / w) * cols));
      sums[k] += l; counts[k]++; all += l; n++;
    }
    return { mean: all / n, tiles: Array.from(sums, (v, i) => v / Math.max(counts[i], 1)) };
  };
  kit.__info = () => { let tris = 0, meshes = 0; scene.traverse((o) => { if (!o.isMesh || !o.visible) return; let vis = true; o.traverseAncestors((a) => { if (!a.visible) vis = false; }); if (!vis) return; const g = o.geometry; const c = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += c * (o.isInstancedMesh ? o.count : 1); meshes++; }); return { tris: Math.round(tris), meshes }; };
  return kit;
}

