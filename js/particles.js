/* =====================================================================
   particles.js: a GPU-simulated particle layer (GPUComputationRenderer).
   262,144 particles on laptops, 65,536 on phones (CONFIG.gpu). Each one is
   one of three kinds:

   - dust:      drifts on a curl-noise flow field, always kept in a box
                around where the camera is looking, so density stays even
   - thread:    amber traffic that physically flows along the road that
                joins every zone, held to it by a spring, stirred by the flow
   - structure: belongs to a system; drifts as loose stardust when you are
                far, streams in and settles onto the system's edges as you
                arrive (the assembly), and fades as the system is built

   The cursor pushes everything near it, like a hand through water.
   Positions and velocities live in float textures and never leave the GPU.
   ===================================================================== */
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { CONFIG } from './config.js';
import { SYSTEMS, ZONES, ROAD_Z } from './zones.js';

// a divergence-free flow: the analytic curl of a small sum of sines (cheap, smooth, no noise textures)
const FLOW = `
vec3 curlA(vec3 p, float t){
  return vec3(1.9*cos(1.9*p.y + .5*t) - 1.1*cos(1.1*p.z + .8*t),
              1.7*cos(1.7*p.z - .7*t) - 1.2*cos(1.2*p.x - .6*t),
              1.5*cos(1.5*p.x + .3*t) - 1.3*cos(1.3*p.y + t));
}
vec3 flow(vec3 p, float t){
  vec3 q = mat3(.8, .6, 0., -.48, .64, .6, .36, -.48, .8)*p*2.1;      // a rotated second octave
  return curlA(p, t)*.5 + curlA(q, t*1.3)*.25;
}`;

const VEL = `
uniform float uT, uDt, uFlowScale, uFlowAmp, uThreadSpeed, uCurOn, uCurR, uCurPush, uRoadZ;
uniform vec3 uCur; uniform vec4 uAtt[4];
uniform sampler2D tHome, tInfo;
float pick(vec4 v, float c){ return c < .5 ? v.x : c < 1.5 ? v.y : c < 2.5 ? v.z : v.w; }
${FLOW}
void main(){
  vec2 uv = gl_FragCoord.xy/resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz, v = texture2D(textureVelocity, uv).xyz;
  vec4 home = texture2D(tHome, uv), info = texture2D(tInfo, uv);
  vec3 f = flow(p*uFlowScale, uT)*uFlowAmp;
  float k = 1. - exp(-uDt*3.);
  if (info.x < .5){                                   // dust: ride the flow
    v = mix(v, f, k);
  } else if (info.x < 1.5){                           // thread: flow along the road, held to it by a spring
    vec3 tgt = vec3(uThreadSpeed*(.7 + .6*info.y), 0., 0.) + f*.22;
    tgt.yz += (vec2(.035 + info.z*.05, uRoadZ + (info.z - .5)*.1) - p.yz)*5.;
    v = mix(v, tgt, k);
  } else {                                            // structure: loose near home, pulled onto it as the zone assembles
    float a = pick(uAtt[int(floor(home.w/4.))], mod(home.w, 4.));
    vec3 loose = f*1.1 + (home.xyz - p)*.12;
    vec3 tgt = mix(loose, (home.xyz - p)*4.5 + f*.05, a);
    v = mix(v, tgt, 1. - exp(-uDt*(3. + a*4.)));
  }
  // the cursor parts everything near it
  vec2 d = p.xz - uCur.xz; float L = length(d);
  if (uCurOn > .01 && L < uCurR && p.y < 2.5) v.xz += d/max(L, .001)*(1. - L/uCurR)*uCurPush*uCurOn*uDt*10.;
  gl_FragColor = vec4(v, 1.);
}`;

const POS = `
uniform float uDt; uniform vec3 uLook, uBox; uniform vec2 uRoadX;
uniform sampler2D tInfo;
void main(){
  vec2 uv = gl_FragCoord.xy/resolution.xy;
  vec4 p = texture2D(texturePosition, uv); vec3 v = texture2D(textureVelocity, uv).xyz; vec4 info = texture2D(tInfo, uv);
  p.xyz += v*uDt;
  if (info.x < .5){                                   // dust stays in a box around the camera's focus
    vec3 c = vec3(uLook.x, uBox.y*.5, uLook.z);
    p.xyz = c + mod(p.xyz - c + uBox*.5, uBox) - uBox*.5;
  } else if (info.x < 1.5){                           // thread wraps within a window of the road near the camera
    float x0 = max(uRoadX.x, uLook.x - 16.), x1 = min(uRoadX.y, uLook.x + 16.), w = max(x1 - x0, 1.);
    p.x = x0 + mod(p.x - x0, w);
  }
  p.y = max(p.y, .02);
  gl_FragColor = p;
}`;

