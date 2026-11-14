/* =====================================================================
   SCENARIOS: every interactive scenario on the site, as data.
   Edit text, timing, paths or camera targets here; the engine
   (js/scenario-runner.js + the scenario API in js/world.js) never changes.

   A scenario: { id, label (the button text), steps: [...] }
   A step runs at `at` seconds and may set any of:
     bead:   ['p2', 'w2']           one bright request travels this path, node by node (pulsing each)
     beads:  [[...], [...]]         several at once
     beadDur: 1.2                   seconds the bead takes (default: until the next step)
     nodes:  { w2: 'down' }         'down' (coral) | 'ok' (normal, heals a down part) | 'new' (build a new part)
                                    | 'hidden' (back to unbuilt) | 'rebuild' (rebuild in place, no failure)
     edges:  { 'p2-w2': 'hold' }    'hold' (traffic waits at the start) | 'end' (waits at the end)
                                    | 'off' | 'on' | 'normal'
     flash:  ['pg']                 nodes flash white (a part doing its job)
     labels: { pg: 'PostgreSQL · 1 row' }   relabel a part (null restores it)
     traffic:{ speed: 3, dim: .45 } background traffic speed and strength
     tele:   ['line 1', 'line 2']   the readout at the top right of the drawing
     line:   'One plain sentence.'  the project's one-line text
     tone:   'alert' | 'calm'       readout colour (coral / amber); omit for neutral
     rev:    'C' | 'B'              the title block's revision letter
     focus:  'w2' | null            the camera leans toward this part (null returns)
   Numbers used are only the real ones: 0 events lost, 10–100× faster
   analytics, 0 failed requests, 6 checks, 403 for the wrong role (and 401).
   ===================================================================== */

// a rolling deploy, one server at a time (drain → rebuild on v2 → rejoin)
function rollingDeploy(order){
  const steps = [{ at:0, traffic:{ dim:.45 }, tele:['GitHub Actions · rolling deploy', '0 of 6 on v2 · 0 failed'], line:'A rolling deploy replaces one server at a time. Traffic never stops.' }];
  order.forEach((id, k) => {
    const t = .3 + k*.95;
    steps.push({ at:t, edges:{ ['lb-' + id]:'off' }, labels:{ [id]:'deploying' }, focus:id });
    steps.push({ at:t + .25, nodes:{ [id]:'rebuild' } });
    steps.push({ at:t + .8, edges:{ ['lb-' + id]:'normal' }, labels:{ [id]:'v2' }, flash:[id], tele:['GitHub Actions · rolling deploy', `${k + 1} of 6 on v2 · 0 failed`] });
  });
  steps.push({ at:.3 + order.length*.95 + .3, focus:null, traffic:{ dim:1 }, tele:['Deployed', 'All 6 servers on v2, 0 failed requests'], line:'Every server is on version 2. 0 failed requests.', tone:'calm' });
  return steps;
}

// InterviewKit: the three answered questions share one flow; only the cited note differs
function answered(note, file){
  return [
    { at:0, traffic:{ dim:.45 }, bead:['em', 'vec'], beadDur:1.1, flash:['em'], tele:['Question in', 'Embedding it'], line:'The question becomes an embedding.' },
    { at:1.2, flash:['vec'], tele:['Searching my notes', 'Nearest matches found'], line:'pgvector finds the nearest notes.' },
    { at:1.7, flash:['vec'] },
    { at:2.2, bead:['vec', 'rt'], beadDur:.6 },
    { at:2.8, flash:['rt', note], labels:{ [note]:file }, focus:note, tele:['Retrieved 1 note', 'Cites ' + file], line:'It pulls the note that covers this.' },
    { at:3.9, bead:['rt', 'ck', 'st'], beadDur:1.2, focus:'st' },
    { at:4.6, flash:['ck'] },
    { at:5.2, flash:['st'], focus:null, traffic:{ dim:1 }, tele:['Answered', 'Cites ' + file], line:'Check support passes. A STAR answer is drafted, with its citation.', tone:'calm' },
  ];
}

