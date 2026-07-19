// Worldcraft L-1 smoke: the elevation-modifier stack is BYTE-IDENTICAL to the
// pre-refactor field while inert, and the carve-field seam works and cleans
// up. Failures here mean every existing world would silently redraw — the
// exact accident the stack exists to prevent (WORLDCRAFT.md §1.2).

import {
  elevationAt, rawElevationAt, uncarvedElevationAt,
  EARTH_CIRCUM_FT, EARTH_HEIGHT_FT,
} from '../src/everdeep/terrain.ts';
import { registerCarveField, clearCarveField } from '../src/everdeep/sculpt.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const base = { circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, continents: 3, waterPct: 55, climate: 'temperate' };
const CFGS = {
  'continents-noise': { ...base, seed: 'smoke-world', landform: 'continents' },
  'continents-earthlike': { ...base, seed: 'smoke-world', landform: 'continents', climateModel: 'earthlike' },
  'pangea-noise': { ...base, seed: 'smoke-world', landform: 'pangea', waterPct: 40 },
  'archipelago-earthlike': { ...base, seed: 'pin-two', landform: 'archipelago', climateModel: 'earthlike' },
  'isles-noise': { ...base, seed: 'pin-three', landform: 'isles', climate: 'cold' },
};

// 1. Pinned samples captured from the PRE-L-1 field (batch 297 tree). Exact
// string equality: the refactor added terms that must contribute literal 0.
const PINS = [["continents-noise",0,-29693655,5,"0.2855368421636849"],["continents-noise",0,-29693655,9,"0.2859940411223251"],["continents-noise",81580486,14057831,5,"0.2848609417125584"],["continents-noise",81580486,14057831,9,"0.283536810101724"],["continents-noise",31160973,-1590683,5,"0.6071365330916375"],["continents-noise",31160973,-1590683,9,"0.6044534593983967"],["continents-noise",112741459,-17239197,5,"0.28053973896351253"],["continents-noise",112741459,-17239197,9,"0.28247881972991595"],["continents-noise",62321945,26512289,5,"0.33864914331467083"],["continents-noise",62321945,26512289,9,"0.34097732534858666"],["continents-noise",11902431,10863776,5,"0.661005029343334"],["continents-noise",11902431,10863776,9,"0.6624620045542257"],["continents-noise",93482918,-4784738,5,"0.5734651799883407"],["continents-noise",93482918,-4784738,9,"0.5730734650282959"],["continents-noise",43063404,-20433252,5,"0.31145852719636663"],["continents-noise",43063404,-20433252,9,"0.3125898348251405"],["continents-earthlike",0,-29693655,5,"0.2855368421636849"],["continents-earthlike",0,-29693655,9,"0.2859940411223251"],["continents-earthlike",81580486,14057831,5,"0.4986972336828102"],["continents-earthlike",81580486,14057831,9,"0.49760140448497486"],["continents-earthlike",31160973,-1590683,5,"0.6071365330916375"],["continents-earthlike",31160973,-1590683,9,"0.6044534593983967"],["continents-earthlike",112741459,-17239197,5,"0.28053973896351253"],["continents-earthlike",112741459,-17239197,9,"0.28247881972991595"],["continents-earthlike",62321945,26512289,5,"0.33864914331467083"],["continents-earthlike",62321945,26512289,9,"0.34097732534858666"],["continents-earthlike",11902431,10863776,5,"0.6579260061249319"],["continents-earthlike",11902431,10863776,9,"0.6595191116656537"],["continents-earthlike",93482918,-4784738,5,"0.500131304339211"],["continents-earthlike",93482918,-4784738,9,"0.49973958937916624"],["continents-earthlike",43063404,-20433252,5,"0.6460031917300094"],["continents-earthlike",43063404,-20433252,9,"0.6439044749719933"],["pangea-noise",0,-29693655,5,"0.6015209018067782"],["pangea-noise",0,-29693655,9,"0.6003418630961488"],["pangea-noise",81580486,14057831,5,"0.6745320812114799"],["pangea-noise",81580486,14057831,9,"0.6735679305189077"],["pangea-noise",31160973,-1590683,5,"0.35963653309163757"],["pangea-noise",31160973,-1590683,9,"0.35695345939839673"],["pangea-noise",112741459,-17239197,5,"0.6615642423642016"],["pangea-noise",112741459,-17239197,9,"0.6645988362186926"],["pangea-noise",62321945,26512289,5,"0.73566691846478"],["pangea-noise",62321945,26512289,9,"0.7391626482343634"],["pangea-noise",11902431,10863776,5,"0.3812318687058063"],["pangea-noise",11902431,10863776,9,"0.3841157107152291"],["pangea-noise",93482918,-4784738,5,"0.6259651799883407"],["pangea-noise",93482918,-4784738,9,"0.6255734650282959"],["pangea-noise",43063404,-20433252,5,"0.363720913947972"],["pangea-noise",43063404,-20433252,9,"0.36485366653502294"],["archipelago-earthlike",0,-29693655,5,"0.2936048265401135"],["archipelago-earthlike",0,-29693655,9,"0.29430232669069123"],["archipelago-earthlike",81580486,14057831,5,"0.7383444919914339"],["archipelago-earthlike",81580486,14057831,9,"0.7406847649922045"],["archipelago-earthlike",31160973,-1590683,5,"0.6446681021609849"],["archipelago-earthlike",31160973,-1590683,9,"0.6482241010255396"],["archipelago-earthlike",112741459,-17239197,5,"0.3233683603044984"],["archipelago-earthlike",112741459,-17239197,9,"0.32419810507544344"],["archipelago-earthlike",62321945,26512289,5,"0.3277829795655149"],["archipelago-earthlike",62321945,26512289,9,"0.32960008458098977"],["archipelago-earthlike",11902431,10863776,5,"0.2733743290126392"],["archipelago-earthlike",11902431,10863776,9,"0.27089413478304863"],["archipelago-earthlike",93482918,-4784738,5,"0.3272552997303665"],["archipelago-earthlike",93482918,-4784738,9,"0.3297597970449956"],["archipelago-earthlike",43063404,-20433252,5,"0.34477191648767125"],["archipelago-earthlike",43063404,-20433252,9,"0.34492849808951626"],["isles-noise",0,-29693655,5,"0.32898181693422235"],["isles-noise",0,-29693655,9,"0.32908441228077684"],["isles-noise",81580486,14057831,5,"0.49697903815134886"],["isles-noise",81580486,14057831,9,"0.49810450645480225"],["isles-noise",31160973,-1590683,5,"0.26299284824055064"],["isles-noise",31160973,-1590683,9,"0.2614534097228824"],["isles-noise",112741459,-17239197,5,"0.2639151176104889"],["isles-noise",112741459,-17239197,9,"0.26404562536120485"],["isles-noise",62321945,26512289,5,"0.34599818988285896"],["isles-noise",62321945,26512289,9,"0.34544929862056656"],["isles-noise",11902431,10863776,5,"0.31746661906082035"],["isles-noise",11902431,10863776,9,"0.32098949402438365"],["isles-noise",93482918,-4784738,5,"0.32447033581802387"],["isles-noise",93482918,-4784738,9,"0.32675312206258084"],["isles-noise",43063404,-20433252,5,"0.3092152974028139"],["isles-noise",43063404,-20433252,9,"0.30974573416606493"]];
let pinBad = 0;
for (const [name, x, y, oct, want] of PINS) {
  const got = elevationAt(CFGS[name], x, y, oct).toString();
  if (got !== want) { pinBad++; if (pinBad <= 3) fail(`${name} (${x},${y},oct${oct}): ${got} ≠ pinned ${want}`); }
}
pinBad ? fail(`${pinBad}/${PINS.length} pre-refactor pins moved`) : ok(`byte-identical to the pre-L-1 field (${PINS.length} pins, 5 worlds)`);

