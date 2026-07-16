// Sailing smoke (item #31c/#31d): the polar has the right shape, and the two
// rules the owner asked for hold — an unpowered boat is bound by wind and current
// (it cannot beat a current in a calm), a powered one is not (it always makes
// way). Part of `npm run smoke`.

import { polarThroughWater, boatGroundSpeed } from '../src/everdeep/sailing.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// 1. the polar: fastest reaching, slower running, slowest (but nonzero) upwind
{
  const upwind = polarThroughWater(0);      // bow into the wind — must tack
  const closeHauled = polarThroughWater(50);
  const beam = polarThroughWater(90);
  const broad = polarThroughWater(125);     // the sweet spot
  const run = polarThroughWater(180);       // dead downwind
  const checks = [
    [upwind > 0, 'a boat can still beat to windward (no-go speed > 0, by tacking)'],
    [upwind < closeHauled && closeHauled < beam && beam < broad, 'speed climbs from upwind through the reaches to a broad reach'],
    [run < broad, 'a dead run is slower than a broad reach'],
    [upwind < run, 'running is faster than beating upwind'],
    [broad <= 1.0001, 'the polar is normalised (peak ≈ 1 hull speed)'],
  ];
  let good = 0;
  for (const [pass, desc] of checks) pass ? good++ : fail(`polar: ${desc} — [up ${upwind.toFixed(2)}, ch ${closeHauled.toFixed(2)}, beam ${beam.toFixed(2)}, broad ${broad.toFixed(2)}, run ${run.toFixed(2)}]`);
  if (good === checks.length) ok(`polar has the right shape (up ${upwind.toFixed(2)} < beam ${beam.toFixed(2)} < broad ${broad.toFixed(2)} > run ${run.toFixed(2)})`);
}

// 2. downwind beats upwind for a sailing boat, other things equal
{
  const wind = [1, 0];            // blowing east
  const noCurrent = [0, 0];
  const downwind = boatGroundSpeed([1, 0], wind, noCurrent, false);  // sailing east, with the wind
  const upwind = boatGroundSpeed([-1, 0], wind, noCurrent, false);   // sailing west, into the wind
  downwind > upwind && upwind > 0
    ? ok(`sailing downwind (${downwind.toFixed(2)}) beats beating upwind (${upwind.toFixed(2)}), both making way`)
    : fail(`downwind ${downwind.toFixed(2)} should exceed a positive upwind ${upwind.toFixed(2)}`);
}

// 3. a fair current adds ground speed, a foul one subtracts
{
  const wind = [1, 0];
  const withCur = boatGroundSpeed([1, 0], wind, [0.5, 0], false);   // current also east
  const againstCur = boatGroundSpeed([1, 0], wind, [-0.5, 0], false); // current opposing
  withCur > againstCur
    ? ok(`a fair current speeds the hull (${withCur.toFixed(2)}) over a foul one (${againstCur.toFixed(2)})`)
    : fail(`fair current ${withCur.toFixed(2)} should beat foul ${againstCur.toFixed(2)}`);
}

// 4. THE OWNER'S RULE. Unpowered: becalmed, you cannot beat the current — you
//    drift with it (heading against a current in no wind → negative made-good).
{
  const calm = [0, 0];
  const current = [0.5, 0]; // flowing east
  const againstDrift = boatGroundSpeed([-1, 0], calm, current, false); // trying to go west
  const withDrift = boatGroundSpeed([1, 0], calm, current, false);     // going east, with it
  againstDrift < 0 && withDrift > 0
    ? ok(`unpowered + becalmed is bound to the current (against it ${againstDrift.toFixed(2)} < 0, with it ${withDrift.toFixed(2)} > 0)`)
    : fail(`becalmed boat should be carried by the current: against ${againstDrift.toFixed(2)} (want <0), with ${withDrift.toFixed(2)} (want >0)`);
}

// 5. THE OWNER'S RULE. Powered: never bound — it makes way even straight into the
//    worst wind AND an opposing current at once.
{
  const wind = [1, 0];       // full gale on the nose
  const current = [0.6, 0];  // and a foul current
  const powered = boatGroundSpeed([-1, 0], wind, current, true);   // driving west, into both
  const sail = boatGroundSpeed([-1, 0], wind, current, false);     // a sail's hopeless case
  powered > 0
    ? ok(`powered hull is not bound: into wind AND current it still makes way (${powered.toFixed(2)} > 0)`)
    : fail(`powered boat should always progress: ${powered.toFixed(2)}`);
  powered > sail
    ? ok(`the engine beats the sail in the boat's worst case (${powered.toFixed(2)} vs ${sail.toFixed(2)})`)
    : fail(`engine ${powered.toFixed(2)} should beat sail ${sail.toFixed(2)} dead into wind+current`);
}

// 6. deterministic and finite
{
  const a = boatGroundSpeed([0.3, 0.7], [0.4, -0.2], [0.1, 0.1], false);
  const b = boatGroundSpeed([0.3, 0.7], [0.4, -0.2], [0.1, 0.1], false);
  a === b && Number.isFinite(a) ? ok('deterministic and finite') : fail(`non-deterministic or NaN: ${a} vs ${b}`);
}

console.log(failures ? `\nSailing smoke FAILED: ${failures}` : 'Sailing smoke: all green.');
process.exit(failures ? 1 : 0);
