/* =====================================================================
   The world: every section of the page is a zone at a fixed place on one
   drafting plane. Coordinates are world units: x runs along the journey,
   z is depth, y is height. A node is [x, z, width, depth, height, label, startsHidden].
   ===================================================================== */
const srv = (x, z, label = '', hidden = 0) => [x, z, .2, .2, .42, label, hidden];

export const SYSTEMS = {
  hero: { nodes: { u:[-2.8,0,.16,.16,.1,'users'], fe:[-2.08,0,.3,.22,.2,'web app'], lb:[-1.3,0,.22,.22,.36,'load balancer'],
      a1:srv(-.4,-.9), a2:srv(.05,-.9), a3:srv(.5,-.9,'new',1), b1:srv(-.4,0), b2:srv(.05,0,'app servers'), b3:srv(.5,0,'new',1), c1:srv(-.4,.9), c2:srv(.05,.9), c3:srv(.5,.9,'new',1),
      q:[1.15,-.6,.36,.18,.16,'queue'], w:[1.85,-.6,.2,.2,.3,'workers'], db:[1.3,.55,.38,.38,.36,'primary'], rp:[2.0,.55,.3,.3,.3,'replica'],
      ai:[.55,1.62,.34,.34,.34,'AI service, LLM'], vs:[1.35,1.62,.3,.3,.2,'vector store'] },
    areas: [[.05,-.9,1.35,.52],[.05,0,1.35,.52],[.05,.9,1.35,.52]],
    edges: 'u-fe fe-lb lb-a1 lb-a2 lb-a3 lb-b1 lb-b2 lb-b3 lb-c1 lb-c2 lb-c3 a1-db a2-db a3-db b1-db b2-db b3-db c1-db c2-db c3-db a2-q b2-q c2-q q-w db-rp c2-ai b2-ai ai-vs',
    // what each node is built as (js/built.js); nodes not listed stay as linework
    kinds: { u:'users', fe:'screen', lb:'lb', a1:'server', a2:'server', a3:'server', b1:'server', b2:'server', b3:'server', c1:'server', c2:'server', c3:'server',
      q:'queue', w:'server', db:'db', rp:'db', ai:'ai', vs:'vec' } },
  git: { nodes: { p1:[-1.6,-.85,.56,.26,.12,'partition 1'], p2:[-1.6,0,.56,.26,.12,'partition 2'], p3:[-1.6,.85,.56,.26,.12,'partition 3'],
      w1:[-.25,-.85,.24,.24,.52,'worker 1'], w2:[-.25,0,.24,.24,.52,'worker 2'], w3:[-.25,.85,.24,.24,.52,'worker 3'],
      pg:[1.35,-.55,.44,.44,.36,'PostgreSQL'], ch:[1.35,.6,.44,.44,.62,'ClickHouse'] },
    areas: [[-1.6,0,.86,2.35]], edges: 'p1-w1 p2-w2 p3-w3 w1-pg w1-ch w2-pg w2-ch w3-pg w3-ch',
    kinds: { p1:'queue', p2:'queue', p3:'queue', w1:'server', w2:'server', w3:'server', pg:'db', ch:'db' },
    dim: { a:[-1.9,0,1.3], b:[1.6,0,1.3], text:'0 events lost, end to end' } },
  cloud: { nodes: { u:[-2.1,0,.16,.16,.1,'users'], lb:[-1.45,0,.24,.24,.36,'load balancer'],
      a1:srv(-.6,-.92,'zone A'), a2:srv(-.15,-.92), b1:srv(-.6,0,'zone B'), b2:srv(-.15,0), b3:srv(.3,0,'new',1), c1:srv(-.6,.92,'zone C'), c2:srv(-.15,.92), c3:srv(.3,.92,'new',1),
      db:[1.15,-.45,.44,.44,.4,'PostgreSQL on RDS'], sn:[1.05,.8,.2,.2,.2,'SNS'], fn:[1.6,.8,.2,.2,.26,'Lambda'], em:[2.12,.8,.16,.16,.1,'email'] },
    areas: [[-.15,-.92,1.15,.6],[-.15,0,1.15,.6],[-.15,.92,1.15,.6]],
    edges: 'u-lb lb-a1 lb-a2 lb-b1 lb-b2 lb-b3 lb-c1 lb-c2 lb-c3 a1-db a2-db b1-db b2-db b3-db c1-db c2-db c3-db b2-sn sn-fn fn-em',
    kinds: { u:'users', lb:'lb', a1:'server', a2:'server', b1:'server', b2:'server', b3:'server', c1:'server', c2:'server', c3:'server',
      db:'db', sn:'small', fn:'small', em:'card' },
    dim: { a:[-2.2,0,1.32], b:[2.2,0,1.32], text:'0 failed requests' } },
  ik: { nodes: { n1:[-2.0,-.8,.24,.3,.08,'notes'], n2:[-2.0,0,.24,.3,.08,''], n3:[-2.0,.8,.24,.3,.08,''], em:[-1.15,0,.3,.3,.3,'embed'],
      vec:[-.25,0,.5,1.25,.16,'pgvector'], rt:[.6,-.45,.26,.26,.36,'retrieve'], ck:[.6,.45,.26,.26,.36,'check support'],
      st:[1.55,-.45,.3,.3,.5,'STAR answer'], no:[1.55,.8,.3,.3,.5,'refuse'] },
    edges: 'n1-em n2-em n3-em em-vec vec-rt rt-ck ck-st ck-no', offEdges: ['ck-no'],
    kinds: { n1:'card', n2:'card', n3:'card', em:'small', vec:'vec', rt:'server', ck:'server', st:'small', no:'small' },
    dim: { a:[-2.12,0,1.12], b:[1.72,0,1.12], text:'0 invented stories' } },
  cg: { nodes: { rq:[-2.1,0,.16,.16,.1,'request'], g1:[-1.35,0,.06,1.05,.5,'origin'], g2:[-.8,0,.06,1.05,.5,'headers'], g3:[-.25,0,.06,1.05,.5,'sanitize'],
      g4:[.3,0,.06,1.05,.5,'JWT'], g5:[.85,0,.06,1.05,.5,'role'], db:[1.7,0,.44,.44,.4,'MongoDB'] },
    edges: 'rq-g1 g1-g2 g2-g3 g3-g4 g4-g5 g5-db',
    kinds: { rq:'puck', g1:'gate', g2:'gate', g3:'gate', g4:'gate', g5:'gate', db:'db' },
    dim: { a:[-2.2,0,.7], b:[1.95,0,.7], text:'6 checks before any data' } },
  also: { nodes: { api:[-1.1,0,.4,.4,.42,'health records API'], mq:[-.2,-.55,.34,.18,.16,'RabbitMQ'], rd:[-.2,.55,.26,.26,.26,'Redis'], es:[.7,-.55,.36,.36,.32,'Elasticsearch'], bn:[1.7,.45,.5,.42,.3,'bigonotes'] },
    edges: 'api-mq mq-es api-rd' },
  bom: { nodes: { l1:[-1.4,-.6,.34,.34,.34,'languages'], b1:[-.2,-.6,.36,.26,.44,'backend'], f1:[1.0,-.6,.52,.32,.08,'frontend'], d1:[-1.4,.6,.36,.36,.4,'data and streaming'], c1:[-.2,.6,.46,.46,.22,'cloud and DevOps'], ai:[1.0,.6,.32,.32,.32,'AI'], sec:[2.2,0,.34,.34,.42,'security'] },
    areas: [[.4,0,4.6,2.3]], edges: 'l1-b1 b1-f1 b1-d1 d1-c1 c1-ai b1-ai f1-sec ai-sec' },
};

