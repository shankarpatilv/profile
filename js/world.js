/* =====================================================================
   world.js: ONE Three.js scene, ONE canvas, ONE Points mesh for the whole
   world (a single draw call), plus a shader-drawn drafting grid.
   The camera travels a spline through every zone, driven by scroll.
   ===================================================================== */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SYSTEMS, ZONES, ROAD_Z } from './zones.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createBuilt } from './built.js';
import { createPost } from './post.js';
import { createFloor } from './floor.js';
import { createParticles } from './particles.js';
import { createGovernor } from './quality.js';
// world.js is imported dynamically by main.js, so if the CDN fails the page falls back to the static version

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a)*t;
const smooth = (a, b, v) => { const t = clamp((v - a)/(b - a)); return t*t*(3 - 2*t); };
const easeIO = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;        // power2.inOut
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255)/255, (n >> 8 & 255)/255, (n & 255)/255]; };

/* ---------- shaders ---------- */
const VS = `
precision highp float;
uniform mat4 modelViewMatrix, projectionMatrix;
uniform float uT, uPx, uK, uIntro, uDim, uRush, uBurst, uHalo, uHaloS, uHaloA, uHover, uFogN, uFogF, uAsm, uMouseOn, uAspect, uNight, uFlowR, uFlowP;
uniform float uDis[16];
uniform vec3 uZC[16];
uniform vec2 uMouse;
uniform vec3 uRight, uUp;
uniform float uLift[16];
uniform vec4 uNode[32];
uniform vec4 uEdge[32];
uniform vec3 uLine, uCyan, uAmber, uCoral, uFresh;
uniform vec4 uNB[32];   // per-node build 0..1 (js/built.js)
uniform vec4 uNF[32];   // per-node flash 0..1 (a part doing its job, scenarios)
uniform float uTrT, uTrDim;   // traffic clock (scenarios can speed it up) and strength (they dim it)
uniform float uBuiltA, uAmberGain, uCoralGain;
uniform vec3 uAmberTint;
uniform float uMirror;   // 1 while the floor's mirror renders: dust is left out of the reflection
uniform vec4 uSize;   // line, traffic, road, dust
uniform vec2 uSize2;  // area, beacon
attribute vec3 position;   // start point (or the point itself)
attribute vec3 aB;         // end point for anything that travels
attribute vec4 aInfo;      // kind, zone, node or edge index, random
attribute vec2 aMove;      // phase, speed
attribute vec3 aScatter;   // where the point starts before the opening assembly
varying vec4 vCol;
varying vec3 vHot;    // HDR gain: amber and coral go above white so bloom picks out only them
float pick(vec4 v, float c){ return c < .5 ? v.x : c < 1.5 ? v.y : c < 2.5 ? v.z : v.w; }
float nodeSt(float i){ if (i < 0.) return 0.; return pick(uNode[int(floor(i/4.))], mod(i, 4.)); }
float nodeF(float i){ if (i < 0.) return 0.; return pick(uNF[int(floor(i/4.))], mod(i, 4.)); }
float nodeB(float i){ if (i < 0.) return 0.; return pick(uNB[int(floor(i/4.))], mod(i, 4.)); }
float edgeSt(float i){ if (i < 0.) return 0.; return pick(uEdge[int(floor(i/4.))], mod(i, 4.)); }
void main(){
  float kind = aInfo.x, lift = uLift[int(aInfo.y + .5)], r = aInfo.w;
  vec3 p = position; float size = uSize.x; vec3 col = uLine; float a = .82, stv = 0.;
  if (kind < .5){                       // structure linework
    float st = nodeSt(aInfo.z); stv = st; p.y *= lift;
    if (st > 1.5 && st < 2.5){ col = uCyan; a = .3; }              // capacity that is drawn but not built yet
    else if (st > .5 && st < 1.5){ col = uCoral; size *= 1.25; a = .95; }
    else if (st > 3.5){ col = uAmber; size *= 1.3; a = 1.; }
    else if (st > 2.5){ col = uFresh; a = 1.; }
    if (st < .5) a *= mix(1., uBuiltA, nodeB(aInfo.z));          // once built, the drawing steps back
    float fl = nodeF(aInfo.z); if (fl > .01 && size > 0.){ col = mix(col, vec3(1.), fl); size *= 1. + fl*.5; a = max(a, fl); }   // a part doing its job flashes white
  } else if (kind < 1.5){               // traffic inside a system
    float es = edgeSt(aInfo.z), u = fract(aMove.x + uTrT*aMove.y);
    if (es > .5 && es < 1.5) size = 0.;
    else if (es > 1.5 && es < 2.5) u = .04 + aMove.x*.24;       // stuck, waiting at the start
    else if (es > 3.5) u = .7 + aMove.x*.26;                    // stuck, waiting at the end
    p = mix(position, aB, u); p.y *= lift; col = uAmber; size = uSize.y; a = .92*uTrDim;
  } else if (kind < 2.5){               // the thread that connects every zone
    float u = fract(aMove.x + (uT + uRush)*aMove.y); p = mix(position, aB, u); col = uAmber; size = uSize.z*(1. + uBurst*.6); a = .7 + uBurst*.3;
  } else if (kind < 3.5){               // ambient dust
    if (uMirror > .5){ gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; vCol = vec4(0.); vHot = vec3(0.); return; }
    p += vec3(sin(uT*.13 + r*40.), cos(uT*.11 + r*30.), sin(uT*.09 + r*20.))*.28; col = uCyan; size = uSize.w; a = .3;
  } else if (kind < 4.5){               // dashed zones on the plane
    p.y *= lift; col = uCyan; size = uSize2.x; a = .5;
  } else if (kind < 5.5){               // the destination beacon
    float pulse = .55 + .45*sin(uT*2.2 + r*6.283); col = uAmber; size = uSize2.y*pulse*(1. + uBurst*1.4); a = 1.;
  } else if (kind < 6.5){               // the dashed "next" marker
    col = uAmber; size = uSize2.x*1.2; a = .8;
  } else if (kind < 7.5){               // ripples spreading out from the destination
    float u = fract(uT*.3 + aMove.x); p = position + aB*u*(2.6 + uBurst*16.); col = uAmber; size = uSize2.y*.5*(1. + uBurst); a = (1. - u)*(.85 + uBurst*.15);
  } else {                              // the column of light rising from it
    float u = fract(uT*.2 + aMove.x); p = position + vec3(0., u*4.6*(1. + uBurst*3.2), 0.); col = uAmber; size = uSize2.x*1.3*(1. + uBurst*.8); a = (1. - u)*(.75 + uBurst*.25);
  }
  // systems swirl together as you approach, loosen as you leave, and drift into stardust far behind you
  if (kind < 1.5 || (kind > 3.5 && kind < 4.5)){
    int zi = int(aInfo.y + .5); float dis = uDis[zi], loose = (1. - lift)*uAsm + dis*4.;
    if (loose > .001){ vec3 c0 = uZC[zi], rd = normalize(vec3(sin(r*91.7 + 1.3), .55 + .45*cos(r*47.3), sin(r*23.1 + .7)));
      p += rd*loose*(.5 + r);
      float ang = loose*.32 + dis*uT*.12; vec2 q = p.xz - c0.xz; q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang))*q; p.xz = c0.xz + q;
      a *= 1. - min(.55, (1. - lift)*.45 + dis*.35); }
  }
  // the night sky: the dust becomes twinkling stars
  if (kind > 2.5 && kind < 3.5){ a = mix(a, .35 + .55*(.5 + .5*sin(uT*1.6 + r*60.)), uNight); size *= 1. + uNight*.55; col = mix(col, vec3(.86, .9, 1.), uNight*.6); }
  // the cursor bends the traffic and the dust around it, like water around a hand
  if ((kind > .5 && kind < 3.5) && uMouseOn > .01){ vec4 cp = projectionMatrix*modelViewMatrix*vec4(p, 1.); vec2 dv = cp.xy/cp.w - uMouse; dv.x *= uAspect; float dl = length(dv);
    float f = (1. - smoothstep(0., uFlowR, dl))*uMouseOn; if (f > 0.){ vec2 nd = dv/max(dl, .001); p += (uRight*nd.x + uUp*nd.y)*f*cp.w*uFlowP; } }
  // hovering a part lights it amber before you click it
  bool hov = kind < .5 && aInfo.z > -.5 && abs(aInfo.z - uHover) < .5;
  if (hov && size > 0.){ col = mix(col, uAmber, .8); size *= 1.2; a = 1.; }
  // amber (live traffic) and coral (failures) are drawn brighter than white, so bloom picks out only them
  vHot = vec3(1.); if (uHalo < .5){ if ((kind > .5 && kind < 2.5) || kind > 4.5 || (kind < .5 && (stv > 3.5 || hov))) vHot = uAmberGain*uAmberTint; else if (kind < .5 && stv > .5 && stv < 1.5) vHot = vec3(uCoralGain); }
  // the glow pass keeps only what is amber, drawn large and faint
  if (uHalo > .5){ bool amber = (kind > .5 && kind < 2.5) || kind > 4.5 || (kind < .5 && (stv > 3.5 || hov)); if (!amber) size = 0.; size *= uHaloS; a *= uHaloA; col = uAmber*uDim; }
  p = mix(p + aScatter, p, uIntro);
  vec4 mv = modelViewMatrix*vec4(p, 1.);
  gl_Position = projectionMatrix*mv;
  gl_PointSize = size*uPx*clamp(uK/max(-mv.z, .1), .32, 2.2);
  // distance haze: far zones fade into the blue
  float haze = smoothstep(uFogN, uFogF, -mv.z); a *= 1. - haze*(kind > 2.5 && kind < 3.5 ? 1. : .82);
  vCol = vec4(col*uDim, a);
}`;
const FS = `
precision mediump float;
uniform highp float uHalo, uGain;
varying vec4 vCol;
varying vec3 vHot;
vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c + .055)/1.055, vec3(2.4)), step(.04045, c)); }
void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
  float f = uHalo > .5 ? exp(-d*d*16.) : smoothstep(.5, .08, d); gl_FragColor = vec4(toLinear(vCol.rgb*vCol.a*f*uGain)*vHot, 1.); }`;   // additive: alpha is applied in sRGB, like the original look
