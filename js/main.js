/* =====================================================================
   main.js: starts everything. If WebGL or the CDN is unavailable, the page
   falls back to a static blueprint version with all content intact.
   ===================================================================== */

import { createUI } from './ui.js';
import { createSound } from './sound.js';

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = innerWidth < 900;
const hooks = { onTele(){}, onLine(){}, onRev(){} };
const sound = createSound();   // silent until the visitor turns it on

let world = null;
try {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('WebGL is not available');
  const { createWorld } = await import('./world.js');   // three.js comes in with it; a CDN failure lands in the catch below
  world = createWorld({ canvas:document.getElementById('gl'), mobile, reducedMotion,
    onTele:(...a) => hooks.onTele(...a), onLine:(...a) => hooks.onLine(...a), onRev:(...a) => hooks.onRev(...a), onArrive:() => document.getElementById('s-contact').classList.add('arrived'), onBuild:r => sound.build(r) });
  root.classList.add('webgl');
} catch (err){
  console.warn('Static fallback:', err);
  root.classList.add('no-webgl');
}
Object.assign(hooks, createUI({ world, mobile, reducedMotion, sound }));
root.classList.add('app');
