/* =====================================================================
   CONFIG: every tunable setting for the site lives here.
   Change values, save, reload. Nothing else needs editing.
   ===================================================================== */
export const CONFIG = {
  colors: {
    line:  '#E9EEFF',   // white linework of every structure
    cyan:  '#8FB2F0',   // faded cyan: dashed zones, ambient dust, grid
    amber: '#FFB547',   // live traffic and the thread that connects everything
    coral: '#FF6B5B',   // failures only
    fresh: '#BFE0FF',   // new servers starting up
  },
  particles: {
    desktop: 42000,     // total points in the whole world on laptops
    mobile: 24000,      // total points on phones
    dustShare: .12,     // share of points used for the ambient dust
    roadShare: .1,      // share used for the amber thread between zones
    trafficShare: .3,   // share used for traffic inside the systems
  },
  sizes: { line: 1.7, traffic: 2.1, road: 2.4, dust: 1.3, area: 1.4, beacon: 4.4 },
  speeds: { traffic: 1, road: .55, dust: 1 },
  camera: {
    fov: 34,
    damping: .075,      // how quickly the camera catches up with the scroll (0 to 1)
    parallax: .045,     // how much the mouse tilts the view (keep small)
    yaw: -.42,          // the three-quarter angle used for every system
    elevation: .62,
    travel: .22,        // share of each section spent travelling to the next zone
  },
  lift: { near: 3.2, far: 10 },   // a plan lifts into 3D as the camera's focus comes within these distances
  intro: { duration: 2.4 },       // the opening assembly, in seconds
  dpr: { desktop: 1.5, mobile: 1.5 },   // resolution cap (the medium tier); never above 2
  grid: { size: .5, fade: 120, opacity: .22 },
  // the craft layer: small details that make the world feel alive
  craft: {
    halo: { on: false, size: 2.9, alpha: .11 },         // the old glow pass on amber; replaced by bloom (render.bloom), kept as a fallback switch
    fog: { near: 7, far: 42 },                         // distant zones fade into the blue
    lamp: { on: true, radius: 2.2, strength: .5 },     // the drafting lamp that follows the cursor across the grid
    scan: { on: false, period: 9, width: .32 },         // a faint scan pass across the grid near you (off: it reads as glare from far away)
    speed: { fovKick: 5, rush: 4 },                    // fast scrolling widens the lens and surges the traffic
    assemble: 2.2,                                     // how loose a system's particles get before it forms (and after you leave)
    stardust: { near: 15, far: 27 },                   // zones this far behind you drift apart into stardust
    flow: { radius: .2, push: .065 },                  // how strongly the cursor bends traffic and dust
    bank: .9,                                          // how much the camera leans into its moves
    gridReveal: 2.6,                                   // seconds for the grid to spread out on load
  },
  // rendering: how the 3D frame is finished (pmndrs/postprocessing)
  render: {
    toneMapping: 'neutral',   // 'neutral' (brand-safe, no toe) keeps the brand colours true; 'agx' or 'aces' for a filmic look
    bloom: { threshold: .95, smoothing: .25, intensity: 1.0, radius: .7 },   // only HDR amber (and coral) is bright enough to bloom
    vignette: { offset: .34, darkness: .42 },
    smaa: true,
    amberGain: 3.2,           // traffic, thread and beacon are drawn this much brighter than white, so bloom catches only amber
    amberTint: [1, 1.35, 1.6],  // per-channel lean on that boost, so dim glow reads gold rather than orange (linear light shifts dim amber to orange)
    coralGain: 1.6,
    pointGain: 1,             // overall strength of the stippled points
  },
  // lighting: one studio HDRI (Poly Haven, CC0) for reflections, plus a cool key light
  light: {
    env: 'assets/env/studio_small_09_512.hdr',
    envIntensity: .85, envRotation: 2.2,
    key: { color: '#DFE8FF', intensity: 1.1, position: [-4, 6, 3] },
  },
  // "drawn, built, rendered": systems are built in real materials as you arrive
  build: {
    from: .6, to: .98,        // a zone builds while its lift (0 = flat plan, 1 = full 3D) goes from..to
    stagger: .55,             // how far the construction sweep runs ahead left to right (0 = everything at once)
    introDelay: 1.3,          // on load, the hero waits for the plan and particles, then builds over introDuration
    introDuration: 1.4,
    rebuild: 1.1,             // seconds for a new or healed part to build
    seam: 7,                  // brightness of the amber construction seam
    linesWhenBuilt: .5,       // linework strength once a part is built (the drawing stays on top)
    shadow: .6,               // strength of the soft contact shadows
  },
  materials: {
    glass: { color: '#A9C1EE', opacity: .15, roughness: .05, iridescence: .6, envMapIntensity: 1.5 },
    metal: { color: '#C6CFDF', roughness: .3, anisotropy: .85, envMapIntensity: 1.1 },
    dark:  { color: '#1A2440', metalness: .85, roughness: .42 },
    led:   { color: '#BFE0FF', power: 2.2 },   // status lights: cool white, never amber
    msg:   { power: 1.5 },                     // queued messages are traffic, so they are amber
    coralGlass: .55,                           // how strongly a failed part's glass turns coral
  },
  effects: {
    cursor: true,       // the custom cursor ring (hidden on touch screens and reduced motion)
    magnetic: true,     // primary buttons lean toward the pointer
    splitText: true,    // headings reveal word by word
  },
};
