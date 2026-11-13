/* =====================================================================
   quality.js: keeps the frame rate smooth on whatever GPU it runs on.

   Under vsync a browser cannot tell how much spare time a frame had, but
   it can see dropped frames. The governor watches frame intervals in
   short windows (CONFIG.quality.governor) and:

   1. once the opening is over, if frames are clean, it tries the high tier
      (depth of field and ambient occlusion); if that drops frames, it goes
      back to medium for good
   2. whenever medium drops frames for a sustained window, it steps down
      one rung: resolution 1.5x → 1.25x → 1x, then the floor mirror off,
      then the GPU particles off
   3. it never steps back up after a step down, so it cannot oscillate

   The refresh interval is estimated from the fastest frames, so 60 Hz,
   120 Hz and throttled displays are all judged against themselves.
   ===================================================================== */
import { CONFIG } from './config.js';

export function createGovernor({ post, floor, gpu, setDPR, dpr, startTier, mobile }){
  const Q = CONFIG.quality.governor;
  const ladder = [];                                     // step-down rungs, cheapest loss first
  [1.25, 1].forEach(d => { if (d < dpr) ladder.push(['resolution ' + d + 'x', () => setDPR(d)]); });
  if (floor && !mobile) ladder.push(['floor mirror off', () => floor.setReflect(false)]);
  if (gpu) ladder.push(['GPU particles off', () => { gpu.active = false; }]);
  let samples = [], t0 = 0, state = startTier === 'high' ? 'high' : 'medium', triedHigh = startTier !== 'medium' || mobile, downgraded = false;
  const log = [];
  const note = msg => { log.push(msg); if (Q.log) console.info('[quality]', msg); };

  function judge(){
    const s = samples.slice().sort((a, b) => a - b), refresh = s[Math.floor(s.length*.1)];   // the fastest frames show the display's refresh interval
    const slow = s.filter(v => v > refresh*1.5).length/s.length;                           // share of frames that missed a refresh
    samples = [];
    return slow;
  }
  return {
    log,
    get tier(){ return state; },
    /* call once per rendered frame with the interval since the last one (seconds) and the time since load */
    frame(dt, t){
      if (!Q.on || t < Q.warmup) return;
      samples.push(dt*1000);
      if (samples.length < Q.window) return;
      const slow = judge();
      if (state === 'trying-high'){
        if (slow > Q.dropShare){ post.setHigh(false); state = 'medium'; note(`high tier dropped ${Math.round(slow*100)}% of frames: back to medium`); }
        else { state = 'high'; note('high tier holds: keeping it'); }
        return;
      }
      if (!triedHigh && !downgraded && slow < Q.cleanShare){ triedHigh = true; state = 'trying-high'; post.setHigh(true); note('frames are clean: trying the high tier'); return; }
      if (slow > Q.dropShare){
        if (state === 'high'){ post.setHigh(false); state = 'medium'; note('high tier started dropping frames: medium'); return; }
        const rung = ladder.shift(); if (rung){ rung[1](); downgraded = true; note(`dropping ${Math.round(slow*100)}% of frames: ${rung[0]}`); }
      }
    },
  };
}