// ChildGuard: a request walks the gates in order and is either let through or stopped at one
const GATES = ['g1', 'g2', 'g3', 'g4', 'g5'];
function gateWalk(stopAt, passText){
  const stop = stopAt ? GATES.indexOf(stopAt) : GATES.length, path = ['rq', ...GATES.slice(0, stop + (stopAt ? 1 : 0))];
  const steps = [{ at:0, traffic:{ dim:.45 }, bead:stopAt ? path : [...path, 'db'], beadDur:.8*(path.length - 1) + (stopAt ? 0 : .8), tele:['Checking the request', '0 checks passed'], line:passText }];
  GATES.slice(0, stop).forEach((g, k) => steps.push({ at:.8*(k + 1), flash:[g], tele:['Checking the request', `${k + 1} check${k ? 's' : ''} passed`] }));
  return steps;
}

export const SCENARIOS = {
  /* ------------------------------------------------------------ GitStream */
  git: [
    { id:'crash', label:'Crash worker 2', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['p2', 'w2'], beadDur:1, tele:['3 workers running', 'Committed in order'], line:'An event arrives on partition 2.' },
      { at:1, nodes:{ w2:'down' }, edges:{ 'p2-w2':'hold' }, rev:'C', focus:'w2', tele:['Worker 2 crashed', 'Partition 2 waits, nothing skipped'], line:'Worker 2 crashed. Its events wait in line, and nothing is skipped.', tone:'alert' },
      { at:2.6, labels:{ p2:'partition 2 · commit holds' }, tele:['Partition 2 commit holds', 'Partitions 1 and 3 keep going'], line:'Progress moves only once every earlier event is done.', tone:'alert' },
      { at:4, nodes:{ w2:'ok' }, edges:{ 'p2-w2':'normal' }, traffic:{ speed:3 }, beads:[['p2', 'w2', 'pg'], ['p2', 'w2', 'ch']], beadDur:1.4, tele:['Worker 2 restarted', 'Catching up'], line:'Worker 2 restarted and is catching up.' },
      { at:5.6, labels:{ p2:null }, traffic:{ speed:1, dim:1 }, rev:'B', focus:null, tele:['Worker 2 restarted', 'Caught up, 0 events lost'], line:'Worker 2 restarted and caught up. 0 events lost.', tone:'calm' },
    ]},
    { id:'spike', label:'Spike traffic', steps:[
      { at:0, traffic:{ speed:3.2, dim:1 }, tele:['Traffic spike', 'All partitions busy'], line:'A spike of events hits all three partitions.' },
      { at:1.2, edges:{ 'p1-w1':'hold', 'p2-w2':'hold', 'p3-w3':'hold' }, flash:['w1', 'w2', 'w3'], tele:['Queues growing', '3 workers running flat out'], line:'Events queue up. The workers run flat out.' },
      { at:1.8, flash:['w1', 'w2', 'w3'] }, { at:2.4, flash:['w1', 'w2', 'w3'] },
      { at:3, edges:{ 'p1-w1':'normal', 'p2-w2':'normal', 'p3-w3':'normal' }, traffic:{ speed:2 }, tele:['Backlog draining', 'Committed in order'], line:'The backlog drains in order.' },
      { at:5, traffic:{ speed:1 }, tele:['Spike absorbed', '0 events lost'], line:'The spike passes. 0 events lost.', tone:'calm' },
    ]},
    { id:'lookup', label:'Look up one event', steps:[
      { at:0, traffic:{ dim:.45 }, flash:['p1'], tele:['Look up one event', 'Tracing it'], line:'One event, picked out on partition 1.' },
      { at:.4, bead:['p1', 'w1', 'pg'], beadDur:2.4 },
      { at:1.4, tele:['Through worker 1', 'Into PostgreSQL'], line:'Worker 1 wrote it to PostgreSQL.' },
      { at:2.9, flash:['pg'], labels:{ pg:'PostgreSQL · 1 row' }, focus:'pg', bead:['pg', 'w1'], beadDur:1, tele:['Found 1 row', 'PostgreSQL answers lookups'], line:'PostgreSQL answers lookups.', tone:'calm' },
      { at:4.6, focus:null, traffic:{ dim:1 } },
    ]},
    { id:'sum', label:'Add up the last hour', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['w2', 'ch'], beadDur:1.1, focus:'ch', tele:['Add up the last hour', 'Querying ClickHouse'], line:'A question: what happened in the last hour?' },
      { at:1.2, flash:['ch'], labels:{ ch:'ClickHouse · 1 column' }, tele:['Reading 1 column', 'Not every row'], line:'ClickHouse reads one column, not every row.' },
      { at:1.7, flash:['ch'] }, { at:2.2, flash:['ch'] }, { at:2.7, flash:['ch'] },
      { at:3.4, bead:['ch', 'w2'], beadDur:1, flash:['ch'], tele:['Total ready', '10–100× faster analytics'], line:'ClickHouse answers totals, 10–100× faster.', tone:'calm' },
      { at:4.8, focus:null, traffic:{ dim:1 } },
    ]},
  ],

  /* ------------------------------------------------------------ Cloud Native */
  cloud: [
    { id:'a', label:'Take zone A down', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['u', 'lb', 'a1'], beadDur:1, tele:['All zones healthy', '0 failed requests'], line:'Requests spread across three zones.' },
      { at:1, nodes:{ a1:'down', a2:'down' }, rev:'C', focus:'a1', tele:['CloudWatch alarm', 'Zone A is down'], line:'Zone A is down. Traffic moves to zones B and C, and new servers start.', tone:'alert' },
      { at:2.5, flash:['lb'], beads:[['u', 'lb', 'b1'], ['u', 'lb', 'c1']], beadDur:1.2, focus:'lb', tele:['Rerouting', 'Traffic moves to zones B and C'], line:'The load balancer sends everything to zones B and C.', tone:'alert' },
      { at:4, nodes:{ b3:'new', c3:'new' }, focus:'b3', tele:['Auto Scaling added 2 servers', '0 failed requests'], line:'Auto Scaling adds 2 servers. 0 failed requests.' },
      { at:5.8, nodes:{ a1:'ok', a2:'ok' }, rev:'B', focus:null, traffic:{ dim:1 }, tele:['Zone A is back', '0 failed requests'], line:'Zone A is back. 0 failed requests.', tone:'calm' },
    ]},
    { id:'b', label:'Take zone B down', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['u', 'lb', 'b1'], beadDur:1, tele:['All zones healthy', '0 failed requests'], line:'Requests spread across three zones.' },
      { at:1, nodes:{ b1:'down', b2:'down' }, rev:'C', focus:'b1', tele:['CloudWatch alarm', 'Zone B is down'], line:'Zone B is down. Traffic moves to zones A and C, and a new server starts.', tone:'alert' },
      { at:2.5, flash:['lb'], beads:[['u', 'lb', 'a1'], ['u', 'lb', 'c1']], beadDur:1.2, focus:'lb', tele:['Rerouting', 'Traffic moves to zones A and C'], line:'The load balancer sends everything to zones A and C.', tone:'alert' },
      { at:4, nodes:{ c3:'new' }, focus:'c3', tele:['Auto Scaling added 1 server', '0 failed requests'], line:'Auto Scaling adds 1 server. 0 failed requests.' },
      { at:5.8, nodes:{ b1:'ok', b2:'ok' }, rev:'B', focus:null, traffic:{ dim:1 }, tele:['Zone B is back', '0 failed requests'], line:'Zone B is back. 0 failed requests.', tone:'calm' },
    ]},
    { id:'deploy', label:'Deploy version 2', steps:rollingDeploy(['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) },
  ],

  /* ------------------------------------------------------------ InterviewKit */
  ik: [
    { id:'q1', label:'Tell me about a hard production issue', steps:answered('n1', 'memory-ceiling.md') },
    { id:'q2', label:'Tell me about improving performance', steps:answered('n2', 'throughput-partitions.md') },
    { id:'q3', label:'Tell me about something you owned end to end', steps:answered('n3', 'customer-portal.md') },
    { id:'q4', label:'Tell me about a time you disobeyed an order', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['em', 'vec'], beadDur:1.1, flash:['em'], tele:['Question in', 'Embedding it'], line:'The question becomes an embedding.' },
      { at:1.2, flash:['vec'], tele:['Searching my notes', 'No close match'], line:'pgvector finds nothing close.' },
      { at:2, bead:['vec', 'rt', 'ck'], beadDur:1 },
      { at:3, nodes:{ ck:'down' }, edges:{ 'ck-st':'off' }, rev:'C', focus:'ck', tele:['No note supports that', 'Check support fails'], line:'No supporting note, so the check fails.', tone:'alert' },
      { at:4, edges:{ 'ck-no':'on' }, bead:['ck', 'no'], beadDur:.8, focus:'no' },
      { at:4.8, flash:['no'], nodes:{ ck:'ok' }, rev:'B', focus:null, traffic:{ dim:1 }, tele:['No note supports that', 'Refused, nothing invented'], line:'Nothing in my notes backs that, so it refuses. Nothing invented.', tone:'calm' },
    ]},
  ],

  /* ------------------------------------------------------------ ChildGuard */
  cg: [
    { id:'ok', label:'Volunteer views their sign ups', steps:[
      ...gateWalk(null, 'The request passes each check in turn.'),
      { at:4.8, flash:['db'], labels:{ db:'MongoDB · own records only' }, focus:'db', tele:['6 of 6 checks passed', 'Own records only'], line:'MongoDB returns only this volunteer’s own sign ups.' },
      { at:5.8, focus:null, traffic:{ dim:1 }, tele:['All 6 checks passed', '200 OK'], line:'All 6 checks passed. Only their own records come back.', tone:'calm' },
    ]},
    { id:'role', label:'Volunteer opens safety reports', steps:[
      ...gateWalk('g5', 'The login is valid, so it gets through the first four checks.'),
      { at:4, nodes:{ g5:'down' }, rev:'C', focus:'g5', tele:['Wrong role', '403, no data touched'], line:'A volunteer cannot open safety reports. Stopped at the role check with a 403, before any data.', tone:'alert' },
    ]},
    { id:'login', label:'Expired login', steps:[
      ...gateWalk('g4', 'The request gets through the first three checks.'),
      { at:3.2, nodes:{ g4:'down' }, rev:'C', focus:'g4', tele:['Expired login', 'Stopped at JWT with a 401'], line:'Expired login. Stopped at the JWT check with a 401, before any data.', tone:'alert' },
    ]},
    { id:'origin', label:'Request from an unknown site', steps:[
      { at:0, traffic:{ dim:.45 }, bead:['rq', 'g1'], beadDur:.9, tele:['Request in', 'From an unknown site'], line:'A request arrives from a site ChildGuard does not trust.' },
      { at:1, nodes:{ g1:'down' }, rev:'C', focus:'g1', tele:['Unknown site', 'Blocked at origin'], line:'Cross-origin request blocked at the first check.', tone:'alert' },
    ]},
    { id:'script', label:'Script in a form field', steps:[
      ...gateWalk('g3', 'A form comes in with a script hidden in a field.'),
      { at:2.4, nodes:{ g3:'down' }, rev:'C', focus:'g3', tele:['Script in a form field', 'Caught at sanitize'], line:'The sanitize check catches the script.', tone:'alert' },
      { at:3.6, tele:['Input rejected', 'Nothing reaches the database'], line:'The input is rejected. Nothing reaches the database.', tone:'alert' },
    ]},
  ],
};
