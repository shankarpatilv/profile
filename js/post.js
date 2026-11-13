/* =====================================================================
   post.js: how the 3D frame is finished, using pmndrs/postprocessing.
   The scene renders in linear HDR into a half-float buffer, then one merged
   pass applies bloom (only amber and coral are bright enough), tone mapping
   (a brand-safe Khronos PBR Neutral keeps the brand colours true) and a vignette, and a
   last pass applies SMAA anti-aliasing. Settings live in CONFIG.render.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
         VignetteEffect, SMAAEffect, SMAAPreset, Effect, BlendFunction } from 'postprocessing';
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

export function createPost({ renderer, scene, camera, mobile }){
  const R = CONFIG.render;
  const composer = new EffectComposer(renderer, { frameBufferType:THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const mode = { agx:ToneMappingMode.AGX, aces:ToneMappingMode.ACES_FILMIC }[R.toneMapping];
  const bloom = new BloomEffect({ mipmapBlur:true, luminanceThreshold:R.bloom.threshold, luminanceSmoothing:R.bloom.smoothing, intensity:R.bloom.intensity, radius:R.bloom.radius });
  composer.addPass(new EffectPass(camera, bloom, mode === undefined ? new BrandNeutralEffect() : new ToneMappingEffect({ mode }), new VignetteEffect({ offset:R.vignette.offset, darkness:R.vignette.darkness })));
  if (R.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset:mobile ? SMAAPreset.MEDIUM : SMAAPreset.HIGH })));
  return {
    render: dt => composer.render(dt),
    setSize: (w, h) => composer.setSize(w, h),
    bloom,
  };
}
