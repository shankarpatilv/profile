/* =====================================================================
   built.js: "drawn, built, rendered". Every node a system lists in its
   `kinds` map (js/zones.js) is modelled here in real materials: glass,
   brushed aluminium, dark anodised internals, cool-white status lights.

   How the build works: every vertex knows which node it belongs to (aNode)
   and that node's height (aH). Per node, a build value 0..1 (uNB) sets a
   horizontal cut. Above the cut nothing exists yet; at the cut there is a
   hot amber seam; below it, the finished object. The world drives the
   build values from the camera (as you arrive) and from break tests
   (a failed part turns coral, a healed or new part builds again).

   Geometry is merged per material per zone, so a whole system costs a
   handful of draw calls.
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { SYSTEMS, ZONES } from './zones.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a)/(b - a)); return t*t*(3 - 2*t); };

/* The shader patch shared by every built material. Node lookups happen in the
   vertex shader (uniform arrays can only be indexed freely there). */
function buildable(mat, U, opts = {}){
  const coralMix = { value: opts.coralMix ?? 0 }, coralCol = { value: opts.coralCol || new THREE.Color(CONFIG.colors.coral) };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uCoralMix: coralMix, uCoralCol: coralCol });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aNode; attribute float aH;
        uniform vec4 uNB[32]; uniform vec4 uNS[32];
        varying float vLY; varying float vCut; varying float vSt; varying float vBuilding;
        float pick4(vec4 v, float c){ return c < .5 ? v.x : c < 1.5 ? v.y : c < 2.5 ? v.z : v.w; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float b = pick4(uNB[int(floor(aNode/4.))], mod(aNode, 4.));
        vSt = pick4(uNS[int(floor(aNode/4.))], mod(aNode, 4.));
        vCut = mix(-.03, aH + .03, b); vLY = transformed.y; vBuilding = step(b, .999);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uAmberHot, uCoralCol; uniform float uSeam, uCoralMix;
        varying float vLY; varying float vCut; varying float vSt; varying float vBuilding;`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vLY > vCut) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vSt > .5 && vSt < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, uCoralCol, uCoralMix);`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float seam = (1. - smoothstep(0., .016, vCut - vLY))*vBuilding;
        gl_FragColor.rgb += uAmberHot*seam*uSeam;`);
  };
  mat.customProgramCacheKey = () => 'built:' + mat.type;
  return mat;
}

/* ---------- the parts each kind of node is made of. Every part is [geometry, material key]. ---------- */
const RB = (w, h, d, r = .018) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w/4, h/4, d/4));
const at = (g, x, y, z) => g.translate(x, y, z);
const PLINTH = .035;
function partsFor(kind, w, d, h){
  const P = [], add = (g, m) => P.push([g, m]), gw = w - .02, gd = d - .02;   // glass sits just inside the linework
  const plinth = () => add(at(RB(w, PLINTH, d, .008), 0, PLINTH/2, 0), 'metal');
  const shell = (hh = h - PLINTH, y0 = PLINTH) => add(at(RB(gw, hh, gd), 0, y0 + hh/2, 0), 'glass');
  if (kind === 'server'){
    plinth(); shell();
    const blades = Math.max(3, Math.round(h/.085));
    for (let i = 0; i < blades; i++){ const y = PLINTH + .04 + i*(h - PLINTH - .07)/(blades - 1);
      add(at(new THREE.BoxGeometry(gw*.74, .014, gd*.74), 0, y, 0), 'dark');
      add(at(new THREE.BoxGeometry(gw*.5, .006, .006), -gw*.06, y + .002, gd*.37), 'led'); }
  } else if (kind === 'db'){
    const r = w/2;
    add(at(new THREE.CylinderGeometry(r, r, PLINTH, 48), 0, PLINTH/2, 0), 'metal');
    add(at(new THREE.CylinderGeometry(r - .01, r - .01, h - PLINTH, 64), 0, PLINTH + (h - PLINTH)/2, 0), 'glass');
    const k = Math.max(3, Math.round(h/.1));
    for (let i = 0; i < k; i++) add(at(new THREE.CylinderGeometry(r*.76, r*.76, .012, 48), 0, PLINTH + .04 + i*(h - PLINTH - .07)/(k - 1), 0), 'metal');
    add(at(new THREE.CylinderGeometry(r*.1, r*.1, h - PLINTH - .03, 12), 0, PLINTH + (h - PLINTH)/2, 0), 'led');
  } else if (kind === 'queue'){
    plinth(); shell(h, PLINTH);
    const k = Math.max(4, Math.round(w/.06));
    for (let i = 0; i < k; i++) add(at(new THREE.BoxGeometry(.018, h*.3, gd*.4), -gw*.42 + i*(gw*.84)/(k - 1), PLINTH + h/2, 0), i < k*.6 ? 'msg' : 'dark');
  } else if (kind === 'lb'){
    add(at(RB(w, h*.55, d, .012), 0, h*.275, 0), 'metal');
    for (let i = 0; i < 5; i++) add(at(new THREE.BoxGeometry(w*.9, .01, .012), 0, h*.1 + i*h*.085, d/2 + .002), 'dark');
    add(at(RB(gw, h*.45, gd), 0, h*.775, 0), 'glass');
    add(at(new THREE.BoxGeometry(gw*.6, .01, gd*.6), 0, h*.775, 0), 'led');
  } else if (kind === 'screen'){
    add(at(RB(w*.5, PLINTH, d*.6, .008), 0, PLINTH/2, 0), 'metal');
    add(at(new THREE.BoxGeometry(.02, h*.4, .02), 0, PLINTH + h*.2, 0), 'metal');
    add(at(RB(w, h*.6, .03, .01), 0, PLINTH + h*.4 + h*.3 - .02, 0), 'glass');
    add(at(new THREE.BoxGeometry(w*.82, h*.44, .004), 0, PLINTH + h*.4 + h*.3 - .02, -.002), 'dark');
  } else if (kind === 'users'){
    for (const [ox, oz] of [[-.04, -.03], [.045, -.02], [0, .045]]){
      add(at(new THREE.CylinderGeometry(.026, .03, .05, 24), ox, .025, oz), 'metal'); add(at(new THREE.SphereGeometry(.021, 24, 16), ox, .074, oz), 'metal'); }
  } else if (kind === 'ai'){
    plinth(); shell();          // the dichroic core is its own mesh so it can turn (see below)
  } else if (kind === 'vec'){
    plinth(); shell();
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++)
      add(at(new THREE.BoxGeometry(.03, .03, .03), -gw*.3 + i*gw*.2, PLINTH + .04 + j*.05, -gd*.3 + k*gd*.2), (i + k + j) % 5 === 0 ? 'led' : 'metal');
  }
  return P;
}

/* tag a geometry with its node, so the shader can cut and colour it */
function tag(g, node, h){
  const geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position.count;
  geo.setAttribute('aNode', new THREE.BufferAttribute(new Float32Array(n).fill(node), 1));
  geo.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(n).fill(h), 1));
  return geo;
}

/* soft contact shadows, baked once into a canvas per zone (no shadow maps) */
function contactShadow(nodes, cx, cz, size){
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const px = v => (v/size + .5)*S;
  const pass = (blur, alpha, grow) => { g.filter = `blur(${blur}px)`; g.fillStyle = `rgba(2,8,26,${alpha})`;
    nodes.forEach(o => { const sw = (o.w + grow)/size*S, sd = (o.d + grow)/size*S; g.fillRect(px(o.x - cx) - sw/2, px(o.z - cz) - sd/2, sw, sd); }); };
  pass(9, .5, .12); pass(2, .6, .02);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map:t, transparent:true, depthWrite:false, opacity:0 }));
  m.rotation.x = -Math.PI/2; m.position.set(cx, .002, cz); m.renderOrder = -1;
  return m;
}

export function createBuilt({ scene, NODES, nodeState, reducedMotion }){
  const C = CONFIG.colors, MC = CONFIG.materials, B = CONFIG.build;
  const nodeBuild = new Float32Array(128);
  const U = { uNB:{ value:nodeBuild }, uNS:{ value:nodeState }, uSeam:{ value:reducedMotion ? 0 : B.seam },
    uAmberHot:{ value:new THREE.Color(C.amber) } };
  const led = new THREE.Color(MC.led.color).multiplyScalar(MC.led.power);
  const M = {
    glass: buildable(new THREE.MeshPhysicalMaterial({ color:MC.glass.color, metalness:0, roughness:MC.glass.roughness, transparent:true, opacity:MC.glass.opacity, depthWrite:false,
      clearcoat:1, clearcoatRoughness:.03, iridescence:MC.glass.iridescence, iridescenceIOR:1.32, iridescenceThicknessRange:[180, 520], specularIntensity:1, envMapIntensity:MC.glass.envMapIntensity }),
      U, { coralMix:MC.coralGlass }),
    metal: buildable(new THREE.MeshPhysicalMaterial({ color:MC.metal.color, metalness:1, roughness:MC.metal.roughness, anisotropy:MC.metal.anisotropy, envMapIntensity:MC.metal.envMapIntensity }), U),
    dark:  buildable(new THREE.MeshPhysicalMaterial({ color:MC.dark.color, metalness:MC.dark.metalness, roughness:MC.dark.roughness, envMapIntensity:.9 }), U),
    led:   buildable(new THREE.MeshBasicMaterial({ color:led }), U, { coralMix:1, coralCol:new THREE.Color(C.coral).multiplyScalar(2.6) }),
    msg:   buildable(new THREE.MeshBasicMaterial({ color:new THREE.Color(C.amber).multiplyScalar(MC.msg.power) }), U, { coralMix:1, coralCol:new THREE.Color(C.coral).multiplyScalar(2) }),
    dich:  new THREE.MeshPhysicalMaterial({ color:0xffffff, metalness:1, roughness:.12, iridescence:1, iridescenceIOR:1.8, iridescenceThicknessRange:[250, 800], envMapIntensity:1.4 }),
  };

  /* one group per built zone; the zone's lift squashes it like the linework */
  const zones = [], spinners = [];
  ZONES.forEach((z, zi) => {
    const S = z.sys && SYSTEMS[z.sys]; if (!S || !S.kinds) return;
    const group = new THREE.Group(), byMat = {}, foot = [];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    NODES.forEach((n, i) => { if (n.zone !== zi) return; const kind = S.kinds[n.id]; if (!kind) return;
      const [, , w, d, h] = n.n;
      partsFor(kind, w, d, h).forEach(([g, m]) => { g.translate(n.x, 0, n.z); (byMat[m] = byMat[m] || []).push(tag(g, i, h)); });
      if (kind === 'ai'){   // the dichroic core turns, so it is its own mesh and scales in with its node's build
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(w*.26, 0), M.dich); core.position.set(n.x, PLINTH + (h - PLINTH)/2, n.z);
        core.userData.node = i; core.userData.y = core.position.y; spinners.push(core); group.add(core); }
      if (!n.hidden) foot.push({ x:n.x, z:n.z, w, d });
      x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); z0 = Math.min(z0, n.z); z1 = Math.max(z1, n.z); });
    Object.entries(byMat).forEach(([m, gs]) => { const mesh = new THREE.Mesh(mergeGeometries(gs), M[m]); if (M[m].transparent) mesh.renderOrder = 2; group.add(mesh); });
    const size = Math.max(x1 - x0, z1 - z0) + 1.6, shadow = contactShadow(foot, (x0 + x1)/2, (z0 + z1)/2, size);
    scene.add(shadow); scene.add(group);
    const members = NODES.map((n, i) => i).filter(i => NODES[i].zone === zi && S.kinds[NODES[i].id]);
    zones.push({ zi, group, shadow, members, x0, span:Math.max(.1, x1 - x0) });
  });

  /* per-node animation: new or healed parts build again over CONFIG.build.rebuild seconds */
  const prev = new Float32Array(128).fill(-1),  // node state last frame
         rebuildT = new Float32Array(128).fill(-1);
  function update(t, lifts, introBuild){
    spinners.forEach(s => { if (!reducedMotion){ s.rotation.y = t*.4; s.rotation.x = t*.23; }
      const k = smooth(.55, .9, nodeBuild[s.userData.node]); s.scale.setScalar(Math.max(.001, k)); s.visible = k > .001; });
    zones.forEach(Z => {
      const lift = lifts[Z.zi], zb = reducedMotion ? 1 : smooth(B.from, B.to, lift)*introBuild(Z.zi);
      Z.group.visible = zb > .001; Z.group.scale.y = Math.max(.001, lift);
      Z.shadow.material.opacity = zb*B.shadow; Z.shadow.visible = zb > .001;
      Z.members.forEach(i => {
        const st = nodeState[i];
        // a part that comes back (healed: down → normal) or starts (new: hidden → starting) builds from the ground up
        if ((prev[i] === 1 && st === 0) || (prev[i] === 2 && st === 3)) rebuildT[i] = t;
        prev[i] = st;
        const sweep = clamp(zb*(1 + B.stagger) - (NODES[i].x - Z.x0)/Z.span*B.stagger);
        const re = rebuildT[i] >= 0 && !reducedMotion ? clamp((t - rebuildT[i])/B.rebuild) : 1;
        nodeBuild[i] = st === 2 ? 0 : Math.min(sweep, re);
      });
    });
  }
  return { update, nodeBuild, materials:M };
}
