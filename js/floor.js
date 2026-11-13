/* =====================================================================
   floor.js: the drafting floor. It keeps everything the old grid did
   (minor and major lines, the sheet spreading out on load, the drafting
   lamp under the cursor, the distance fade) and adds a lacquer-like
   reflection of the built systems, the traffic and the beacon.

   The floor is drawn additively over the WebGL sky, so the page keeps its
   blueprint gradient; the reflection only adds light. The reflection is a
   planar mirror (three's Reflector) rendered at low resolution, softened
   by an 8-tap blur that grows with distance, weighted by a fresnel term,
   and faded out where the mirrored point falls off its texture.
   Phones skip the mirror and keep the grid (CONFIG.floor.mobileReflect).
   ===================================================================== */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CONFIG } from './config.js';

const VS = `
uniform mat4 textureMatrix;
varying vec4 vUv; varying vec3 vW;
void main(){ vUv = textureMatrix*vec4(position, 1.); vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

const FS = `
uniform sampler2D tDiffuse;
uniform vec3 uCam, uCyan, uLamp; uniform vec2 uScanC;
uniform float uSizeG, uFade, uOp, uDim, uLampR, uLampS, uScanX, uScanW, uScanOn, uReveal, uRefl, uBlur, uReflFade;
varying vec4 vUv; varying vec3 vW;
float line(float v, float w){ float f = abs(fract(v) - .5); return smoothstep(.5 - w, .5, f); }   // 1 on a grid line, 0 between lines
vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c + .055)/1.055, vec3(2.4)), step(.04045, c)); }
void main(){
  float dist = distance(vW, uCam), w = clamp(.0016*dist/uSizeG, .006, .45), w5 = clamp(.0016*dist/(uSizeG*5.), .003, .45);
  float minor = max(line(vW.x/uSizeG, w), line(vW.z/uSizeG, w))*(1. - smoothstep(9., 34., dist));
  float major = max(line(vW.x/(uSizeG*5.), w5), line(vW.z/(uSizeG*5.), w5));
  float g = minor*.5 + major*.6;
  float fade = 1. - smoothstep(uFade*.35, uFade, dist);
  float reveal = 1. - smoothstep(uReveal - 4., uReveal, length(vW.xz));                       // the sheet spreads out from the hero
  float lamp = (1. - smoothstep(0., uLampR, distance(vW.xz, uLamp.xz)))*uLampS;               // the drafting lamp under the cursor
  float scan = uScanOn*exp(-pow((vW.x - uScanX)/uScanW, 2.))*(1. - smoothstep(3., 7., distance(vW.xz, uScanC)));
  vec3 gc = mix(uCyan, vec3(1.), lamp*.35);
  float ga = (g*(1. + lamp*1.5) + major*scan*.9 + lamp*.012)*fade*uOp*reveal;
  // the grid, blended as it always was (alpha in sRGB), then into linear light
  vec3 col = toLinear(gc*uDim*ga);
  // the reflection: blurred, fresnel-weighted, faded with distance and at the texture's edges
  if (uRefl > 0.){
    vec2 uv0 = vUv.xy/vUv.w;
    float edge = smoothstep(0., .06, uv0.x)*smoothstep(1., .94, uv0.x)*smoothstep(0., .06, uv0.y)*smoothstep(1., .94, uv0.y);
    float rot = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))))*6.2831;
    float b = uBlur*(.6 + dist*.08); vec3 r = vec3(0.);
    for (int i = 0; i < 8; i++){ float fi = float(i) + .5, a = fi*2.399 + rot; r += texture2D(tDiffuse, clamp(uv0 + vec2(cos(a), sin(a))*b*sqrt(fi/8.), .001, .999)).rgb; }
    vec3 V = normalize(uCam - vW); float fres = .25 + .75*pow(1. - max(V.y, 0.), 4.);
    col += r/8.*edge*fres*uRefl*uDim*reveal*(1. - smoothstep(uReflFade*.4, uReflFade, dist));
  }
  gl_FragColor = vec4(col, 1.);
}`;

export function createFloor({ renderer, mobile, reducedMotion, onMirror = () => {} }){
  const F = CONFIG.floor, G = CONFIG.grid;
  let reflect = F.reflect > 0 && (!mobile || F.mobileReflect);
  const res = () => [Math.max(64, Math.round(innerWidth*renderer.getPixelRatio()*F.resolution)), Math.max(64, Math.round(innerHeight*renderer.getPixelRatio()*F.resolution))];
  const [tw, th] = res();
  const shader = { name:'DraftingFloor', vertexShader:VS, fragmentShader:FS,
    uniforms:{ color:{ value:null }, tDiffuse:{ value:null }, textureMatrix:{ value:null },
      uCam:{ value:new THREE.Vector3() }, uCyan:{ value:new THREE.Color(CONFIG.colors.cyan).convertLinearToSRGB() },
      uLamp:{ value:new THREE.Vector3(0, -99, 0) }, uLampR:{ value:CONFIG.craft.lamp.radius }, uLampS:{ value:0 },
      uScanX:{ value:0 }, uScanW:{ value:CONFIG.craft.scan.width }, uScanOn:{ value:0 }, uScanC:{ value:new THREE.Vector2() },
      uReveal:{ value:reducedMotion ? 999 : 0 }, uSizeG:{ value:G.size }, uFade:{ value:G.fade }, uOp:{ value:G.opacity }, uDim:{ value:1 },
      uRefl:{ value:reflect ? F.reflect : 0 }, uBlur:{ value:F.blur }, uReflFade:{ value:F.fade } } };
  // the plane spans the whole journey (the old grid quad: x -140..240, z -160..160)
  const floor = new Reflector(new THREE.PlaneGeometry(380, 320), { shader, textureWidth:tw, textureHeight:th, clipBias:.003, multisample:0 });
  floor.rotation.x = -Math.PI/2; floor.position.set(50, 0, 0);
  const m = floor.material; m.transparent = true; m.depthWrite = false; m.blending = THREE.AdditiveBlending;
  floor.renderOrder = 0; floor.frustumCulled = false;
  // the mirror only sees the world (layer 0): not the sky, not the shadows (layer 1), so it adds light and nothing else
  const mirror = floor.onBeforeRender, black = new THREE.Color(0), keep = new THREE.Color();
  let camSet = false, frame = 0;
  // the mirror re-renders every CONFIG.floor.every frames: under a lacquer blur a one-frame lag is invisible, and it halves the cost
  floor.onBeforeRender = (r, s, c) => { if (!reflect || (frame++ % F.every) !== 0) return;
    if (!camSet){ floor.getReflectionCamera(c).layers.set(0); camSet = true; }
    r.getClearColor(keep); const a = r.getClearAlpha(); r.setClearColor(black, 1); onMirror(true); mirror.call(floor, r, s, c); onMirror(false); r.setClearColor(keep, a); };   // onMirror lets the points skip dust in the reflection
  const resize = () => { const [w, h] = res(); floor.getRenderTarget().setSize(w, h); };
  // setReflect: quality tiers (and the ?debug hook) can switch the mirror off or change its resolution at runtime
  const setReflect = (on, resolution) => { reflect = on; m.uniforms.uRefl.value = on ? F.reflect : 0; if (resolution){ F.resolution = resolution; resize(); } };
  return { mesh:floor, uniforms:m.uniforms, resize, setReflect };
}
