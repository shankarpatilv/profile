/* =====================================================================
   post.js: how the 3D frame is finished, using pmndrs/postprocessing.
   The scene renders in linear HDR into a half-float buffer, then:

     [high tier]  ambient occlusion (N8AO, loaded only when needed)
     [high tier]  depth of field, focused on the zone you are looking at
     always       bloom (only amber and coral are bright enough),
                  brand-safe tone mapping, vignette, fine film grain
     always       SMAA anti-aliasing

   Bloom, vignette and the depth-of-field range are tuned per zone
   (CONFIG.post.zones) and eased between zones as you scroll.
   Settings live in CONFIG.render and CONFIG.post.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect,
         VignetteEffect, NoiseEffect, SMAAEffect, SMAAPreset, Effect, BlendFunction } from 'postprocessing';
import { CONFIG } from './config.js';

/* Brand-safe tone mapping: the Khronos PBR Neutral highlight curve, without its toe.
   The toe subtracts the darkest channel from dark colours, which strips the purple out of the
   Prussian and dusk blues. Below the compression start, colours pass through untouched. */
class BrandNeutralEffect extends Effect {
  constructor(){ super('BrandNeutral', `
    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
      const float start = .76, desat = .15; vec3 c = max(inputColor.rgb, 0.);
      float peak = max(c.r, max(c.g, c.b));
      if (peak >= start){ float d = 1. - start, np = 1. - d*d/(peak + d - start); c *= np/peak;
        float g = 1. - 1./(desat*(peak - np) + 1.); c = mix(c, vec3(np), g); }
      outputColor = vec4(c, inputColor.a); }`, { blendFunction:BlendFunction.SRC }); }
}

export function createPost({ renderer, scene, camera, mobile, tier, reducedMotion }){
  const R = CONFIG.render, PZ = CONFIG.post;
  const composer = new EffectComposer(renderer, { frameBufferType:THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  // depth of field: only on the high tier, focused on a world point the world moves each frame
  const focus = new THREE.Vector3();
  let dof = null, dofPass = null, ao = null, high = false;
  const mode = { agx:ToneMappingMode.AGX, aces:ToneMappingMode.ACES_FILMIC }[R.toneMapping];
  const bloom = new BloomEffect({ mipmapBlur:true, luminanceThreshold:R.bloom.threshold, luminanceSmoothing:R.bloom.smoothing, intensity:R.bloom.intensity, radius:R.bloom.radius });
  const vignette = new VignetteEffect({ offset:R.vignette.offset, darkness:R.vignette.darkness });
  const grain = new NoiseEffect({ premultiply:true }); grain.blendMode.opacity.value = reducedMotion ? 0 : PZ.grain;   // calm version: no moving grain
  composer.addPass(new EffectPass(camera, bloom, mode === undefined ? new BrandNeutralEffect() : new ToneMappingEffect({ mode }), vignette, grain));
  if (R.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset:mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH })));

  /* the high tier: depth of field and ambient occlusion, switched on and off at runtime by the quality governor.
     N8AO is a separate download, fetched the first time the high tier is used. */
  let aoLoading = null;
  function setHigh(on){
    if (on === high) return; high = on;
    if (on){
      if (PZ.dof.on){ if (!dof){ dof = new DepthOfFieldEffect(camera, { worldFocusDistance:8, worldFocusRange:PZ.dof.range, bokehScale:PZ.dof.bokeh, resolutionScale:.5 }); dof.target = focus; dofPass = new EffectPass(camera, dof); }
        composer.addPass(dofPass, 1); }
      if (PZ.ao.on){
        if (ao) composer.addPass(ao, 1);
        else if (!aoLoading) aoLoading = import('n8ao').then(({ N8AOPostPass }) => {
          ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
          Object.assign(ao.configuration, { aoRadius:PZ.ao.radius, distanceFalloff:PZ.ao.falloff, intensity:PZ.ao.intensity, color:new THREE.Color(PZ.ao.color), halfRes:true, gammaCorrection:false });
          ao.setQualityMode('Performance'); if (high) composer.addPass(ao, 1);
        }).catch(err => console.warn('Ambient occlusion unavailable:', err));
      }
    } else { if (dofPass) composer.removePass(dofPass); if (ao) composer.removePass(ao); }
  }
  if (tier === 'high') setHigh(true);

  // per-zone look, eased toward the zone you are in
  const cur = { bloom:R.bloom.intensity, vignette:R.vignette.darkness, range:PZ.dof.range };
  function setZone(zid, k = .05){
    const z = { ...PZ.zones.default, ...(PZ.zones[zid] || {}) };
    cur.bloom += (z.bloom - cur.bloom)*k; cur.vignette += (z.vignette - cur.vignette)*k; cur.range += (z.dofRange - cur.range)*k;
    bloom.intensity = cur.bloom; vignette.darkness = cur.vignette;
    if (dof) dof.cocMaterial.focusRange = cur.range;
  }
  return {
    render: dt => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h),
    setFocus: v => focus.copy(v),
    setZone, setHigh,
    get high(){ return high; },
    bloom,
  };
}
