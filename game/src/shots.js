// The screenshot scenes behind ?shot=start|play|rush|end. Each one flies the
// real rules forward from a fresh world, steered by the world's own autopilot
// (the same inputs a player has), so the frame is what a real game really
// looks like and the same seed always gives the same frame.
//
// v5 staging (each shot sets camMode + dusk explicitly — the renderer reads
// state.camMode / state.dusk; reset() does not clear them, so every branch
// sets both):
//   start — LOW flyover of the Raja Ampat karst (close camera, ground rush)
//   play  — SUNSET over Lake Toba, high over the lake, clouds below the plane
//   rush  — STORM banking ring run over Komodo (the v4 strongest shot, kept)
//   end   — LANDED on the runway at Lake Toba, plane ON the slab (no modal)
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
    // v5: low flyover of the Raja Ampat karst — mission 4, 3 rings in,
    // camera dropped to 'low' so the karst towers and the near-band trees
    // loom instead of sitting on the horizon. NO title panel.
    world.startMission(4);
    flyRings(world, 3);
    stepN(world, 2);
    world.state.camMode = 'low';
    world.state.dusk = false;
    return { screen: SCREEN_PLAY, summary: null };
  }
  if (name === 'play') {
    // v5: sunset over Lake Toba — mission 2 (lower band, 4,200 ft, so the
    // lake and shore read instead of a high-altitude wash), 3 rings in,
    // dusk sky + low sun + clouds below the plane. 'close' camera so the
    // aircraft reads as a silhouette against the orange sky.
    world.startMission(2);
    flyRings(world, 3);
    stepN(world, 2);
    world.state.camMode = 'close';
    world.state.dusk = true;
    return { screen: SCREEN_PLAY, summary: null };
  }
  if (name === 'rush') {
    // Storm over Komodo, low fuel, on the landing leg: runway ahead, lit.
    // v4: bank hunt DURING the ring flight — the landing leg is flown
    // straight at the runway, so it never banks. Stop the moment the
    // autopilot is actually banked (>= 15 deg) with >= 5 rings passed: a
    // real banked turn in the storm, with contrails. If no bank happens,
    // fly all 7 rings instead. v5: 'close' camera for a bigger plane.
    world.startMission(7);
    let banked = false;
    let guard = 0;
    while (world.state.ringsPassed < 7 && world.state.phase === 'fly' && guard < 60 * 400) {
      guard += 1;
      world.step(STEP, world.autopilot());
      if (world.state.ringsPassed >= 5 && Math.abs(world.state.roll) >= 15) { banked = true; break; }
    }
    if (!banked) flyRings(world, 7);
    world.state.fuel = 18;
    world.state.combo = 4;
    world.state.bestCombo = 4;
    world.state.camMode = 'wide';
    world.state.dusk = false;
    return { screen: SCREEN_PLAY, summary: null };
  }
  // end: mission complete, 3 stars, shop with one upgrade owned.
  // v5: mission 12, the Grand Nusantara Run finale over Bali's terraces
  // (storm). The runway there is FLAT and DRY (6.0 m for the whole strip,
  // verified against the real terrainHeight) — the v5 first pass used
  // mission 8 over Toba, whose runway is UNDERWATER (-7.8 m): the plane
  // sat submerged and the frame was empty lake + sky. M2/M4/M7/M8/M9/M10
  // runways are all underwater too; only M1/M5/M6/M11/M12 are dry, and
  // M12's flat terraces make the cleanest landing frame. The plane is put
  // exactly on the runway centreline (dist = runwayDist - 0.05, lateral
  // 0, heading = runway heading) and the renderer grounds the landed
  // plane on the real terrain, so it sits ON the slab. NO mission-complete
  // modal — SCREEN_PLAY, phase landed.
  world.state.bank = 200;
  world.buyUpgrade('gps');
  world.startMission(12);
  // Fly the whole mission on autopilot for real, then land.
  let guard = 0;
  let events = 0;
  while (!(events & EVENT_DONE) && guard < 60 * 600) {
    guard += 1;
    events |= world.step(STEP, world.autopilot());
  }
  s.phase = 'landed';
  // 0.05 nm short of the slab centre: still ON the 600 m slab, and the
  // 2D runway label reads "0.1 nm" ahead instead of "0.0 nm" on the plane.
  s.dist = s.runwayDist - 0.05;
  s.lateral = 0;
  s.heading = s.runwayHeading;
  // 'close', not 'landed': the dedicated 'landed' camera (26 m back,
  // near-level) foreshortened the plane into a white cross at the bottom
  // edge. 'close' (17 m, 3/4 offset) shows the fuselage from the side and
  // keeps the tail above the cockpit panel — the v5 fix-2 framing.
  s.camMode = 'close';
  s.dusk = false;
  return { screen: SCREEN_PLAY, summary: null };
}