const RVS = `
attribute vec2 aRef;
uniform sampler2D tPos, tInfo, tHome;
uniform vec4 uAtt[4], uBuilt[4];
uniform float uPx, uK, uIntro, uFogN, uFogF, uDim, uAmberGain;
uniform vec3 uDust, uThread, uLine, uAmberTint;
uniform vec3 uSizes, uAlphas;      // dust, thread, structure
varying vec4 vCol; varying vec3 vHot;
float pick(vec4 v, float c){ return c < .5 ? v.x : c < 1.5 ? v.y : c < 2.5 ? v.z : v.w; }
void main(){
  vec3 p = texture2D(tPos, aRef).xyz; vec4 info = texture2D(tInfo, aRef), home = texture2D(tHome, aRef);
  vec4 mv = modelViewMatrix*vec4(p, 1.); gl_Position = projectionMatrix*mv;
  float size, a; vec3 col; vHot = vec3(1.);
  if (info.x < .5){ col = uDust; size = uSizes.x; a = uAlphas.x*(.55 + .45*sin(info.w*40. + p.x*3.)); }
  else if (info.x < 1.5){ col = uThread; size = uSizes.y; a = uAlphas.y; vHot = uAmberGain*uAmberTint; }
  else { float z = home.w, at = pick(uAtt[int(floor(z/4.))], mod(z, 4.)), b = pick(uBuilt[int(floor(z/4.))], mod(z, 4.));
    col = uLine; size = uSizes.z; a = uAlphas.z*mix(.18, 1., at)*(1. - b); }
  float haze = smoothstep(uFogN, uFogF, -mv.z);
  vCol = vec4(col*uDim, a*(1. - haze)*uIntro);
  gl_PointSize = a > .002 ? size*uPx*clamp(uK/max(-mv.z, .1), .32, 2.2) : 0.;
}`;

const RFS = `
varying vec4 vCol; varying vec3 vHot;
vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c + .055)/1.055, vec3(2.4)), step(.04045, c)); }
void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
  gl_FragColor = vec4(toLinear(vCol.rgb*vCol.a*smoothstep(.5, .1, d))*vHot, 1.); }`;

