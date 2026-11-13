# Vivek Shankar Patil, portfolio

A living blueprint. Every section is a zone on one drafting plane, joined by an amber thread of traffic. As you scroll, the camera travels from system to system; each one is **drawn** (stippled plan linework), **built** (an amber construction seam sweeps it up in glass and brushed metal) and **rendered** (live traffic, reflections, bloom), then dissolves back to linework as you leave. Break tests take parts down in coral; they heal by rebuilding.

All text is real HTML over one WebGL canvas, so it stays readable, selectable and indexable.

Live: <https://shankarpatilv.github.io/profile/>

## Run it locally

No build step. Any static server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk will not work (ES modules need a server).

Useful URL flags:

| Flag | What it does |
|---|---|
| `?quality=high` | Force the high tier (depth of field and ambient occlusion); turns the quality governor off |
| `?quality=medium` | Force the medium tier |
| `?debug` | Exposes `window.__debug` (floor, built systems, post stack, particles, governor) for measuring |

## Deploy

The site is static and deploys with GitHub Pages straight from `main` (Settings → Pages → Deploy from a branch → `main` / root). Push to `main` and Pages publishes it. Libraries load from jsDelivr and cdnjs at pinned versions, so there is nothing to build or bundle.

## How it is put together

```
index.html          markup and copy (the source of truth for all text), import map with pinned versions
css/style.css       all styles; fonts in fonts/ (subset WOFF2)
js/config.js        EVERY tunable setting, commented
js/zones.js         the systems (nodes, edges, what each node is built as) and the zones in page order
js/main.js          starts everything; falls back to the static version if WebGL or the CDN fails
js/world.js         the scene, camera path, linework points, labels, break tests, the render loop
js/built.js         glass and metal models for each node, the construction cut, coral failures
js/floor.js         the drafting floor: grid, sheet reveal, cursor lamp, lacquer reflection
js/particles.js     262k GPU-simulated particles: flow-field dust, thread traffic, assembly
js/post.js          bloom, brand-safe tone mapping, vignette, grain, SMAA; DOF and AO on the high tier
js/quality.js       the governor that keeps frames smooth (tries high, steps down when frames drop)
js/ui.js            scrolling (Lenis + GSAP ScrollTrigger), pinned scroll-throughs, cursor, buttons, sound toggle
js/sound.js         synthesised sound (Web Audio), on by default, muted from the header
js/fallback.js      the no-WebGL version: an SVG drawing of each system with working break switches
assets/env/         the studio HDRI used for reflections
archive/one-world-max/   the previous version, kept as it was
```

## Tweak it

Everything you would want to tune is in `js/config.js`, grouped and commented. The common ones:

| Setting | Controls |
|---|---|
| `colors` | the palette (amber is live traffic only, coral is failures only) |
| `camera` | field of view, damping, the three-quarter angle, how long travel takes |
| `build` | when a system builds as you arrive, the seam brightness, how strong the linework stays once built |
| `materials` | glass, metal, internals, status lights |
| `floor` | reflection strength, resolution, softness, how often the mirror updates |
| `gpu` | particle counts, flow field, thread speed, cursor force, sizes, transparency |
| `render` | bloom, tone mapping, vignette, how bright amber is drawn |
| `post` | grain, depth of field, ambient occlusion, and per-zone looks (`post.zones`) |
| `quality` | the starting tier and the governor's thresholds |
| `choreo` | the opening dolly, header-link easing, the camera lean on break tests |
| `sound` | on by default, volume, hum pitch |

To add or change a system, edit `js/zones.js`: a node is `[x, z, width, depth, height, label, startsHidden]`, `edges` lists the traffic routes, and `kinds` says what each node is built as (`server`, `db`, `queue`, `lb`, `screen`, `users`, `ai`, `vec`, `gate`, `card`, `small`, `puck`). The 3D world and the no-WebGL drawing both read from it.

## Performance, accessibility and fallbacks

- **Quality tiers.** Phones: no reflection, depth of field or ambient occlusion; 65k particles. Desktops start on medium (1.5x resolution, reflection, 262k particles). After the opening, `js/quality.js` tries the high tier if frames are clean and keeps it only if it holds; if frames drop it steps down (resolution, then reflection, then particles). Pixel ratio never exceeds 2. Rendering pauses in hidden tabs, and a lost GPU context is handled.
- **Reduced motion** (`prefers-reduced-motion`): systems are shown built and still; no construction sweep, particles, camera flight, dolly, parallax or moving grain. All content is visible.
- **No WebGL, or the CDN fails:** each system is drawn as an SVG blueprint, the break switches still work, and every word of copy is there.
- **Keyboard:** everything is reachable by Tab with a visible amber focus ring; the sound toggle is a real button with `aria-pressed`.
- **Assets:** about 0.5 MB of fonts and lighting, plus pinned libraries from the CDN. All geometry and textures are generated in code.

## Libraries (pinned, one version each)

three 0.186.0 · postprocessing 6.39.5 · n8ao 2.0.1 (high tier only) · GSAP 3.12.5 + ScrollTrigger · Lenis 1.1.13

## Credits

- Studio lighting: [studio_small_09](https://polyhaven.com/a/studio_small_09) by Poly Haven, CC0.
- Typefaces: Bricolage Grotesque, Instrument Sans, Jura and Nothing You Could Do (SIL Open Font License).
