// Nusantara Sky Courier — headless autopilot play-test (Node, no browser).
// Flies all 12 missions with the in-game autopilot (the same inputs a
// player has), seed 1, and prints the per-mission result in the same format
// as the v4 playtest file. Exits 1 unless 12/12 landed and 79/79 rings.
import { createWorld, EVENT_DONE } from './game/src/world.js';
import { createRandom } from './game/src/random.js';
import { STEP, MISSIONS } from './game/src/config.js';

let totalRings = 0;
let totalLanded = 0;
for (const m of MISSIONS) {
  const world = createWorld(createRandom(1));
  world.startMission(m.id);
  const s = world.state;
  let events = 0;
  let steps = 0;
  const limit = Math.round(600 / STEP);
  while (!(events & EVENT_DONE) && steps < limit) {
    events |= world.step(STEP, world.autopilot());
    steps += 1;
  }
  const t = +(steps * STEP).toFixed(0);
  totalRings += s.ringsPassed;
  if (s.phase === 'landed') totalLanded += 1;
  console.log(
    `M${m.id} ${s.region.id}/${s.weatherId}: phase=${s.phase} rings=${s.ringsPassed}/${s.rings.length} missed=${s.ringsMissed} time=${t}s left=${Math.round(s.timeLeft)}s coins=${s.coins} stars=${s.stars} fuel=${Math.round(s.fuel)} alt=${Math.round(s.alt)} spd=${Math.round(s.speed)} msg=${s.message}`,
  );
}
console.log(`TOTAL rings ${totalRings}/79 landed ${totalLanded}/12`);
if (totalRings !== 79 || totalLanded !== 12) {
  console.error('FAIL: expected 79/79 rings and 12/12 landed');
  process.exit(1);
}
console.log('PASS: 12/12 landed, 79/79 rings');
