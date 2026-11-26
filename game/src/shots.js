// The screenshot scenes behind ?shot=start|play|rush|end. Each one flies the
// real rules forward from a fresh world, steered by the world's own autopilot
// (the same inputs a player has), so the frame is what a real game really
// looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_DONE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function stepN(world, seconds) {
  let events = 0;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) events |= world.step(STEP, world.autopilot());
  return events;
}

// Fly with the autopilot until `rings` rings are passed (or the flight ends).
function flyRings(world, rings) {
  let guard = 0;
  while (world.state.ringsPassed < rings && world.state.phase === 'fly' && guard < 60 * 400) {
    guard += 1;
    world.step(STEP, world.autopilot());
  }
}

export function stageShot(name, world) {
  world.reset();
  const s = world.state;
  if (name === 'start') {
    // Title over a live chase view above Bromo, first ring ahead.
    world.startMission(1);
    stepN(world, 8);
    world.state.phase = 'fly';
    return { screen: SCREEN_TITLE, summary: null };
  }
  if (name === 'play') {
    // Mid-mission over Raja Ampat: 3 rings passed, runway visible ahead.
    world.startMission(4);
    flyRings(world, 3);
    stepN(world, 2);
    return { screen: SCREEN_PLAY, summary: null };
  }
  if (name === 'rush') {
    // Storm over Komodo, low fuel, on the landing leg: runway ahead, lit.
    world.startMission(7);
    flyRings(world, 7);
    world.state.fuel = 18;
    world.state.combo = 4;
    world.state.bestCombo = 4;
    stepN(world, 3);
    return { screen: SCREEN_PLAY, summary: null };
  }
  // end: mission complete, 3 stars, shop with one upgrade owned.
  world.state.bank = 200;
  world.buyUpgrade('gps');
  world.startMission(1);
  // Fly the whole mission on autopilot for real, then land.
  let guard = 0;
  let events = 0;
  while (!(events & EVENT_DONE) && guard < 60 * 600) {
    guard += 1;
    events |= world.step(STEP, world.autopilot());
  }
  s.phase = 'landed';
  return {
    screen: SCREEN_OVER,
    summary: {
      rings: s.ringsPassed, total: s.rings.length, coins: s.coins,
      time: Math.round(s.elapsed), accuracy: s.rings.length ? Math.round((s.ringsPassed / s.rings.length) * 100) : 0,
      stars: s.stars,
    },
  };
}
