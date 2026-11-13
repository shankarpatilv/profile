/* =====================================================================
   ui.js: ONE scroll system and everything that reacts to it.
   Lenis smooths native scrolling (it never blocks it), ScrollTrigger handles
   every scroll-linked event, and a single GSAP ticker drives Lenis, the 3D
   world and the cursor together: one loop for the whole site.
   ===================================================================== */

import { CONFIG } from './config.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KEY = { 'hero':'s-cover', 'git':'s-git', 'cloud':'s-cloud', 'ik':'s-ik', 'cg':'s-cg' };
const TELE = { 's-cover':'tele-hero', 's-git':'tele-git', 's-cloud':'tele-cloud', 's-ik':'tele-ik', 's-cg':'tele-cg' };

export function createUI({ world, mobile, reducedMotion, sound = null }){
  const gsap = window.gsap, ST = window.ScrollTrigger, LenisC = window.Lenis, touch = matchMedia('(hover: none)').matches;
  const libs = !!(gsap && ST);
  const root = document.documentElement;

  /* ---------- the readouts, one-liners and revision letters the world talks to ---------- */
  const teleDefault = {}, lineDefault = {};
  Object.entries(TELE).forEach(([zid, id]) => { const el = document.getElementById(id); if (el) teleDefault[zid] = el.innerHTML; });
  $$('[data-line]').forEach(el => { lineDefault[el.closest('section').id] = el.textContent; });
  const api = {
    onTele(zid, lines, tone){ if (sound){ if (tone === 'alert' && lines && /down|crashed|expired/i.test(lines[0])) sound.fail(); else if (tone === 'calm') sound.heal(); }
      const el = document.getElementById(TELE[zid]); if (!el) return; el.innerHTML = lines ? lines.join('<br>') : teleDefault[zid]; el.classList.toggle('alert', tone === 'alert'); el.classList.toggle('calm', tone === 'calm'); },
    onLine(zid, text, tone){ const el = $(`#${zid} [data-line]`); if (!el) return; el.textContent = text || lineDefault[zid]; el.classList.toggle('alert', tone === 'alert'); el.classList.toggle('calm', tone === 'calm'); },
    onRev(zid, isBroken){ const el = $(`#${zid} [data-rev]`); if (!el) return; el.textContent = isBroken ? 'C' : 'B'; el.style.color = isBroken ? 'var(--coral)' : ''; },
  };

  /* ---------- the break switches ---------- */
  function wire(w){
    $$('[data-break]').forEach(b => b.addEventListener('click', () => w.breakZone(KEY[b.dataset.break])));
    $$('[data-reset]').forEach(b => b.addEventListener('click', () => w.resetZone(KEY[b.dataset.reset])));
    // click any app server in the cover drawing to take it down
    const stackIds = $$('#s-bom .card').map(c => c.dataset.part);
    addEventListener('click', e => { if (e.target.closest('a,button,input,label,summary')) return; const z = w.activeZone();
      if (z === w.zoneIndex['s-cover']){ const id = w.hitServer(e.clientX, e.clientY); if (id) w.breakZone('s-cover', id); }
      if (z === w.zoneIndex['s-bom']){ const id = w.hitNode('s-bom', stackIds, e.clientX, e.clientY); if (id) jumpStep('s-bom', stackIds.indexOf(id)); } });
    if (!touch) addEventListener('pointermove', e => { const z = w.activeZone(); let over = false;
      let hid = null, hz = null;
      if (!e.target.closest('a,button')){ if (z === w.zoneIndex['s-bom']){ hid = w.hitNode('s-bom', stackIds, e.clientX, e.clientY); hz = 's-bom'; } else if (z === w.zoneIndex['s-cover']){ hid = w.hitServer(e.clientX, e.clientY); hz = 's-cover'; } }
      over = !!hid; w.setHover(hz, hid); document.body.classList.toggle('over-part', over); }, { passive:true });
    if (!touch && !reducedMotion) addEventListener('pointermove', e => w.setPointer(e.clientX/innerWidth - .5, e.clientY/innerHeight - .5), { passive:true });
  }
  // tiles linked to a piece of the drawing: the Off duty interests
  const tiles = zid => $$(`#${zid} [data-part]`);
  const lightPart = (zid, id) => { tiles(zid).forEach(p => p.classList.toggle('on', p.dataset.part === id)); if (world) world.highlight(zid, id); };
  const swept = {}; const sweep = zid => { if (swept[zid] || reducedMotion) return; swept[zid] = true; const t = tiles(zid); t.forEach((p, i) => setTimeout(() => lightPart(zid, p.dataset.part), 700 + i*650)); setTimeout(() => lightPart(zid, null), 700 + t.length*650); };
  ['s-off'].forEach(zid => tiles(zid).forEach(p => { p.addEventListener('pointerenter', () => lightPart(zid, p.dataset.part)); p.addEventListener('pointerleave', () => lightPart(zid, null)); p.addEventListener('click', () => lightPart(zid, p.classList.contains('on') ? null : p.dataset.part)); }));

  /* ---------- staggered reveals inside each section ---------- */
  $$('.proj .call').forEach(c => { const i = [...c.parentNode.children].indexOf(c); c.style.setProperty('--cd', (.35 + i*.12) + 's'); });
  $$('.review .ed').forEach((e, i) => { const d = .25 + i*.45; e.style.setProperty('--sd', d + 's'); const w = $('.why', e); if (w) w.style.setProperty('--hd', (d + .9) + 's'); });

  /* ---------- split-text headings: words rise into place when their section arrives ---------- */
  const split = el => { const words = el.textContent.trim().split(/\s+/); el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map(w => `<span class="sw" aria-hidden="true">${[...w].map(ch => `<span class="ch">${ch}</span>`).join('')}</span>`).join(' '); return $$('.ch', el); };
  const heads = CONFIG.effects.splitText && libs && !reducedMotion ? $$('.sh-t, .contact .big') : [];
  const headWords = heads.map(h => split(h));

  /* ---------- the pinned scroll-throughs (How I got here, Tech stack): one step at a time ---------- */
  const stepSecs = $$('.steps').map(S => { const lis = $$('.rail li', S), cards = $$('.card', S), rail = $('.rail', S), hint = $('.scrollhint', S), n = cards.length; let cur = -1;
    const show = p => { const i = Math.min(n - 1, Math.floor(p*n*.999)); if (i === cur) return; if (cur >= 0 && sound) sound.tick(); cur = i;
      cards.forEach((c, k) => { c.classList.toggle('on', k === i); c.classList.toggle('past', k < i); c.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
      lis.forEach((l, k) => { l.classList.toggle('done', k < i); l.classList.toggle('cur', k === i); }); if (rail) rail.style.setProperty('--p', i/(n - 1)); if (hint) hint.style.opacity = i === n - 1 ? 0 : 1;
      if (world && cards[i].dataset.part) world.highlight(S.id, cards[i].dataset.part); };
    show(0);
    $$('[data-go]', S).forEach(bt => bt.addEventListener('click', () => jumpStep(S.id, +bt.dataset.go)));
    return { S, show, n }; });
  // jump straight to one step of a scroll-through (a rail button, or a box clicked in the drawing)
  function jumpStep(id, i){ const o = stepSecs.find(x => x.S.id === id); if (!o || i < 0) return; const r = o.S.getBoundingClientRect(), span = r.height - innerHeight; goTo(scrollY + r.top + span*((i + .5)/o.n)); }
  if (world) wire(world);

  /* ---------- smooth anchor links ---------- */
  let lenis = null;
  const goTo = y => lenis ? lenis.scrollTo(y, { duration:CONFIG.choreo.nav.duration, easing:t => 1 - Math.pow(1 - t, 4) }) : scrollTo({ top:y, behavior:reducedMotion ? 'auto' : 'smooth' });
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => { const t = document.querySelector(a.getAttribute('href')); if (!t) return; e.preventDefault(); goTo(t.getBoundingClientRect().top + scrollY); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll:true }); }));

  /* ---------- cursor and magnetic buttons (pointer devices only, never with reduced motion) ---------- */
  let cursorTick = () => {};
  if (CONFIG.effects.cursor && !touch && !reducedMotion){
    const ring = document.createElement('div'); ring.className = 'cursor'; ring.setAttribute('aria-hidden', 'true'); document.body.appendChild(ring);
    let cx = -100, cy = -100, rx = -100, ry = -100;
    addEventListener('pointermove', e => { cx = e.clientX; cy = e.clientY; ring.classList.add('on'); }, { passive:true });
    addEventListener('pointerleave', () => ring.classList.remove('on'));
    document.addEventListener('pointerover', e => ring.classList.toggle('hot', !!e.target.closest('a,button')));
    cursorTick = () => { rx += (cx - rx)*.2; ry += (cy - ry)*.2; ring.style.transform = `translate(${rx}px,${ry}px)`; };
  }
  if (CONFIG.effects.magnetic && !touch && !reducedMotion) $$('.btn').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(), x = e.clientX - (r.left + r.width/2), y = e.clientY - (r.top + r.height/2); b.style.transform = `translate(${x*.22}px,${y*.3}px)`; });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; }); });

  /* ---------- the sound toggle: added only when scripting works; off until clicked ---------- */
  if (sound){ const nav = $('.top nav'), b = document.createElement('button');
    b.className = 'snd'; b.type = 'button'; b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', 'Sound');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="w" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
    b.addEventListener('click', () => b.setAttribute('aria-pressed', String(sound.toggle())));
    if (nav) nav.appendChild(b); }

  /* ---------- header ---------- */
  const top = $('#top'), solid = y => top && top.classList.toggle('solid', y > 30);

  if (libs){
    gsap.registerPlugin(ST);
    if (!reducedMotion && LenisC){ lenis = new LenisC({ lerp:.1, smoothWheel:true }); lenis.on('scroll', ST.update); }
    // ONE loop: Lenis, the world and the cursor all tick here; rendering pauses with the tab
    gsap.ticker.add(time => { if (lenis) lenis.raf(time*1000); if (world && !document.hidden) world.tick(time); cursorTick(); });
    gsap.ticker.lagSmoothing(0);
    ST.create({ start:0, end:'max', onUpdate:s => solid(s.scroll()) });
    $$('.sheet, .work-intro').forEach(s => ST.create({ trigger:s, start:'top 65%', once:true, onEnter:() => { s.classList.add('drawn'); if (s.id === 's-off') sweep(s.id); } }));
    heads.forEach((h, i) => gsap.from(headWords[i], { yPercent:105, rotateX:-85, opacity:0, transformOrigin:'50% 100%', duration:1.1, ease:'expo.out', stagger:.022, scrollTrigger:{ trigger:h, start:'top 85%', once:true } }));
    stepSecs.forEach(o => ST.create({ trigger:o.S, start:'top top', end:'bottom bottom', onUpdate:s => o.show(s.progress) }));
    if (world){ ST.addEventListener('refresh', () => world.refresh()); world.refresh(); }
    ST.refresh();
  } else {
    // the scripts did not load: native scrolling, one rAF loop, everything visible
    $$('.sheet, .work-intro').forEach(s => s.classList.add('drawn'));
    const loop = t => { if (world && !document.hidden) world.tick(t/1000); cursorTick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    const onScroll = () => { solid(scrollY); stepSecs.forEach(o => { const r = o.S.getBoundingClientRect(); o.show(Math.max(0, Math.min(1, -r.top/Math.max(1, r.height - innerHeight)))); }); };
    addEventListener('scroll', onScroll, { passive:true }); onScroll();
    if (world){ world.refresh(); addEventListener('resize', () => world.refresh()); }
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { root.classList.add('ready'); if (libs) ST.refresh(); else if (world) world.refresh(); });
  return api;
}