export function createParticles({ renderer, NODES, mobile }){
  const G = CONFIG.gpu, SIZE = mobile ? G.mobile : G.desktop, N = SIZE*SIZE;
  const gpu = new GPUComputationRenderer(SIZE, SIZE, renderer);
  const pos0 = gpu.createTexture(), vel0 = gpu.createTexture(), home = gpu.createTexture(), info = gpu.createTexture();
  const P = pos0.image.data, H = home.image.data, I = info.image.data;
  let seed = 11; const rnd = () => { seed = (seed*16807) % 2147483647; return seed/2147483647; };

  // structure homes: points on the edges of every built node, zone by zone
  const zoneIdx = [];
  ZONES.forEach((z, zi) => { const S = z.sys && SYSTEMS[z.sys]; if (S && S.kinds) zoneIdx.push(zi); });
  const edges = [];   // [x0,y0,z0,x1,y1,z1,zone]
  NODES.forEach(n => { if (!zoneIdx.includes(n.zone) || n.hidden || n.shape) return; const S = SYSTEMS[ZONES[n.zone].sys]; if (!S.kinds[n.id]) return;
    const [, , w, d, h] = n.n, X0 = n.x - w/2, X1 = n.x + w/2, Z0 = n.z - d/2, Z1 = n.z + d/2, c = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
    for (let i = 0; i < 4; i++){ const a = c[i], b = c[(i + 1) % 4]; edges.push([a[0], 0, a[1], b[0], 0, b[1], n.zone], [a[0], h, a[1], b[0], h, b[1], n.zone], [a[0], 0, a[1], a[0], h, a[1], n.zone]); } });
  const eLen = edges.map(e => Math.hypot(e[3] - e[0], e[4] - e[1], e[5] - e[2])), eTot = eLen.reduce((a, b) => a + b, 0);
  // pick an edge in proportion to its length: binary search over cumulative lengths (keeps start-up fast)
  const cum = []; eLen.reduce((a, l, i) => (cum[i] = a + l), 0);
  const pickEdge = () => { const r = rnd()*eTot; let lo = 0, hi = cum.length - 1; while (lo < hi){ const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return edges[lo]; };

  const nS = edges.length ? Math.floor(N*G.share.structure) : 0, nT = Math.floor(N*G.share.thread), roadX = [-3.4, 102];
  const look0 = [0, 0, 0], box = G.dustBox;
  for (let i = 0; i < N; i++){
    const k = i*4; let type, x, y, z;
    if (i < nS){ type = 2; const e = pickEdge(), t = rnd(); x = e[0] + (e[3] - e[0])*t; y = e[1] + (e[4] - e[1])*t; z = e[2] + (e[5] - e[2])*t;
      H[k] = x; H[k + 1] = y; H[k + 2] = z; H[k + 3] = e[6];
      x += (rnd() - .5)*5; y += rnd()*2.5; z += (rnd() - .5)*5; }
    else if (i < nS + nT){ type = 1; x = roadX[0] + rnd()*(roadX[1] - roadX[0]); y = .04; z = ROAD_Z + (rnd() - .5)*.1; H[k + 3] = 0; }
    else { type = 0; x = look0[0] + (rnd() - .5)*box[0]; y = rnd()*box[1]; z = look0[2] + (rnd() - .5)*box[2]; H[k + 3] = 0; }
    P[k] = x; P[k + 1] = y; P[k + 2] = z; P[k + 3] = 1;
    I[k] = type; I[k + 1] = rnd(); I[k + 2] = rnd(); I[k + 3] = rnd();
  }

  const vVar = gpu.addVariable('textureVelocity', VEL, vel0), pVar = gpu.addVariable('texturePosition', POS, pos0);
  gpu.setVariableDependencies(vVar, [pVar, vVar]); gpu.setVariableDependencies(pVar, [pVar, vVar]);
  const att = new Float32Array(16), built = new Float32Array(16);
  Object.assign(vVar.material.uniforms, { uT:{ value:0 }, uDt:{ value:.016 }, uFlowScale:{ value:G.flow.scale }, uFlowAmp:{ value:G.flow.amp },
    uThreadSpeed:{ value:G.threadSpeed }, uCurOn:{ value:0 }, uCurR:{ value:G.cursor.radius }, uCurPush:{ value:G.cursor.push }, uRoadZ:{ value:ROAD_Z },
    uCur:{ value:new THREE.Vector3(0, -99, 0) }, uAtt:{ value:att }, tHome:{ value:home }, tInfo:{ value:info } });
  Object.assign(pVar.material.uniforms, { uDt:{ value:.016 }, uLook:{ value:new THREE.Vector3() }, uBox:{ value:new THREE.Vector3(...box) },
    uRoadX:{ value:new THREE.Vector2(...roadX) }, tInfo:{ value:info } });
  const err = gpu.init();
  if (err){ console.warn('GPU particles unavailable:', err); return null; }
  home.needsUpdate = info.needsUpdate = true;

  // one point per texel: the render shader reads its position straight from the simulation texture
  const geo = new THREE.BufferGeometry(), ref = new Float32Array(N*2);
  for (let i = 0; i < N; i++){ ref[i*2] = (i % SIZE + .5)/SIZE; ref[i*2 + 1] = (Math.floor(i/SIZE) + .5)/SIZE; }
  geo.setAttribute('aRef', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N*3), 3));
  const hex = h => new THREE.Color(h).convertLinearToSRGB();
  const mat = new THREE.ShaderMaterial({ vertexShader:RVS, fragmentShader:RFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    uniforms:{ tPos:{ value:null }, tInfo:{ value:info }, tHome:{ value:home }, uAtt:{ value:att }, uBuilt:{ value:built },
      uPx:{ value:renderer.getPixelRatio() }, uK:{ value:9 }, uIntro:{ value:0 }, uFogN:{ value:CONFIG.craft.fog.near }, uFogF:{ value:CONFIG.craft.fog.far }, uDim:{ value:1 },
      uAmberGain:{ value:CONFIG.render.amberGain }, uAmberTint:{ value:new THREE.Vector3(...CONFIG.render.amberTint) },
      uDust:{ value:hex(CONFIG.colors.cyan) }, uThread:{ value:hex(CONFIG.colors.amber) }, uLine:{ value:hex(CONFIG.colors.line) },
      uSizes:{ value:new THREE.Vector3(G.size.dust, G.size.thread, G.size.structure) }, uAlphas:{ value:new THREE.Vector3(G.alpha.dust, G.alpha.thread, G.alpha.structure) } } });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 1;
  points.layers.set(1);   // the floor's mirror skips the particle layer (it would double its cost)

  const api = {
    points, active:true,   // active = false pauses the simulation and hides the layer (quality tiers use this)
    /* lifts: how far each zone has lifted into 3D; zoneBuild: how built each zone is; look: where the camera looks */
    update(t, dt, { look, lifts, zoneBuild, cursor, cursorOn, intro, dim }){
      points.visible = api.active; if (!api.active) return;
      zoneIdx.forEach(zi => { att[zi] = Math.max(0, Math.min(1, (lifts[zi] - G.assemble[0])/(G.assemble[1] - G.assemble[0]))); built[zi] = zoneBuild[zi] || 0; });
      const vu = vVar.material.uniforms, pu = pVar.material.uniforms, step = Math.min(dt, 1/30);
      vu.uT.value = t*G.flow.speed; vu.uDt.value = step; pu.uDt.value = step; pu.uLook.value.copy(look);
      vu.uCur.value.copy(cursor); vu.uCurOn.value += ((cursorOn ? 1 : 0) - vu.uCurOn.value)*.1;
      gpu.compute();
      mat.uniforms.tPos.value = gpu.getCurrentRenderTarget(pVar).texture; mat.uniforms.uIntro.value = intro; mat.uniforms.uDim.value = dim;
    },
    setPx(v){ mat.uniforms.uPx.value = v; },
    dispose(){ gpu.dispose(); geo.dispose(); mat.dispose(); },
  };
  return api;
}
