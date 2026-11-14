/* =====================================================================
   scenario-runner.js: plays the scenarios defined in js/scenarios.js.

   Each scenario becomes one GSAP timeline: every step is a call placed at
   its `at` time. Starting a scenario cancels whatever is running in that
   project and resets the system first. The running button shows a pulsing
   state (aria-pressed). Narration goes to the readout and the one-line
   text, both aria-live, so screen readers hear each step.

   Reduced motion: no travelling bead and no timeline; each step's state
   appears at once, and a "Next step" button advances through them.

   Without WebGL the same steps drive the SVG drawing (js/fallback.js):
   parts turn coral or come back, and the narration is identical.
   ===================================================================== */
import { SCENARIOS } from './scenarios.js';

const ZONE = { hero:'s-cover', git:'s-git', cloud:'s-cloud', ik:'s-ik', cg:'s-cg' };

export function createScenarioRunner({ world, api, reducedMotion, sound, fallback, scrollTo = null }){
  const gsap = window.gsap;
  const running = {};   // per project: { tl, scn, i (next step, reduced motion) }
  let fb = null; if (fallback) fallback.then(f => { fb = f; });

  // what a step does, against the 3D world or the SVG fallback
  function apply(key, step, next){
    const zid = ZONE[key], W = world && world.scn;
    Object.entries(step.nodes || {}).forEach(([id, s]) => { if (W) W.setNode(zid, id, s); else if (fb) fb.setNode(key, id, s); });
    if (W){
      Object.entries(step.edges || {}).forEach(([e, s]) => W.setEdge(zid, e, s));
      (step.flash || []).forEach(id => W.flash(zid, id));
      Object.entries(step.labels || {}).forEach(([id, t]) => W.label(zid, id, t));
      if (step.traffic) W.traffic(step.traffic);
      const dur = step.beadDur ?? Math.max(.4, (next ? next.at : step.at + 1) - step.at);
      if (step.bead) W.bead(zid, step.bead, dur);
      (step.beads || []).forEach(p => W.bead(zid, p, dur));
      if ('focus' in step) W.focus(zid, step.focus);
    }
    if (step.tele) api.onTele(zid, step.tele, step.tone, true);   // quiet: the runner plays its own sounds
    if (step.line) api.onLine(zid, step.line, step.tone);
    if (step.rev) api.onRev(zid, step.rev === 'C');
    if (sound){ if (step.rev === 'C') sound.fail(); else if (step.tone === 'calm' && !next) sound.heal(); else if (step.flash) sound.tick(); }
  }

  const buttons = key => [...document.querySelectorAll(`[data-scn^="${key}:"]`)];
  const nextBtn = key => document.querySelector(`[data-scn-next="${key}"]`);
  function setRunning(key, id){
    buttons(key).forEach(b => { const on = b.dataset.scn === `${key}:${id}`; b.classList.toggle('running', on); b.setAttribute('aria-pressed', String(on)); });
    const nb = nextBtn(key); if (nb) nb.hidden = !(reducedMotion && id);
  }

  function stop(key){
    const r = running[key]; if (r && r.tl) r.tl.kill();
    delete running[key]; setRunning(key, null);
    if (world && world.scn) world.scn.reset(ZONE[key]);   // also restores the readout, one-line text and Rev
    else { if (fb) fb.reset(key); api.onTele(ZONE[key], null, null, true); api.onLine(ZONE[key], null); api.onRev(ZONE[key], false); }
  }

  function start(key, id){
    const scn = (SCENARIOS[key] || []).find(s => s.id === id); if (!scn) return;
    stop(key);                                   // cancel anything running here, and reset the system first
    const steps = scn.steps.slice().sort((a, b) => a.at - b.at);
    setRunning(key, id);
    if (reducedMotion || !gsap){
      // the calm version: the first step now, the rest one click at a time
      running[key] = { scn, steps, i:1 }; apply(key, steps[0], steps[1]);
      if (steps.length < 2) setRunning(key, null);
      return;
    }
    const tl = gsap.timeline({ onComplete:() => { if (running[key] && running[key].tl === tl){ delete running[key]; setRunning(key, null); } } });
    steps.forEach((s, i) => tl.call(apply, [key, s, steps[i + 1]], s.at));
    tl.to({}, { duration:1 });                   // a beat after the last step before the button relaxes
    running[key] = { scn, tl };
  }

  function nextStep(key){
    const r = running[key]; if (!r || !r.steps) return;
    apply(key, r.steps[r.i], r.steps[r.i + 1]); r.i++;
    if (r.i >= r.steps.length){ delete running[key]; setRunning(key, null); }
  }

  // on a phone the section is taller than the screen: the buttons sit below the drawing, so bring the drawing into view first
  function play(key, id){
    const stage = document.querySelector(`#${ZONE[key]} .stage`), r = stage && stage.getBoundingClientRect();
    if (scrollTo && innerWidth < 700 && r && (r.top < -40 || r.bottom > innerHeight + 40)){
      scrollTo(scrollY + r.top - 70); setTimeout(() => start(key, id), reducedMotion ? 0 : 750);
    } else start(key, id);
  }
  document.querySelectorAll('[data-scn]').forEach(b => b.addEventListener('click', () => { const [key, id] = b.dataset.scn.split(':'); play(key, id); }));
  document.querySelectorAll('[data-scn-reset]').forEach(b => b.addEventListener('click', () => stop(b.dataset.scnReset)));
  document.querySelectorAll('[data-scn-next]').forEach(b => b.addEventListener('click', () => nextStep(b.dataset.scnNext)));
  return { start, stop, get running(){ return Object.keys(running); } };
}