export function createWorld({ canvas, mobile, reducedMotion, onTele, onLine, onRev, onArrive = () => {}, onBuild = () => {} }){
  const W0 = () => innerWidth, H0 = () => innerHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:false, stencil:false, powerPreference:'high-performance' });
  renderer.setClearColor(CONFIG.colors.deep || '#0A2152', 1);
  const DPR = Math.min(devicePixelRatio || 1, mobile ? CONFIG.dpr.mobile : CONFIG.dpr.desktop);
  renderer.setPixelRatio(DPR);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, W0()/H0(), .1, 400);
  // quality tier: phones get the phone tier; desktops medium unless CONFIG or ?quality= says high
  const qp = (location.search.match(/[?&]quality=(high|medium)/) || [])[1], fixed = qp || (CONFIG.quality.tier !== 'auto' ? CONFIG.quality.tier : null);
  const tier = mobile ? 'phone' : (fixed === 'high' ? 'high' : 'medium');
  const post = createPost({ renderer, scene, camera, mobile, tier, reducedMotion });
  // choreography values the GSAP timelines animate (js/config.js → choreo)
  const cam = { intro:reducedMotion ? 0 : 1, nudge:0, focus:0 }, focusP = new THREE.Vector3();
  const gs = window.gsap, CH = CONFIG.choreo;
  if (gs && !reducedMotion) gs.to(cam, { intro:0, duration:CH.intro.duration, delay:CH.intro.delay, ease:CH.intro.ease });
  else cam.intro = 0;
  const lin = h => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };   // brand hex → linear light

  /* ---------- the sky: the same radial gradient the page used to paint in CSS, now behind the 3D ---------- */
  const skyMat = new THREE.RawShaderMaterial({ depthTest:false, depthWrite:false,
    uniforms:{ uC0:{ value:new THREE.Vector3(...hex('#173d88')) }, uC1:{ value:new THREE.Vector3(...hex('#0F2E6B')) }, uC2:{ value:new THREE.Vector3(...hex('#0A2152')) } },
    vertexShader:'precision highp float; attribute vec3 position; varying vec2 vUv; void main(){ vUv = position.xy*.5 + .5; gl_Position = vec4(position.xy, 1., 1.); }',
    fragmentShader:`precision highp float; uniform vec3 uC0, uC1, uC2; varying vec2 vUv;
      vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c + .055)/1.055, vec3(2.4)), step(.04045, c)); }
      void main(){ vec2 q = vec2((vUv.x - .6)/1.1, (1. - vUv.y)/.9); float d = length(q);      // radial-gradient(110% 90% at 60% 0%)
        vec3 c = d < .55 ? mix(uC0, uC1, d/.55) : mix(uC1, uC2, clamp((d - .55)/.45, 0., 1.));
        gl_FragColor = vec4(toLinear(c), 1.); }` });
  const skyGeo = new THREE.BufferGeometry(); skyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]), 3));
  const skyMesh = new THREE.Mesh(skyGeo, skyMat); skyMesh.frustumCulled = false; skyMesh.renderOrder = -100; skyMesh.layers.set(1); scene.add(skyMesh);
  camera.layers.enable(1);   // layer 1: things the floor's mirror must not see (the sky, contact shadows)

  /* ---------- light: a studio HDRI for reflections (streams in; the scene is usable before it arrives) and a cool key ---------- */
  const L = CONFIG.light;
  scene.environmentIntensity = L.envIntensity; scene.environmentRotation.set(0, L.envRotation, 0);
  const loadEnv = () => new HDRLoader().load(L.env, tex => { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose(); },
    undefined, err => console.warn('Environment map unavailable:', err));
  loadEnv();
  const key = new THREE.DirectionalLight(L.key.color, L.key.intensity); key.position.set(...L.key.position); scene.add(key);

  /* ---------- registries: every node and edge in the world gets an index ---------- */
  const zoneIndex = {}; ZONES.forEach((z, i) => zoneIndex[z.id] = i);
  const NODES = [], EDGES = [], nodeOf = {}, edgeOf = {};
  ZONES.forEach((z, zi) => { if (!z.sys) return; const S = SYSTEMS[z.sys];
    Object.entries(S.nodes).forEach(([id, n]) => { const k = NODES.length; nodeOf[z.id + ':' + id] = k;
      NODES.push({ zone:zi, zid:z.id, id, n, x:n[0] + z.at[0], z:n[1] + z.at[1], label:n[5], hidden:!!n[6] }); });
    (S.edges ? S.edges.split(' ') : []).forEach(e => { const [a, b] = e.split('-'); const k = EDGES.length; edgeOf[z.id + ':' + e] = k;
      EDGES.push({ zone:zi, zid:z.id, a:nodeOf[z.id + ':' + a], b:nodeOf[z.id + ':' + b], key:e, base:(S.offEdges || []).includes(e) ? 1 : 0, over:null }); }); });
  // floating drawings (the Off duty interests) are nodes too, so they can light up
  ZONES.forEach((z, zi) => { if (z.sky) Object.entries(z.sky).forEach(([id, p]) => { nodeOf[z.id + ':' + id] = NODES.length; NODES.push({ zone:zi, zid:z.id, id, n:[p[0], p[2], 0, 0, 0, ''], x:p[0], z:p[2], y0:p[1], label:'', hidden:false, shape:true }); }); });
  const nodeState = new Float32Array(128), edgeState = new Float32Array(128);
  NODES.forEach((n, i) => nodeState[i] = n.hidden ? 2 : 0);
  const syncEdges = () => EDGES.forEach((e, i) => { const s = e.over ?? e.base, A = nodeState[e.a], B = nodeState[e.b];
    edgeState[i] = (s === 2 || s === 4) ? s : (A === 1 || A === 2 || B === 1 || B === 2) ? 1 : s; });
  syncEdges();
  const built = createBuilt({ scene, NODES, nodeState, reducedMotion });

  const extents = key => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, h = 0; Object.values(SYSTEMS[key].nodes).forEach(n => { x0 = Math.min(x0, n[0] - n[2]/2); x1 = Math.max(x1, n[0] + n[2]/2); z0 = Math.min(z0, n[1] - n[3]/2); z1 = Math.max(z1, n[1] + n[3]/2); h = Math.max(h, n[4]); });
    return { cx:(x0 + x1)/2, cz:(z0 + z1)/2, hx:(x1 - x0)/2, hz:(z1 - z0)/2, h }; };
  /* ---------- build every point in the world ---------- */
  const TOTAL = mobile ? CONFIG.particles.mobile : CONFIG.particles.desktop;
  const pos = new Float32Array(TOTAL*3), pB = new Float32Array(TOTAL*3), info = new Float32Array(TOTAL*4), mov = new Float32Array(TOTAL*2), sc = new Float32Array(TOTAL*3);
  let seed = 7; const rnd = () => { seed = (seed*16807) % 2147483647; return seed/2147483647; };
  let P = 0;
  const put = (a, b, kind, zone, idx, phase = 0, speed = 0, scatter = 0) => { if (P >= TOTAL) return;
    pos.set(a, P*3); pB.set(b, P*3); info.set([kind, zone, idx, rnd()], P*4); mov.set([phase, speed], P*2);
    sc.set(scatter ? [(rnd() - .5)*scatter, (rnd() - .2)*scatter*.6, (rnd() - .5)*scatter] : [0, 0, 0], P*3); P++; };
  const boxSegs = (x, z, w, d, h) => { const X0 = x - w/2, X1 = x + w/2, Z0 = z - d/2, Z1 = z + d/2, c = [[X0,Z0],[X1,Z0],[X1,Z1],[X0,Z1]], s = [];
    for (let i = 0; i < 4; i++){ const a = c[i], b = c[(i + 1)%4]; s.push([[a[0],0,a[1]],[b[0],0,b[1]]], [[a[0],h,a[1]],[b[0],h,b[1]]], [[a[0],0,a[1]],[a[0],h,a[1]]]); } return s; };
  const len = s => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1], s[1][2] - s[0][2]);
  const port = (A, B) => { const dx = B.x - A.x, dz = B.z - A.z, ax = Math.abs(dx) || 1e-6, az = Math.abs(dz) || 1e-6, s = Math.min((A.n[2]/2)/ax, (A.n[3]/2)/az); return [A.x + dx*s, A.n[4]*.5, A.z + dz*s]; };

  // structure segments (kind 0 solid, 4 dashed zones, 6 the dashed "next" marker)
  const SEG = [];
  NODES.forEach((n, i) => { if (!n.shape) boxSegs(n.x, n.z, n.n[2], n.n[3], n.n[4]).forEach(s => SEG.push({ s, kind:0, zone:n.zone, idx:i })); });
  // the interests, drawn in the same linework: a football, cricket stumps and a ball, a clapperboard
  const ring = (cx, cy, cz, r, ax, idx, zi, steps = 40) => { for (let k = 0; k < steps; k++){ const a0 = k/steps*Math.PI*2, a1 = (k + 1)/steps*Math.PI*2, P = a => ax === 'z' ? [cx + Math.cos(a)*r, cy + Math.sin(a)*r, cz] : ax === 'x' ? [cx, cy + Math.sin(a)*r, cz + Math.cos(a)*r] : [cx + Math.cos(a)*r, cy, cz + Math.sin(a)*r]; SEG.push({ s:[P(a0), P(a1)], kind:0, zone:zi, idx }); } };
  const line3 = (a, b, idx, zi) => SEG.push({ s:[a, b], kind:0, zone:zi, idx });
  NODES.filter(n => n.shape).forEach(n => { const i = NODES.indexOf(n), zi = n.zone, x = n.x, y = n.y0, zz = n.z;
    if (n.id === 'fb'){ const R = .8; ring(x, y, zz, R, 'z', i, zi); ring(x, y, zz, R, 'x', i, zi); ring(x, y, zz, R, 'y', i, zi); ring(x, y + .45, zz, R*.83, 'y', i, zi, 30); ring(x, y - .45, zz, R*.83, 'y', i, zi, 30); }
    if (n.id === 'ck'){ const b = y - .7; [-.2, 0, .2].forEach(d => line3([x + d, b, zz], [x + d, b + 1.3, zz], i, zi)); line3([x - .21, b + 1.33, zz], [x - .01, b + 1.33, zz], i, zi); line3([x + .01, b + 1.33, zz], [x + .21, b + 1.33, zz], i, zi); ring(x + .75, b + .25, zz, .13, 'z', i, zi, 18); }
    if (n.id === 'mv'){ const w2 = .7, h2 = .48; [[-w2,-h2,w2,-h2],[w2,-h2,w2,h2],[w2,h2,-w2,h2],[-w2,h2,-w2,-h2]].forEach(q => line3([x + q[0], y + q[1], zz], [x + q[2], y + q[3], zz], i, zi));
      const t0 = y + h2, a = .22; line3([x - w2, t0, zz], [x + w2, t0 + a, zz], i, zi); line3([x - w2, t0 + .2, zz], [x + w2, t0 + a + .2, zz], i, zi); line3([x + w2, t0 + a, zz], [x + w2, t0 + a + .2, zz], i, zi); line3([x - w2, t0, zz], [x - w2, t0 + .2, zz], i, zi);
      for (let k = 0; k < 4; k++){ const sx = -w2 + .25 + k*.33; line3([x + sx, t0 + (sx + w2)/(2*w2)*a, zz], [x + sx + .14, t0 + .2 + (sx + .14 + w2)/(2*w2)*a, zz], i, zi); } } });
  ZONES.forEach((z, zi) => { if (z.sys) (SYSTEMS[z.sys].areas || []).forEach(a => { const [x, zz, w, d] = a, X = x + z.at[0], Z = zz + z.at[1], c = [[X-w/2,Z-d/2],[X+w/2,Z-d/2],[X+w/2,Z+d/2],[X-w/2,Z+d/2]];
      for (let i = 0; i < 4; i++) SEG.push({ s:[[c[i][0],0,c[i][1]],[c[(i+1)%4][0],0,c[(i+1)%4][1]]], kind:4, zone:zi, idx:-1, dash:true }); });
    if (z.markers) z.markers.forEach((mx, k) => { const last = k === z.markers.length - 1; boxSegs(mx, ROAD_Z - .55, .24, .24, last ? .5 : .32).forEach(s => SEG.push({ s, kind:last ? 6 : 0, zone:zi, idx:-1, dash:last })); });
    if (z.gate){ const [gx, gz] = z.gate, R = 1.15, cy = 1.2; for (let k = 0; k < 48; k++){ const a0 = k/48*Math.PI*2, a1 = (k + 1)/48*Math.PI*2;
        SEG.push({ s:[[gx, cy + Math.sin(a0)*R, gz + Math.cos(a0)*R],[gx, cy + Math.sin(a1)*R, gz + Math.cos(a1)*R]], kind:0, zone:zi, idx:-1 }); } } });
  // traffic segments inside the systems
  const TRF = EDGES.map((e, i) => { const A = NODES[e.a], B = NODES[e.b], pa = port(A, B), pb = port(B, A); return { pa, pb, L:Math.hypot(pb[0]-pa[0], pb[2]-pa[2]), zone:e.zone, idx:i }; });
  // the thread: one long road in front of every zone, with a branch into each system
  const ROAD = [{ a:[-3.4, .03, ROAD_Z], b:[102, .03, ROAD_Z] }];
  const entry = { 's-cover':'u', 's-git':'p3', 's-cloud':'u', 's-ik':'n3', 's-cg':'rq', 's-also':'api', 's-bom':'d1' };
  Object.entries(entry).forEach(([zid, id]) => { const n = NODES[nodeOf[zid + ':' + id]]; ROAD.push({ a:[n.x, .03, ROAD_Z], b:[n.x, .03, n.z + n.n[3]/2] }); });

  const nDust = Math.floor(TOTAL*CONFIG.particles.dustShare), nRoad = Math.floor(TOTAL*CONFIG.particles.roadShare), nTrf = Math.floor(TOTAL*CONFIG.particles.trafficShare), nBeacon = 900;
  const nSeg = TOTAL - nDust - nRoad - nTrf - nBeacon;
  const segL = SEG.reduce((a, g) => a + len(g.s)*(g.dash ? .45 : 1), 0);
  const heroZone = zoneIndex['s-cover'];
  SEG.forEach(g => { const L = len(g.s)*(g.dash ? .45 : 1), cnt = Math.max(2, Math.round(nSeg*L/segL));
    for (let k = 0; k < cnt; k++){ let t = (k + rnd()*.6)/cnt; if (g.dash) t = (Math.floor(t*22) + (t*22 % 1)*.55)/22;
      const p = g.s[0].map((v, j) => lerp(v, g.s[1][j], t)); put(p, p, g.kind, g.zone, g.idx, 0, 0, g.zone === heroZone ? 7 : 0); } });
  const trfL = TRF.reduce((a, e) => a + e.L, 0);
  TRF.forEach(e => { const cnt = Math.max(4, Math.round(nTrf*e.L/trfL)), nx = -(e.pb[2] - e.pa[2]), nz = e.pb[0] - e.pa[0], nl = Math.hypot(nx, nz) || 1;
    for (let k = 0; k < cnt; k++){ const w = (rnd() - .5)*.05, o = [nx/nl*w, (rnd() - .5)*.03, nz/nl*w];
      put(e.pa.map((v, q) => v + o[q]), e.pb.map((v, q) => v + o[q]), 1, e.zone, e.idx, rnd(), (.1 + rnd()*.08)*CONFIG.speeds.traffic, e.zone === heroZone ? 7 : 0); } });
  const roadL = ROAD.reduce((a, r) => a + Math.hypot(r.b[0]-r.a[0], r.b[2]-r.a[2]), 0);
  ROAD.forEach(r => { const L = Math.hypot(r.b[0]-r.a[0], r.b[2]-r.a[2]), cnt = Math.max(6, Math.round(nRoad*L/roadL));
    for (let k = 0; k < cnt; k++){ const w = (rnd() - .5)*.06; put([r.a[0], r.a[1], r.a[2] + w], [r.b[0], r.b[1], r.b[2] + w], 2, 0, -1, rnd(), CONFIG.speeds.road*.9/L); } });
  const bz = ZONES.find(z => z.beacon).beacon, bzi = ZONES.findIndex(z => z.beacon);
  for (let k = 0; k < nBeacon; k++){ const a = rnd()*Math.PI*2, f = k/nBeacon;
    if (f < .42){ const rr = f < .3 ? .78 + rnd()*.05 : rnd()*.28, y = f < .3 ? .03 : .2 + rnd()*.3, p = [bz[0] + Math.cos(a)*rr, y, bz[2] + Math.sin(a)*rr]; put(p, p, 5, bzi, -1); }
    else if (f < .74){ const p = [bz[0] + Math.cos(a)*.82, .03, bz[2] + Math.sin(a)*.82]; put(p, [Math.cos(a), 0, Math.sin(a)], 7, bzi, -1, Math.floor(rnd()*3)/3 + rnd()*.04); }
    else { const rr = rnd()*.16, p = [bz[0] + Math.cos(a)*rr, .1, bz[2] + Math.sin(a)*rr]; put(p, p, 8, bzi, -1, rnd()); } }
  while (P < TOTAL){ const p = [-8 + rnd()*120, .3 + rnd()*14, -14 + rnd()*28]; put(p, p, 3, 0, -1); }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aB', new THREE.BufferAttribute(pB, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4)); geo.setAttribute('aMove', new THREE.BufferAttribute(mov, 2)); geo.setAttribute('aScatter', new THREE.BufferAttribute(sc, 3));
  const C = CONFIG.colors, S = CONFIG.sizes, lifts = new Float32Array(16).fill(1);
  const mat = new THREE.RawShaderMaterial({ vertexShader:VS, fragmentShader:FS, transparent:true, depthTest:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uMirror:{value:0}, uNB:{value:built.nodeBuild}, uNF:{value:built.nodeFlash}, uTrT:{value:0}, uTrDim:{value:1}, uBuiltA:{value:CONFIG.build.linesWhenBuilt}, uAmberGain:{value:CONFIG.render.amberGain}, uAmberTint:{value:new THREE.Vector3(...CONFIG.render.amberTint)}, uCoralGain:{value:CONFIG.render.coralGain}, uGain:{value:CONFIG.render.pointGain}, uT:{value:0}, uRush:{value:0}, uBurst:{value:0}, uHalo:{value:0}, uHaloS:{value:CONFIG.craft.halo.size}, uHaloA:{value:CONFIG.craft.halo.alpha}, uHover:{value:-1}, uAsm:{value:reducedMotion ? 0 : CONFIG.craft.assemble}, uMouseOn:{value:0}, uAspect:{value:1}, uNight:{value:0}, uFlowR:{value:CONFIG.craft.flow.radius}, uFlowP:{value:CONFIG.craft.flow.push}, uDis:{value:new Float32Array(16)}, uZC:{value:new Float32Array(48)}, uMouse:{value:new THREE.Vector2(9, 9)}, uRight:{value:new THREE.Vector3(1, 0, 0)}, uUp:{value:new THREE.Vector3(0, 1, 0)}, uFogN:{value:CONFIG.craft.fog.near}, uFogF:{value:CONFIG.craft.fog.far}, uPx:{value:DPR}, uK:{value:9}, uIntro:{value:reducedMotion ? 1 : 0}, uDim:{value:1}, uLift:{value:lifts}, uNode:{value:nodeState}, uEdge:{value:edgeState},
      uLine:{value:new THREE.Vector3(...hex(C.line))}, uCyan:{value:new THREE.Vector3(...hex(C.cyan))}, uAmber:{value:new THREE.Vector3(...hex(C.amber))}, uCoral:{value:new THREE.Vector3(...hex(C.coral))}, uFresh:{value:new THREE.Vector3(...hex(C.fresh))},
      uSize:{value:new THREE.Vector4(S.line, S.traffic, S.road, S.dust)}, uSize2:{value:new THREE.Vector2(S.area, S.beacon)} } });
  ZONES.forEach((z, i) => { const c = z.sys ? (() => { const e = extents(z.sys); return [e.cx + z.at[0], .3, e.cz + z.at[1]]; })() : z.look || [z.at ? z.at[0] : 0, 0, 0]; mat.uniforms.uZC.value.set(c, i*3); });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 1;
  // the drafting floor: the grid plus a lacquer reflection of the world (js/floor.js)
  const floor = createFloor({ renderer, mobile, reducedMotion, onMirror:on => { mat.uniforms.uMirror.value = on ? 1 : 0; } }), gmat = { uniforms:floor.uniforms };
  scene.add(floor.mesh); scene.add(points);
  // the GPU particle layer: flow-field dust, traffic on the thread, assembly into systems (off with reduced motion)
  // created a few frames after the first render, so the page paints first (see tick)
  let gpu = null, governor = null, frameN = 0;
  const startLate = () => {
    if (CONFIG.gpu.on && !reducedMotion){ gpu = createParticles({ renderer, NODES, mobile }); if (gpu) scene.add(gpu.points); }
    governor = createGovernor({ post, floor, gpu, dpr:DPR, startTier:tier, mobile, setDPR });
    if (fixed) CONFIG.quality.governor.on = false;
  };
  // the governor can lower the resolution at runtime
  function setDPR(d){ renderer.setPixelRatio(d); mat.uniforms.uPx.value = d; if (gpu) gpu.setPx(d); refresh(); }

  /* the GPU can drop the context (sleep, driver reset, too many tabs): pause, then rebuild what lives only on the GPU */
  let lost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; document.documentElement.classList.add('gl-lost'); });
  canvas.addEventListener('webglcontextrestored', () => {
    if (gpu){ scene.remove(gpu.points); gpu.dispose(); gpu = createParticles({ renderer, NODES, mobile }); if (gpu) scene.add(gpu.points); }
    loadEnv(); lost = false; document.documentElement.classList.remove('gl-lost'); });
  if (CONFIG.craft.halo.on && !mobile){ const hmat = new THREE.RawShaderMaterial({ vertexShader:VS, fragmentShader:FS, transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
      uniforms:{ ...mat.uniforms, uHalo:{value:1} } }); const halo = new THREE.Points(geo, hmat); halo.frustumCulled = false; halo.renderOrder = .5; scene.add(halo); }

  /* ---------- camera stations: one (or two) per zone, joined by a spline ---------- */
  const sections = ZONES.map(z => document.getElementById(z.id));
  let ST = [], eyeCurve = null, lookCurve = null, secInfo = [];
  const dirOf = (yaw, el) => [Math.sin(yaw)*Math.cos(el), Math.sin(el), Math.cos(yaw)*Math.cos(el)];
  function fitStation(z, sec){
    const e = extents(z.sys), W = W0(), H = H0(), st = sec.querySelector('.stage'), sr = st.getBoundingClientRect(), r0 = sec.getBoundingClientRect();
    const box = { x:sr.left, y:sr.top - r0.top, w:sr.width, h:sr.height };          // the stage, measured from the top of its section
    const tanH = Math.tan(CONFIG.camera.fov*Math.PI/360), R = Math.hypot(e.hx, e.hz*.85)*1.02, Rv = e.hz*.7 + e.h*.8 + .2;
    const d = (Math.max(R*H/(.5*box.w*tanH), Rv*H/(.5*box.h*tanH))*.46 + .3)/(W < 900 ? (z.mzoom || 1) : W < 1200 ? 1 : (z.zoom || 1));   // zoom: a zone can be framed larger (wide screens only; mzoom on phones)
    const look = [e.cx + z.at[0], e.h*.35, e.cz + z.at[1]], dir = dirOf(CONFIG.camera.yaw, CONFIG.camera.elevation);
    return { eye:look.map((v, i) => v + dir[i]*d), look, off:[box.x + box.w/2 - W/2, -(box.y + box.h/2 - H/2)] };
  }
  const shiftOff = s => s ? [s[0]*W0(), s[1]*H0()] : [0, 0];
  function refresh(){
    const W = W0(), H = H0(), narrow = W < 900; renderer.setSize(W, H, false); post.setSize(W, H); floor.resize(); camera.aspect = W/H; ST = []; secInfo = [];
    labelled.forEach(o => { o.w = 0; }); blockers = sections.map(sec => sec ? [...sec.querySelectorAll(BLOCK)] : []);   // re-measure labels, re-find blockers
    ZONES.forEach((z, i) => { const sec = sections[i]; if (!sec) return; const r = sec.getBoundingClientRect(), top = r.top + scrollY, first = ST.length;
      if (z.cam === 'fit') ST.push(fitStation(z, sec));
      else if (z.track){ const off = narrow ? [0, -H*.32] : [W*.16, -H*.3], dir = [-2.6, 2.1, 5.4];
        z.markers.forEach(mx => { const look = [mx, .2, ROAD_Z - .5]; ST.push({ look, eye:look.map((v, k) => v + dir[k]), off }); }); }
      else if (z.tour){ const dir = dirOf(CONFIG.camera.yaw, CONFIG.camera.elevation), off = narrow ? shiftOff(z.mshift) : shiftOff(z.shift), d = narrow ? 4.6 : 4.1;
        z.tour.forEach(id => { const n = SYSTEMS[z.sys].nodes[id], look = [n[0] + z.at[0], n[4]*.5, n[1] + z.at[1]]; ST.push({ look, eye:look.map((v, k) => v + dir[k]*d), off, part:id }); }); }
      else (z.shots || [z]).forEach(s => { const far = narrow && z.mfar ? z.mfar : 1, eye = s.look.map((v, k) => v + (s.eye[k] - v)*far); ST.push({ eye, look:s.look, off:narrow ? shiftOff(z.mshift) : shiftOff(z.shift) }); });
      secInfo.push({ top, h:r.height, first, count:ST.length - first, zi:i, z }); });
    eyeCurve = new THREE.CatmullRomCurve3(ST.map(s => new THREE.Vector3(...s.eye)), false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(ST.map(s => new THREE.Vector3(...s.look)), false, 'centripetal');
  }

  /* which station the scroll position asks for, as a fractional index */
  function stationParam(){
    const c = scrollY + H0()*.5, T = CONFIG.camera.travel; let k = 0;
    for (let i = 0; i < secInfo.length; i++) if (c >= secInfo[i].top || (secInfo[i].z.finale && scrollY >= secInfo[i].top - H0()*.5)) k = i;
    const s = secInfo[k]; if (!s) return { idx:0, zi:0 };
    const u = clamp((c - s.top)/Math.max(1, s.h)), last = s.first + s.count - 1, hasNext = k < secInfo.length - 1;
    let idx;
    if (s.z.finale){ const maxY = document.documentElement.scrollHeight - H0(), y0 = s.top - H0(); idx = s.first + easeIO(clamp((scrollY - y0)/Math.max(1, maxY - y0))); }
    else if (s.count > 1){
      // a pinned scroll-through: one stop per step, in step with the cards, then on to the next zone
      const pin = clamp((scrollY - s.top)/Math.max(1, s.h - H0())), n = s.count, i = Math.min(n - 1, Math.floor(pin*n*.999)), local = pin*n - i;
      idx = s.first + i + (i < n - 1 ? easeIO(clamp((local - .7)/.3)) : 0);
      if (hasNext && scrollY > s.top + s.h - H0()) idx = last + easeIO(clamp((scrollY - (s.top + s.h - H0()))/(H0()*.7)));
    }
    else idx = u < 1 - T || !hasNext ? s.first : s.first + easeIO((u - (1 - T))/T);
    if (reducedMotion) idx = Math.round(idx);           // calm version: no flight, the view simply changes
    return { idx:Math.min(idx, ST.length - 1), zi:s.zi, u };
  }

  /* ---------- labels and the drawing overlay (dimension lines, revision clouds) ---------- */
  const labelRoot = document.getElementById('labels'), ov = document.getElementById('ov'), NS = 'http://www.w3.org/2000/svg';
  const labelled = NODES.map((n, i) => ({ i, n, base:n.label === 'new' ? '' : n.label, over:null })).filter(o => !o.n.shape);
  const BLOCK = '.pj-copy,.cv-copy,.tele,.tb,.detail,.card,.rail,.row,.edits,.bomt,.offs,.note,.big,.mail';   // page text labels must never cover
  let blockers = [];
  labelled.forEach(o => { const el = document.createElement('span'); el.textContent = o.base; labelRoot.appendChild(el); o.el = el; o.txt = o.base; });
  // the text a label should show now: a scenario's override, "new" for a starting server, or its own label
  const labelText = o => o.over ?? (nodeState[o.i] === 3 ? 'new' : o.base);
  const tmp = new THREE.Vector3();
  const toScreen = (x, y, z) => { tmp.set(x, y, z).project(camera); if (tmp.z > 1 || tmp.z < -1) return null; return [(tmp.x*.5 + .5)*W0(), (-tmp.y*.5 + .5)*H0()]; };
  const dimG = document.createElementNS(NS, 'g'), dimL = [0, 1, 2, 3, 4].map(() => { const l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'dim'); dimG.appendChild(l); return l; });
  const dimT = document.createElementNS(NS, 'text'); dimT.setAttribute('class', 'dimt'); dimT.setAttribute('text-anchor', 'middle'); dimG.appendChild(dimT); ov.appendChild(dimG);
  const cloudG = document.createElementNS(NS, 'g'); ov.appendChild(cloudG);
  const scallops = (cx, cy, rx, ry) => { let d = ''; const n = 14; for (let i = 0; i <= n; i++){ const a = i/n*Math.PI*2, x = cx + Math.cos(a)*rx, y = cy + Math.sin(a)*ry; if (!i){ d += `M${x},${y}`; continue; } const am = (i - .5)/n*Math.PI*2; d += ` Q${cx + Math.cos(am)*(rx + 16)},${cy + Math.sin(am)*(ry + 16)} ${x},${y}`; } return d; };
  const boxScreen = (n, lift) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, ok = false; for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) for (const y of [0, n.n[4]*lift]){ const p = toScreen(n.x + dx*n.n[2], y, n.z + dz*n.n[3]); if (!p) continue; ok = true; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return ok ? { x0, x1, y0, y1 } : null; };
  function overlay(zi){
    const W = W0(), H = H0(), z = ZONES[zi], sec = sections[zi], lift = lifts[zi];
    // labels: drawn in priority order, and never on top of words, readouts or each other
    // reads first (blocker boxes, cached label sizes), writes after, so the browser lays out once per frame
    const blk = (blockers[zi] || []).filter(e => !e.classList.contains('card') || e.classList.contains('on')).map(e => e.getBoundingClientRect()).filter(r => r.width);
    labelled.forEach(o => { const t = labelText(o); if (t !== o.txt){ o.el.textContent = o.txt = t; o.w = 0; } if (!o.w && t){ o.w = o.el.offsetWidth; o.h = o.el.offsetHeight; } });
    const placed = [];
    [...labelled.filter(o => o.over), ...labelled.filter(o => !o.over)].forEach(o => { const n = o.n, L = lifts[n.zone], near = o.txt && n.zone === zi && L > .55 && nodeState[o.i] !== 2;
      const p = near ? toScreen(n.x, n.n[4]*L + .07, n.z) : null; if (!p){ o.el.style.opacity = 0; return; }
      o.el.style.transform = `translate(${p[0]}px,${p[1]}px) translate(-50%,-100%)`;
      const w = o.w, h = o.h, b = { x0:p[0] - w/2, x1:p[0] + w/2, y0:p[1] - h, y1:p[1] };
      const clash = b.x0 < 4 || b.x1 > W - 4 || b.y0 < 62 || b.y1 > H - 4 || blk.some(r => b.x0 < r.right + 4 && b.x1 > r.left - 4 && b.y0 < r.bottom + 3 && b.y1 > r.top - 3) || placed.some(q => b.x0 < q.x1 + 4 && b.x1 > q.x0 - 4 && b.y0 < q.y1 + 2 && b.y1 > q.y0 - 2);
      if (!clash) placed.push(b);
      o.el.classList.toggle('down', nodeState[o.i] === 1); o.el.classList.toggle('new', nodeState[o.i] === 3); o.el.classList.toggle('good', nodeState[o.i] === 4);
      o.el.style.opacity = clash ? 0 : smooth(.55, .9, L); });
    // the dimension line under the active system
    const D = z.sys && SYSTEMS[z.sys].dim; let dimOn = 0;
    if (D && lift > .85 && W >= 600){ const a = toScreen(D.a[0] + z.at[0], 0, D.a[2] + z.at[1]), b = toScreen(D.b[0] + z.at[0], 0, D.b[2] + z.at[1]);
      if (a && b){ const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy/l*18, ny = dx/l*18, A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
        const set = (e, x1, y1, x2, y2) => { e.setAttribute('x1', x1); e.setAttribute('y1', y1); e.setAttribute('x2', x2); e.setAttribute('y2', y2); };
        set(dimL[0], A[0], A[1], B[0], B[1]); set(dimL[1], A[0] - 7, A[1] - 7, A[0] + 7, A[1] + 7); set(dimL[2], B[0] - 7, B[1] - 7, B[0] + 7, B[1] + 7); set(dimL[3], a[0], a[1], A[0], A[1]); set(dimL[4], b[0], b[1], B[0], B[1]);
        const ang = Math.atan2(dy, dx)*180/Math.PI, mx = (A[0] + B[0])/2 + nx*.9, my = (A[1] + B[1])/2 + ny*.9; dimT.textContent = D.text; dimT.setAttribute('x', mx); dimT.setAttribute('y', my); dimT.setAttribute('transform', `rotate(${ang} ${mx} ${my})`);
        dimOn = smooth(.85, 1, lift); } }
    dimG.setAttribute('opacity', dimOn);
    // revision clouds around anything broken in the active system
    const down = NODES.map((n, i) => ({ n, i })).filter(o => o.n.zone === zi && nodeState[o.i] === 1);
    while (cloudG.childNodes.length > down.length*3) cloudG.lastChild.remove();
    down.forEach((o, k) => { const bx = lift > .8 && boxScreen(o.n, lift); if (!bx) return; let c = cloudG.childNodes[k*3];
      if (!c){ c = document.createElementNS(NS, 'path'); c.setAttribute('class', 'cloud'); cloudG.appendChild(c); const t = document.createElementNS(NS, 'path'); t.setAttribute('class', 'revtri'); cloudG.appendChild(t); const tx = document.createElementNS(NS, 'text'); tx.setAttribute('class', 'rev'); tx.textContent = 'C'; cloudG.appendChild(tx); }
      const cx = (bx.x0 + bx.x1)/2, cy = (bx.y0 + bx.y1)/2, rx = (bx.x1 - bx.x0)/2 + 24, ry = (bx.y1 - bx.y0)/2 + 20, tx0 = cx + rx + 6, ty0 = cy - ry - 4;
      c.setAttribute('d', scallops(cx, cy, rx, ry)); cloudG.childNodes[k*3 + 1].setAttribute('d', `M${tx0},${ty0 - 15} L${tx0 + 15},${ty0 + 11} L${tx0 - 15},${ty0 + 11} Z`);
      cloudG.childNodes[k*3 + 2].setAttribute('x', tx0 - 4.5); cloudG.childNodes[k*3 + 2].setAttribute('y', ty0 + 7); });
  }

  /* ---------- break tests: break a system, watch it heal ---------- */
  const N = (zid, id) => nodeOf[zid + ':' + id], E = (zid, key) => EDGES[edgeOf[zid + ':' + key]];
  const setN = (zid, id, s) => { nodeState[N(zid, id)] = s; }, setE = (zid, key, s) => { const e = E(zid, key); if (e) e.over = s; };
  const timers = {}; const later = (zid, ms, fn) => { (timers[zid] = timers[zid] || []).push(setTimeout(() => { fn(); syncEdges(); }, reducedMotion ? Math.min(ms, 400) : ms)); };
  const broken = {};
  function resetZone(zid){ (timers[zid] || []).forEach(clearTimeout); timers[zid] = []; broken[zid] = false;
    NODES.forEach((n, i) => { if (n.zid === zid) nodeState[i] = n.hidden ? 2 : 0; }); EDGES.forEach(e => { if (e.zid === zid) e.over = null; }); syncEdges(); onTele(zid, null); onLine(zid, null); onRev(zid, false); }
  const T = (zid, lines, tone) => onTele(zid, lines, tone), Lm = (zid, text, tone) => onLine(zid, text, tone);
  const RUN = {
    's-cover': (id = 'b2') => { const z = 's-cover', row = id[0], fresh = row + '3';
      setN(z, id, 1); T(z, [`Server ${id} is down`, 'Rerouting to 5 servers'], 'alert'); onRev(z, true);
      later(z, 1600, () => { setN(z, fresh, 3); T(z, ['Replacement server starting', '0 failed requests'], 'alert'); });
      later(z, 3600, () => { setN(z, id, 0); T(z, ['Healed', '6 of 6 servers healthy'], 'calm'); onRev(z, false); });
      later(z, 6600, () => resetZone(z)); },
    's-git': () => { const z = 's-git'; setN(z, 'w2', 1); setE(z, 'p2-w2', 2); T(z, ['Worker 2 crashed', 'Partition 2 waits, nothing skipped'], 'alert'); Lm(z, 'Worker 2 crashed. Its events wait in line, and nothing is skipped.', 'alert'); onRev(z, true);
      later(z, 3200, () => { setN(z, 'w2', 0); setE(z, 'p2-w2', null); T(z, ['Worker 2 restarted', 'Caught up, 0 events lost'], 'calm'); Lm(z, 'Worker 2 restarted and caught up. 0 events lost.', 'calm'); onRev(z, false); });
      later(z, 6400, () => resetZone(z)); },
    's-cloud': () => { const z = 's-cloud'; setN(z, 'a1', 1); setN(z, 'a2', 1); T(z, ['Zone A is down', 'Traffic moves to zones B and C'], 'alert'); Lm(z, 'Zone A is down. Traffic moves to zones B and C, and new servers start.', 'alert'); onRev(z, true);
      later(z, 1500, () => { setN(z, 'b3', 3); setN(z, 'c3', 3); T(z, ['Auto Scaling added 2 servers', '0 failed requests'], 'alert'); });
      later(z, 4200, () => { setN(z, 'a1', 0); setN(z, 'a2', 0); T(z, ['Zone A is back', '0 failed requests'], 'calm'); Lm(z, 'Zone A is back. 0 failed requests.', 'calm'); onRev(z, false); });
      later(z, 7400, () => resetZone(z)); },
    's-ik': () => { const z = 's-ik'; setE(z, 'ck-st', 1); setE(z, 'ck-no', 0); setN(z, 'no', 3); T(z, ['No note supports that', 'Refused, nothing invented'], 'calm'); Lm(z, 'Nothing in my notes backs that, so it refuses. Nothing invented.', 'calm'); },
    's-cg': () => { const z = 's-cg'; setN(z, 'g4', 1); setE(z, 'g3-g4', 4); T(z, ['Expired login', 'Stopped at JWT with a 401'], 'alert'); Lm(z, 'Expired login. Stopped at the JWT check with a 401, before any data.', 'alert'); onRev(z, true); },
  };
  const prevBuild = new Float32Array(16);
  function breakZone(zid, id){ if (!RUN[zid]) return;
    if (window.gsap && !reducedMotion) window.gsap.fromTo(cam, { nudge:1 }, { nudge:0, duration:CONFIG.choreo.nudge.duration, ease:'power2.out' }); if (broken[zid] && zid !== 's-cover') { resetZone(zid); return; } resetZone(zid); broken[zid] = true; RUN[zid](id); syncEdges(); }
  // click any app server on the cover to take it down
  function hitServer(x, y){ const zi = zoneIndex['s-cover']; if (lifts[zi] < .8) return null;
    for (const id of ['a1','a2','b1','b2','c1','c2']){ const n = NODES[N('s-cover', id)], b = boxScreen(n, lifts[zi]); if (b && x > b.x0 - 8 && x < b.x1 + 8 && y > b.y0 - 8 && y < b.y1 + 8) return id; } return null; }

  /* ---------- the sky: day blueprint, dusk at Off duty, night at the end ---------- */
  const SKY = [[0, ['#173d88','#0F2E6B','#0A2152']], [.72, ['#173d88','#0F2E6B','#0A2152']], [.86, ['#2a3a8a','#1a2466','#0d1442']], [1, ['#0e1d4c','#071234','#030a1e']]];
  const mixHex = (a, b, t) => '#' + [0, 2, 4].map(i => Math.round(lerp(parseInt(a.substr(1 + i, 2), 16), parseInt(b.substr(1 + i, 2), 16), t)).toString(16).padStart(2, '0')).join('');
  let skyKey = '';
  function sky(p){ let k = 0; while (k < SKY.length - 2 && p > SKY[k + 1][0]) k++; const [p0, c0] = SKY[k], [p1, c1] = SKY[k + 1], f = clamp((p - p0)/Math.max(.001, p1 - p0));
    const c = c0.map((h, i) => mixHex(h, c1[i], f)), key = c.join(); if (key === skyKey) return; skyKey = key;
    [skyMat.uniforms.uC0, skyMat.uniforms.uC1, skyMat.uniforms.uC2].forEach((u, i) => u.value.set(...hex(c[i])));
    document.body.style.background = `radial-gradient(110% 90% at 60% 0%, ${c[0]}, ${c[1]} 55%, ${c[2]}) fixed`; }

  /* ---------- the loop ---------- */
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), tE = new THREE.Vector3(), tL = new THREE.Vector3(), off = [0, 0];
  let clockT = 0;   // the render clock, for scenario beads
  let ptr = [0, 0], pp = [0, 0], intro0 = null, started = false, last = 0, arriveT0 = null, rush = 0, lastY = scrollY, vs = 0, fovNow = CONFIG.camera.fov, bankNow = 0, hasPtr = false;
  const prevEye = new THREE.Vector3(), lampW = new THREE.Vector3(0, -99, 0);
  function tick(t){
    if (!eyeCurve || lost) return; const W = W0(), H = H0();
    if (++frameN === 4) startLate();
    const dt = Math.min(.05, last ? t - last : .016); last = t; clockT = t;
    if (intro0 === null) intro0 = t;
    const intro = reducedMotion ? 1 : easeIO(clamp((t - intro0)/CONFIG.intro.duration));
    // camera target from the scroll position
    const sp = stationParam(), tt = sp.idx/Math.max(1, ST.length - 1);
    eyeCurve.getPoint(tt, tE); lookCurve.getPoint(tt, tL);
    const i0 = Math.floor(sp.idx), i1 = Math.min(ST.length - 1, i0 + 1), f = sp.idx - i0, oT = [lerp(ST[i0].off[0], ST[i1].off[0], f), lerp(ST[i0].off[1], ST[i1].off[1], f)];
    const k = reducedMotion || !started ? 1 : 1 - Math.pow(1 - CONFIG.camera.damping, dt*60); started = true;
    eye.lerp(tE, k); look.lerp(tL, k); off[0] = lerp(off[0], oT[0], k); off[1] = lerp(off[1], oT[1], k);
    // a gentle tilt with the mouse, never a drag or an orbit
    pp[0] = lerp(pp[0], ptr[0], .05); pp[1] = lerp(pp[1], ptr[1], .05);
    const fwd = tL.clone().sub(tE), dist = fwd.length(); fwd.normalize(); const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize(), upv = new THREE.Vector3().crossVectors(right, fwd);
    camera.position.copy(eye).addScaledVector(right, pp[0]*CONFIG.camera.parallax*dist).addScaledVector(upv, -pp[1]*CONFIG.camera.parallax*dist*.6);
    // speed you can feel: fast scrolling widens the lens a touch and surges the traffic
    const vy = Math.abs(scrollY - lastY)/Math.max(dt, .001); lastY = scrollY; vs = lerp(vs, reducedMotion ? 0 : vy, .08);
    const kick = Math.min(1, vs/4000); fovNow = lerp(fovNow, CONFIG.camera.fov + kick*CONFIG.craft.speed.fovKick, .1); camera.fov = fovNow;
    // banking: the camera leans gently into sideways moves
    const lat = prevEye.lengthSq() ? (eye.x - prevEye.x)*right.x + (eye.z - prevEye.z)*right.z : 0; prevEye.copy(eye);
    bankNow = lerp(bankNow, reducedMotion ? 0 : clamp(lat/Math.max(dt, .001)*.004*CONFIG.craft.bank, -.045, .045), .06);
    camera.up.set(0, 1, 0).multiplyScalar(Math.cos(bankNow)).addScaledVector(right, Math.sin(bankNow));
    // the opening dolly: the camera starts further back and higher, and settles into the hero as it assembles;
    // a break test leans it in a touch. Both are GSAP-timed values (cam.intro, cam.nudge).
    if (cam.intro > 0 || cam.nudge > 0){ camera.position.addScaledVector(fwd, -dist*(cam.intro*CH.intro.back - cam.nudge*CH.nudge.amount)); camera.position.y += dist*cam.intro*CH.intro.rise; }
    let lookAt = look;
    if (cam.focus > 0){ lookAt = look.clone().lerp(focusP, cam.focus*CH.focus.pull); camera.position.addScaledVector(fwd, dist*cam.focus*CH.focus.push); }
    camera.lookAt(lookAt); camera.setViewOffset(W, H, -off[0], off[1], W, H); camera.updateMatrixWorld();
    // the drafting lamp: where the cursor meets the plane
    if (hasPtr && CONFIG.craft.lamp.on && !mobile && !reducedMotion){ const tanH = Math.tan(fovNow*Math.PI/360), nx = ((ptr[0] + .5)*W - (W/2 + off[0]))/(W/2), ny = -((ptr[1] + .5)*H - (H/2 - off[1]))/(H/2);
      const dir = fwd.clone().addScaledVector(right, nx*tanH*(W/H)).addScaledVector(upv, ny*tanH);
      if (dir.y < -.01){ const tt2 = -camera.position.y/dir.y; lampW.lerp(new THREE.Vector3(camera.position.x + dir.x*tt2, 0, camera.position.z + dir.z*tt2), .25); }
      gmat.uniforms.uLampS.value = lerp(gmat.uniforms.uLampS.value, dir.y < -.01 ? CONFIG.craft.lamp.strength : 0, .1); gmat.uniforms.uLamp.value.copy(lampW); }
    gmat.uniforms.uReveal.value = reducedMotion ? 999 : easeIO(clamp((t - intro0)/CONFIG.craft.gridReveal))*170;
    if (CONFIG.craft.scan.on && !reducedMotion){ gmat.uniforms.uScanOn.value = 1; gmat.uniforms.uScanX.value = look.x - 7 + ((t/CONFIG.craft.scan.period) % 1)*14; gmat.uniforms.uScanC.value.x = look.x; gmat.uniforms.uScanC.value.y = look.z; }
    // plans lift into 3D as the camera's focus approaches them
    const dis = mat.uniforms.uDis.value;
    ZONES.forEach((z, i) => { if (!z.sys) { lifts[i] = 1; dis[i] = 0; return; } const d = Math.hypot(look.x - (z.at[0] + extents(z.sys).cx), look.z - z.at[1]);
      lifts[i] = reducedMotion ? 1 : 1 - smooth(CONFIG.lift.near, CONFIG.lift.far, d); dis[i] = reducedMotion ? 0 : smooth(CONFIG.craft.stardust.near, CONFIG.craft.stardust.far, d); });
    const B = CONFIG.build, introBuild = zi => reducedMotion || zi !== heroZone ? 1 : easeIO(clamp((t - intro0 - B.introDelay)/B.introDuration));
    built.update(t, lifts, introBuild);
    trT += reducedMotion ? 0 : dt*CONFIG.speeds.dust*trSpeed; mat.uniforms.uTrT.value = trT; mat.uniforms.uTrDim.value += (trDim - mat.uniforms.uTrDim.value)*.08;
    beadsTick(t);
    mat.uniforms.uMouse.value.set((ptr[0] + .5)*2 - 1, -((ptr[1] + .5)*2 - 1)); mat.uniforms.uAspect.value = W/H;
    mat.uniforms.uMouseOn.value = lerp(mat.uniforms.uMouseOn.value, hasPtr && !mobile && !reducedMotion ? 1 : 0, .05);
    mat.uniforms.uRight.value.copy(right); mat.uniforms.uUp.value.copy(upv);
    // day to dusk to night across the journey
    const prog = clamp(scrollY/Math.max(1, document.documentElement.scrollHeight - H)); mat.uniforms.uNight.value = smooth(.84, .98, prog); sky(prog);
    const dim = lerp(mat.uniforms.uDim.value, ZONES[sp.zi].dim ?? 1, .06);
    Object.assign(mat.uniforms.uT, { value:reducedMotion ? 0 : t*CONFIG.speeds.dust }); mat.uniforms.uIntro.value = intro; mat.uniforms.uDim.value = dim;
    gmat.uniforms.uCam.value.copy(camera.position); gmat.uniforms.uDim.value = dim*intro;
    // the arrival: once, when the visitor reaches the very end of the journey
    const atEnd = ZONES[sp.zi].finale && scrollY >= document.documentElement.scrollHeight - H0() - 40;
    if (atEnd && arriveT0 === null){ arriveT0 = t; onArrive(); }
    const at = arriveT0 === null || reducedMotion ? 0 : t - arriveT0, burst = at > 0 && at < 2.6 ? Math.sin(Math.PI*Math.min(1, at/2.6))*(at < .5 ? at/.5 : 1) : 0;
    rush += dt*(burst*11 + kick*CONFIG.craft.speed.rush); mat.uniforms.uRush.value = rush; mat.uniforms.uBurst.value = burst;
    if (gpu && gpu.active !== undefined) gpu.update(t, dt, { look, lifts, zoneBuild:built.zoneBuild, cursor:lampW, cursorOn:hasPtr && !mobile, intro, dim });
    // the post stack follows the zone: focus on what you are looking at, per-zone bloom and vignette
    post.setFocus(look); post.setZone(ZONES[sp.zi].id, reducedMotion ? 1 : .05);
    // how fast systems are being built right now (the optional sound hums with it)
    let rate = 0; built.zoneBuild.forEach((b, i) => { rate += Math.abs(b - (prevBuild[i] || 0)); prevBuild[i] = b; }); onBuild(rate/Math.max(dt, .001));
    post.render(dt);
    if (governor) governor.frame(dt, t - intro0);
    overlay(sp.zi);
  }
  // light up one part of a system (the stack tiles use this), or none
  /* ---------- scenarios (js/scenarios.js, played by js/scenario-runner.js): the parts they can move ---------- */
  let trT = 0, trSpeed = 1, trDim = 1;
  const BEADS = 6, TRAIL = 18, beadGeo = new THREE.BufferGeometry(), beadPos = new Float32Array(BEADS*TRAIL*3), beadSz = new Float32Array(BEADS*TRAIL);
  beadGeo.setAttribute('position', new THREE.BufferAttribute(beadPos, 3)); beadGeo.setAttribute('aSize', new THREE.BufferAttribute(beadSz, 1));
  const beadMat = new THREE.ShaderMaterial({ transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ uCol:{ value:new THREE.Color(CONFIG.colors.amber).multiplyScalar(CONFIG.scenarios.beadGlow) }, uPx:{ value:DPR } },
    vertexShader:'attribute float aSize; varying float vA; uniform float uPx; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uPx*clamp(9./max(-mv.z, .1), .5, 2.2); vA = step(.01, aSize); }',
    fragmentShader:'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5 || vA < .5) discard; gl_FragColor = vec4(uCol*smoothstep(.5, 0., d), 1.); }' });
  const beadMesh = new THREE.Points(beadGeo, beadMat); beadMesh.frustumCulled = false; beadMesh.renderOrder = 5; scene.add(beadMesh);
  let beads = [];
  const nodePos = (k, out = new THREE.Vector3()) => out.set(NODES[k].x, Math.min(.12, NODES[k].n[4]*.4) + .04, NODES[k].z);
  function beadsTick(t){
    beadSz.fill(0);
    beads = beads.filter(b => t < b.t0 + b.dur + .5);
    beads.forEach((b, bi) => { if (bi >= BEADS) return;
      const u = Math.min(1, Math.max(0, (t - b.t0)/b.dur)), fade = 1 - Math.max(0, (t - b.t0 - b.dur)/.5);
      // visit: a node pulses as the bead reaches it
      b.at.forEach((f, k) => { if (!b.hit[k] && u >= f){ b.hit[k] = true; built.flash(b.nodes[k], .9); } });
      for (let j = 0; j < TRAIL; j++){ const uu = u - j*CONFIG.scenarios.trail; if (uu < 0) break;
        b.curve.getPointAt(Math.min(1, uu), tmpV); beadPos.set([tmpV.x, tmpV.y, tmpV.z], (bi*TRAIL + j)*3);
        beadSz[bi*TRAIL + j] = (j ? CONFIG.scenarios.beadSize*.55*(1 - j/TRAIL) : CONFIG.scenarios.beadSize)*fade; } });
    beadGeo.attributes.position.needsUpdate = beadGeo.attributes.aSize.needsUpdate = true;
  }
  const tmpV = new THREE.Vector3();
  const scn = {
    setNode(zid, id, s){ const k = N(zid, id); if (k === undefined) return;
      if (s === 'rebuild') built.rebuild(k); else nodeState[k] = { down:1, ok:0, new:3, hidden:2 }[s] ?? nodeState[k]; syncEdges(); },
    setEdge(zid, key, s){ const e = E(zid, key); if (!e) return; e.over = { hold:2, end:4, off:1, on:0, normal:null }[s] ?? null; syncEdges(); },
    flash(zid, id){ const k = N(zid, id); if (k !== undefined) built.flash(k, 1); },
    label(zid, id, text){ const o = labelled.find(l => l.i === N(zid, id)); if (o) o.over = text ?? null; },
    traffic({ speed, dim } = {}){ if (speed !== undefined) trSpeed = speed; if (dim !== undefined) trDim = dim; },
    focus(zid, id){ if (reducedMotion || !window.gsap) return; if (id){ const k = N(zid, id); if (k === undefined) return; nodePos(k, focusP).y = NODES[k].n[4]*.5; }
      window.gsap.to(cam, { focus:id ? 1 : 0, duration:CONFIG.choreo.focus.duration, ease:'power2.inOut', overwrite:true }); },
    bead(zid, path, dur){ if (reducedMotion) return; const ks = path.map(id => N(zid, id)).filter(k => k !== undefined); if (ks.length < 2) return;
      const pts = ks.map(k => nodePos(k)), curve = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      const lens = curve.getCurveLengths(), total = lens[lens.length - 1];
      beads.push({ curve, nodes:ks, at:[0, ...lens.map(l => l/total)], hit:[], t0:clockT, dur:Math.max(.2, dur) }); },
    reset(zid){ resetZone(zid); beads = []; trSpeed = 1; trDim = 1; labelled.forEach(o => { if (o.n.zid === zid) o.over = null; }); if (window.gsap) window.gsap.to(cam, { focus:0, duration:.6, overwrite:true }); else cam.focus = 0; },
  };
  const highlight = (zid, id) => NODES.forEach((n, i) => { if (n.zid === zid && !n.hidden) nodeState[i] = n.id === id ? 4 : 0; });
  function hitNode(zid, ids, x, y){ const zi = zoneIndex[zid]; if (lifts[zi] < .6) return null; let best = null, area = 1e12;
    for (const id of ids){ const k = N(zid, id); if (k === undefined) continue; const b = boxScreen(NODES[k], lifts[zi]); if (!b) continue;
      if (x > b.x0 - 10 && x < b.x1 + 10 && y > b.y0 - 10 && y < b.y1 + 10){ const a = (b.x1 - b.x0)*(b.y1 - b.y0); if (a < area){ area = a; best = id; } } } return best; }
  const setHover = (zid, id) => { mat.uniforms.uHover.value = zid && id ? N(zid, id) ?? -1 : -1; };
  // ?debug in the URL exposes the render pieces for measurement (scripts in the README use it)
  if (/[?&]debug\b/.test(location.search)) window.__debug = {
    // where a zone's parts land on screen (for checking framing): min/max of every box corner
    bounds:zid => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; NODES.forEach(n => { if (n.zid !== zid || n.hidden || n.shape) return;
      for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) for (const y of [0, n.n[4]]){ const p = toScreen(n.x + dx*n.n[2], y, n.z + dz*n.n[3]); if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } });
      return { x0:Math.round(x0), x1:Math.round(x1), y0:Math.round(y0), y1:Math.round(y1) }; },
    floor, built, post, get gpu(){ return gpu; }, get governor(){ return governor; }, renderer, scene, points, CONFIG };
  return { scn, tick, refresh, breakZone, resetZone, hitServer, hitNode, highlight, setHover, setPointer:(x, y) => { ptr = [x, y]; hasPtr = true; }, activeZone:() => stationParam().zi, zoneIndex, renderer };
}
