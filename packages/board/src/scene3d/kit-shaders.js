import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p){ p=fract(p*vec3(.1031,.11369,.13787)); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

export const GRADE_SHADER = {
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

export const PLANET_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vLocal;
  void main(){ vUv=uv; vLocal=position; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
export const PLANET_FS = /* glsl */ `
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

export const ATMO_VS = /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
export const ATMO_FS = /* glsl */ `
  uniform vec3 uColor,uSun; uniform float uPower,uOpacity,uFmax; varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 N=normalize(vN),V=normalize(cameraPosition-vW),L=normalize(uSun-vW);
    float f=clamp(dot(-N,V),0.,1.);
    float k=pow(clamp(f/uFmax,0.,1.),2.4);
    float nl=dot(N,L);
    float sun=smoothstep(-.3,.45,nl);
    float sunset=smoothstep(.34,.0,abs(nl));
    vec3 c=mix(uColor,vec3(1.,.5,.26),sunset*.7);
    gl_FragColor=vec4(c*k*sun*uPower*1.5*uOpacity,1.);
  }`;

export const SUN_FS = /* glsl */ `
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

export const CORONA_FS = /* glsl */ `
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

export const RING_FS = /* glsl */ `
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

export const RIBBON_VS = /* glsl */ `
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
export const RIBBON_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uReveal,uFrom,uOpacity,uGlow,uDash,uFlow,uHead,uT; varying float vU,vSide;
  void main(){
    if(vU>uReveal||vU<uFrom) discard;
    float edge=smoothstep(1.,.45,abs(vSide));
    float a=edge*uOpacity;
    if(uDash>0.){ a*=step(.5,fract(vU*uDash-uT*uFlow)); }
    float head=uHead*smoothstep(uReveal-.04,uReveal,vU)*step(uReveal,.999);
    gl_FragColor=vec4(uColor*(.72+min(uGlow,3.)*.3+head*4.)*a,a);
  }`;