// 2. Inert stack: raw / uncarved / full agree everywhere nothing is
// registered — including a world that already opted into 'sculpted' (no [E]
// terms ship at L-1, so the dial must not move terrain yet).
let triBad = 0;
for (const cfg of [CFGS['continents-noise'], { ...CFGS['pangea-noise'], reliefModel: 'sculpted' }]) {
  for (let i = 0; i < 200; i++) {
    const x = ((i * 2654435761) >>> 0) / 4294967296 * cfg.circumFt;
    const y = (((i * 40503 + 11) >>> 0) / 65536 % 1 - 0.5) * cfg.heightFt * 0.9;
    const f = elevationAt(cfg, x, y, 7);
    if (f !== rawElevationAt(cfg, x, y, 7) || f !== uncarvedElevationAt(cfg, x, y, 7)) triBad++;
  }
}
triBad ? fail(`raw/uncarved/full disagree at ${triBad}/400 samples with an empty stack`)
  : ok("empty stack: elevationAt = rawElevationAt = uncarvedElevationAt (incl. reliefModel:'sculpted')");

// 3. The carve seam: registering a field lowers elevationAt by exactly the
// carve, leaves uncarved/raw untouched (the recursion guard's contract),
// scopes to its seed, and clears without residue.
const cc = CFGS['continents-noise'];
const other = CFGS['isles-noise'];
const px = 31160973, py = -1590683; // a land pin point
const before = elevationAt(cc, px, py, 7);
const beforeOther = elevationAt(other, px, py, 7);
registerCarveField(cc.seed, { carveAt: () => 0.05 });
try {
  const during = elevationAt(cc, px, py, 7);
  Math.abs(during - (before - 0.05)) < 1e-12
    ? ok('registered carve field lowers elevationAt by its depth')
    : fail(`carve not applied: ${before} → ${during}`);
  uncarvedElevationAt(cc, px, py, 7) === before && rawElevationAt(cc, px, py, 7) === before
    ? ok('uncarved/raw never see the carve (hydrology recursion guard)')
    : fail('uncarved or raw elevation moved under a registered carve');
  // 'pin-three' shares no seed with 'smoke-world' — must be unaffected
  elevationAt(other, px, py, 7) === beforeOther
    ? ok('carve is seed-scoped (other worlds untouched)')
    : fail('carve leaked across world seeds');
} finally {
  clearCarveField(cc.seed);
}
elevationAt(cc, px, py, 7) === before
  ? ok('clearCarveField restores the field byte-identically')
  : fail('carve residue after clear');

if (failures) { console.error(`smoke-worldcraft: ${failures} FAILURES`); process.exit(1); }
console.log('smoke-worldcraft: all green');
