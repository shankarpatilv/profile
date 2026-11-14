/* =====================================================================
   fallback.js: the version for browsers without WebGL (or when the 3D
   libraries cannot load). Each system is drawn as a static isometric
   blueprint in plain SVG, generated from the same data the 3D world uses
   (js/zones.js), so the two always match. The break switches still work:
   the failing part turns coral and the readouts say what happened, then
   it heals, using the same lines as the 3D version.
   ===================================================================== */
import { SYSTEMS } from './zones.js';

const NS = 'http://www.w3.org/2000/svg';
// what each break switch takes down, and what the readouts say (the same lines as js/world.js)
const BREAK = {
  hero:  { down:['b2'], tele:['Server b2 is down', 'Rerouting to 5 servers'], healed:['Healed', '6 of 6 servers healthy'] },   // b2 is replaced by whichever server is clicked
  git:   { down:['w2'], tele:['Worker 2 crashed', 'Partition 2 waits, nothing skipped'], healed:['Worker 2 restarted', 'Caught up, 0 events lost'] },
  cloud: { down:['a1', 'a2'], tele:['Zone A is down', 'Traffic moves to zones B and C'], healed:['Zone A is back', '0 failed requests'] },
  ik:    { down:[], off:['ck-st'], tele:['No note supports that', 'Refused, nothing invented'] },
  cg:    { down:['g4'], tele:['Expired login', 'Stopped at JWT with a 401'] },
};
// the 3D camera's own projection (CONFIG.camera yaw -.42, elevation .62): screen right = (.91, 0, .41), screen up = (.24, .81, -.53)
const iso = (x, y, z) => [(x*.91 + z*.41)*100, (-x*.24 + z*.53 - y*.81)*100];
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (parent) parent.appendChild(e); return e; };
const poly = pts => pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');

function draw(stage, key){
  const S = SYSTEMS[key], svg = el('svg', { viewBox:'0 0 10 10', 'aria-hidden':'true', preserveAspectRatio:'xMidYMid meet' }), groups = {};
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const grow = ([px, py]) => { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); };
  // the traffic routes first, so boxes sit on top of them
  const lines = el('g', {}, svg);
  (S.edges || '').split(' ').filter(Boolean).forEach(e => { const [a, b] = e.split('-'), A = S.nodes[a], B = S.nodes[b]; if (!A || !B) return;
    const p = iso(A[0], .02, A[1]), q = iso(B[0], .02, B[1]);
    el('path', { class:'ln' + ((S.offEdges || []).includes(e) ? ' off' : ''), 'data-edge':e, d:`M${p[0].toFixed(1)},${p[1].toFixed(1)}L${q[0].toFixed(1)},${q[1].toFixed(1)}` }, lines); });
  // the parts, back to front so nearer boxes overlap farther ones
  Object.entries(S.nodes).sort((a, b) => (b[1][0] - a[1][0]) + (a[1][1] - b[1][1])).forEach(([id, n]) => {
    const [x, z, w, d, h, label, hidden] = n, g = el('g', { class:hidden ? 'ghost' : '' }, svg); groups[id] = g;
    const X0 = x - w/2, X1 = x + w/2, Z0 = z - d/2, Z1 = z + d/2;
    const top = [iso(X0, h, Z0), iso(X1, h, Z0), iso(X1, h, Z1), iso(X0, h, Z1)];
    const left = [iso(X0, 0, Z1), iso(X1, 0, Z1), iso(X1, h, Z1), iso(X0, h, Z1)], right = [iso(X0, 0, Z0), iso(X0, 0, Z1), iso(X0, h, Z1), iso(X0, h, Z0)];   // the camera sees the -x and +z faces
    el('polygon', { class:'bx', points:poly(left) }, g); el('polygon', { class:'bx', points:poly(right) }, g); el('polygon', { class:'bx top', points:poly(top) }, g);
    [...top, ...left, ...right].forEach(grow);
    if (label && label !== 'new'){ const t = iso(x, h + .12, z); const tx = el('text', { x:t[0].toFixed(1), y:t[1].toFixed(1), 'text-anchor':'middle' }, g); tx.textContent = label; grow([t[0] - 40, t[1] - 14]); grow([t[0] + 40, t[1]]); }
  });
  const pad = 30; svg.setAttribute('viewBox', `${(x0 - pad).toFixed(0)} ${(y0 - pad).toFixed(0)} ${(x1 - x0 + pad*2).toFixed(0)} ${(y1 - y0 + pad*2).toFixed(0)}`);
  stage.classList.add('fb'); stage.prepend(svg);
  return { groups, svg };
}

export function drawFallback(){
  const drawn = {};
  document.querySelectorAll('.stage[data-stage]').forEach(stage => {
    const key = stage.dataset.stage; if (!SYSTEMS[key]) return;
    const { groups, svg } = draw(stage, key), tele = stage.querySelector('.tele'), base = tele ? tele.innerHTML : '';
    drawn[key] = { groups, svg };
    // the cover keeps its single switch; the projects are driven by the scenario runner (js/scenario-runner.js)
    if (key !== 'hero') return;
    const B = BREAK[key]; let timer = null;
    const reset = () => { clearTimeout(timer); Object.values(groups).forEach(g => g.classList.remove('down')); if (tele){ tele.innerHTML = base; tele.classList.remove('alert', 'calm'); } };
    const go = (id = 'b2') => { reset(); if (groups[id]) groups[id].classList.add('down');
      if (tele){ tele.innerHTML = [`Server ${id} is down`, B.tele[1]].join('<br>'); tele.classList.add('alert'); }
      timer = setTimeout(() => { Object.values(groups).forEach(g => g.classList.remove('down')); if (tele){ tele.innerHTML = B.healed.join('<br>'); tele.classList.replace('alert', 'calm'); } }, 3600); };
    // click any server in the drawing to take it down (as in the 3D version)
    ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'].forEach(id => { const g = groups[id]; if (!g) return; g.style.cursor = 'pointer'; g.style.pointerEvents = 'all'; g.addEventListener('click', () => go(id)); });
    svg.style.pointerEvents = 'auto';
  });
  // what the scenario runner uses when there is no WebGL: parts go coral, come back, or appear
  const bases = {}; document.querySelectorAll('.stage[data-stage] .tele').forEach(t => { bases[t.closest('.stage').dataset.stage] = t.innerHTML; });
  return {
    setNode(key, id, s){ const g = drawn[key] && drawn[key].groups[id]; if (!g) return; g.classList.toggle('down', s === 'down'); if (s === 'new') g.classList.remove('ghost'); if (s === 'hidden') g.classList.add('ghost'); },
    reset(key){ const d = drawn[key]; if (!d) return; Object.entries(d.groups).forEach(([id, g]) => { g.classList.remove('down'); g.classList.toggle('ghost', !!SYSTEMS[key].nodes[id][6]); });
      const st = document.querySelector(`.stage[data-stage="${key}"]`), tele = st && st.querySelector('.tele'); if (tele){ tele.innerHTML = bases[key]; tele.classList.remove('alert', 'calm'); }
      const sec = st && st.closest('section'), line = sec && sec.querySelector('[data-line]'); if (line && line.dataset.base) line.textContent = line.dataset.base; },
  };
}
