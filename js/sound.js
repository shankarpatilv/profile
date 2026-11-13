/* =====================================================================
   sound.js: optional, subtle sound, off by default (CONFIG.sound).
   Everything is synthesised with the Web Audio API, so there are no files
   to download. Nothing is created until the visitor turns sound on with
   the header toggle (browsers only allow audio after a click anyway).

     fail()   a low, soft thud when a break test takes something down
     heal()   two quiet rising notes when it heals
     build(r) a faint hum while a system is being built (r = build speed)
     tick()   a soft click when a pinned scroll-through changes step
   ===================================================================== */
import { CONFIG } from './config.js';

export function createSound(){
  const S = CONFIG.sound;
  let ctx = null, master = null, hum = null, humGain = null, on = false;

  function start(){
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = S.volume; master.connect(ctx.destination);
    // the build hum: two detuned low sines through a gentle low-pass, silent until a system builds
    humGain = ctx.createGain(); humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    hum = [S.hum, S.hum*1.503].map(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    lp.connect(humGain); humGain.connect(master);
  }
  const env = (node, peak, attack, decay, t0 = ctx.currentTime) => {
    node.gain.setValueAtTime(0, t0); node.gain.linearRampToValueAtTime(peak, t0 + attack); node.gain.exponentialRampToValueAtTime(.0001, t0 + attack + decay);
  };
  const tone = (freq, peak, attack, decay, type = 'sine', delay = 0) => {
    if (!on || !ctx) return; const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); g.connect(master); env(g, peak, attack, decay, t0); o.start(t0); o.stop(t0 + attack + decay + .05);
    return o;
  };

  return {
    get on(){ return on; },
    toggle(){ on = !on; if (on){ start(); ctx.resume(); } else if (ctx) ctx.suspend(); return on; },
    fail(){ const o = tone(110, .5, .01, .5, 'sine'); if (o) o.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + .45); tone(220, .08, .005, .12, 'triangle'); },
    heal(){ tone(523.25, .16, .02, .7); tone(783.99, .13, .02, .9, 'sine', .14); },
    tick(){ tone(1800, .035, .002, .05, 'triangle'); },
    build(rate){ if (!ctx || !on) return; humGain.gain.setTargetAtTime(Math.min(1, rate*S.humGain)*.12, ctx.currentTime, .15); },
  };
}