/* The zones, in page order. `at` places a system on the plane. `cam` is either
   'fit' (frame the system inside the section's .stage box) or explicit eye/look points.
   `dim` fades the world behind text-heavy sections so the words stay easy to read. */
export const ROAD_Z = 2.7;
export const ZONES = [
  { id:'s-cover',   sys:'hero',  at:[0,0],   cam:'fit', dim:1 },
  { id:'s-path',    track:true,  at:[7,0],   dim:.55,
    markers:[7,9,11,13,15,17] },                       // one marker per step on the thread, the last is "your team"
  { id:'s-bom',     sys:'bom',   at:[23,0],  tour:['l1','b1','f1','d1','c1','ai','sec'], shift:[.31,-.06], mshift:[0,.22], dim:1 },
  { id:'work',      look:[45,0,0], eye:[37,15,17], dim:.9 },
  { id:'s-git',     sys:'git',   at:[32,0],  cam:'fit', dim:1 },
  { id:'s-cloud',   sys:'cloud', at:[41,0],  cam:'fit', dim:1 },
  { id:'s-ik',      sys:'ik',    at:[50,0],  cam:'fit', dim:1 },
  { id:'s-cg',      sys:'cg',    at:[59,0],  cam:'fit', dim:1 },
  { id:'s-also',    sys:'also',  at:[68,0],  look:[68.6,0,0], eye:[64.2,4.6,7.4], shift:[.27,-.12], dim:.6 },
  { id:'s-review',  gate:[76,ROAD_Z], look:[76.4,1.15,ROAD_Z], eye:[71.2,2.1,ROAD_Z + 3.6], shift:[.3,-.02], dim:.55 },
  { id:'s-off',     sky:{ fb:[92.1,6.9,-1], ck:[94.1,6.3,-1], mv:[96.1,6.8,-1] }, look:[94.1,6.6,-1], eye:[93.4,4.9,10.6], shift:[.21,.02], mshift:[0,.26], mfar:1.8, dim:1 },
  { id:'s-contact', beacon:[101,0,ROAD_Z], finale:true, shots:[ { eye:[112,7.5,17], look:[92,.5,1.8] }, { eye:[105.4,2.6,7.4], look:[101,.6,ROAD_Z] } ], shift:[.22,.1], mshift:[0,.2], dim:.9 },
];
