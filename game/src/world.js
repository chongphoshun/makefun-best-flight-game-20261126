// Nusantara Sky Courier — pure flight rules, no DOM. A mission is a course of
// rings at set distances: fly through each ring inside its altitude band and
// heading window, then land on the runway. Everything on screen (HUD, dials,
// coins, combo) reads live from this state, never from decoration.
import {
  AIRCRAFT_BY_ID, COMBO_CAP, LANDING_PAY, MISSIONS, MISSION_BY_ID, REGION_BY_ID,
  RING_PAY, TIME_BONUS_PER_SEC, UPGRADE_BY_ID, WEATHER,
} from './config.js';
import { range } from './random.js';

export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_LAND = 4;
export const EVENT_CRASH = 8;
export const EVENT_TIMEOUT = 16;
export const EVENT_FUEL_LOW = 32;
export const EVENT_DONE = 64;
export const EVENT_STALL = 128;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
export function headingDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function createWorld(rng) {
  const state = {
    phase: 'title', // title | fly | landed | crashed | timeout | done
    mode: 'campaign',
    mission: null,
    region: REGION_BY_ID.bromo,
    weather: WEATHER.clear,
    weatherId: 'clear',
    aircraft: AIRCRAFT_BY_ID.elang,
    alt: 0, speed: 0, heading: 0, courseHeading: 0,
    pitch: 0, roll: 0, climb: 0,
    dist: 0, lateral: 0,
    throttle: 0, flaps: false,
    fuel: 100, fuelMax: 100,
    timeLeft: 0, timeLimit: 0, elapsed: 0,
    rings: [], ringIndex: 0, ringsPassed: 0, ringsMissed: 0,
    runwayDist: 0, runwayHeading: 0,
    coins: 0, bank: 0, combo: 0, bestCombo: 0, score: 0,
    stars: 0, message: '', messageT: 0,
    fuelLowWarned: false, stall: false,
    upgrades: new Set(), ownedAircraft: new Set(['elang']),
    unlocked: 1, starsByMission: {},
    freeRings: 0,
  };

  function maxSpeed() {
    let s = state.aircraft.maxSpeed;
    if (state.upgrades.has('engine')) s += 25;
    return s;
  }
  function ringTol() {
    return state.upgrades.has('gps') ? 1.4 : 1.0;
  }
  function landTol() {
    let t = state.aircraft.landEase;
    if (state.upgrades.has('gear')) t *= 1.6;
    if (state.upgrades.has('flaps')) t *= 1.2;
    return t;
  }
  function payMult() {
    return state.upgrades.has('rack') ? 1.5 : 1.0;
  }

  function buildRings(mission, count) {
    const rings = [];
    let heading = range(rng, -20, 20);
    // v2: consecutive rings ramp at most 600 ft, so a climb started at the
    // previous ring always reaches the next one inside the 350 ft band.
    let prevAlt = mission.altBase;
    for (let i = 0; i < count; i += 1) {
      heading = clamp(heading + range(rng, -18, 18), -45, 45);
      const raw = Math.round(clamp(mission.altBase + range(rng, -500, 500), 1200, 7500) / 50) * 50;
      const alt = Math.round(clamp(raw, prevAlt - 600, prevAlt + 600) / 50) * 50;
      prevAlt = alt;
      rings.push({
        dist: 1.5 + i * 0.9,
        alt,
        heading: Math.round(heading),
        passed: false, missed: false,
      });
    }
    return rings;
  }

  function setupFlight({ mode, mission, count, timeLimit, weatherId, startAlt, startDist }) {
    state.mode = mode;
    state.mission = mission || null;
    state.region = REGION_BY_ID[mission ? mission.region : 'bali'];
    state.weatherId = weatherId;
    state.weather = WEATHER[weatherId];
    state.rings = buildRings(mission || MISSIONS[0], count);
    state.ringIndex = 0;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.runwayDist = state.rings.length ? state.rings[state.rings.length - 1].dist + 3.0 : 3.0;
    state.runwayHeading = state.rings.length ? state.rings[state.rings.length - 1].heading : 0;
    state.alt = startAlt;
    state.speed = 90;
    state.heading = state.rings.length ? state.rings[0].heading : 0;
    state.courseHeading = state.rings.length ? state.rings[0].heading : 0;
    state.pitch = 0;
    state.roll = 0;
    state.dist = 0;
    state.lateral = 0;
    state.throttle = 0.7;
    state.flaps = false;
    state.fuelMax = state.aircraft.fuel + (state.upgrades.has('tank') ? 30 : 0);
    state.fuel = state.fuelMax;
    state.timeLimit = timeLimit;
    state.timeLeft = timeLimit;
    state.elapsed = 0;
    state.coins = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.score = 0;
    state.stars = 0;
    state.phase = 'fly';
    state.message = mission ? mission.brief : 'Free flight — fly the rings, land when ready.';
    state.messageT = 5;
    state.fuelLowWarned = false;
    state.stall = false;
    state.freeRings = 0;
  }

  function startMission(id) {
    const mission = MISSION_BY_ID[id] || MISSIONS[0];
    // v2: start 700 ft below the mission band (was a flat 2,500 ft). M8's
    // band sits at 5,800 ft — from 2,500 ft the autopilot only reached
    // 5,306 ft at ring 1 and missed it (6/7, 2 stars). From 5,100 ft it
    // climbs into the band with room to spare.
    const startAlt = Math.round(clamp(mission.altBase - 700, 2500, 6000) / 50) * 50;
    setupFlight({ mode: 'campaign', mission, count: mission.rings, timeLimit: mission.time, weatherId: mission.weather, startAlt, startDist: 0 });
  }
  function startFreeFlight() {
    setupFlight({ mode: 'free', mission: null, count: 6, timeLimit: 600, weatherId: 'clear', startAlt: 3000, startDist: 0 });
    state.region = REGION_BY_ID.rajaampat;
  }
  function startRingRace() {
    setupFlight({ mode: 'race', mission: null, count: 8, timeLimit: 375, weatherId: 'clear', startAlt: 3000, startDist: 0 });
    state.region = REGION_BY_ID.bromo;
  }
  function startLanding() {
    const mission = MISSIONS[0];
    setupFlight({ mode: 'landing', mission, count: 0, timeLimit: 240, weatherId: 'clear', startAlt: 6000, startDist: 0 });
    state.region = REGION_BY_ID.komodo;
    state.rings = [];
    state.runwayDist = 3.0;
    state.runwayHeading = 0;
    state.courseHeading = 0;
    state.heading = 0;
    state.speed = 120;
  }

  function reset() {
    state.phase = 'title';
    state.mode = 'campaign';
    state.mission = MISSIONS[0];
    state.region = REGION_BY_ID.bromo;
    state.weather = WEATHER.clear;
    state.weatherId = 'clear';
    state.alt = 3500;
    state.speed = 140;
    state.heading = 0;
    state.courseHeading = 0;
    state.dist = 0;
    state.lateral = 0;
    state.throttle = 0.75;
    state.fuel = 100;
    state.timeLeft = 180;
    state.elapsed = 0;
    state.rings = buildRings(MISSIONS[0], 4);
    state.ringIndex = 0;
    state.coins = 0;
    state.combo = 0;
    state.score = 0;
    state.stars = 0;
    state.message = '';
  }

  // One fixed step. input: { pitch: -1..1 (+climb), roll: -1..1 (+right),
  // throttle: 0..1 | null, flaps: bool }. Returns an event bitmask.
  function step(dt, input) {
    if (state.phase !== 'fly') return 0;
    let events = 0;
    const handling = state.aircraft.handling;
    const turb = state.weather.turb * (state.upgrades.has('radar') ? 0.5 : 1);

    if (input.throttle != null) state.throttle = clamp(input.throttle, 0, 1);
    state.flaps = !!input.flaps;

    // Speed chases throttle; flaps drag hard.
    let target = maxSpeed() * (0.35 + 0.65 * state.throttle);
    if (state.flaps) target -= 25;
    if (state.fuel <= 0) target = 0;
    const rate = target > state.speed ? 14 : (state.flaps ? 26 : 9);
    state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
    state.speed = Math.max(0, state.speed);

    // Pitch / roll, smoothed, with storm shake.
    const pitchTarget = clamp((input.pitch || 0) * 18 * handling, -30, 18)
      + (rng() - 0.5) * turb * 6;
    const rollTarget = clamp((input.roll || 0) * 28 * handling, -30, 30);
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, dt * 4);
    state.roll += (rollTarget - state.roll) * Math.min(1, dt * 4);
    if (state.upgrades.has('autopilot')) state.pitch *= 0.985;
    state.heading = (state.heading + state.roll * 0.55 * dt + (rng() - 0.5) * turb * 10 * dt + 360) % 360;

    // Climb from pitch and speed; stall below 55 kt sinks the plane.
    state.stall = state.speed < 55;
    const vertFps = state.speed * 1.6878 * Math.sin((state.pitch * Math.PI) / 180);
    state.climb = vertFps * 60;
    state.alt += vertFps * dt * (state.stall ? -1.6 : 1);
    if (state.stall) events |= EVENT_STALL;

    // Advance along the course; heading error drifts the plane sideways.
    const diff = headingDiff(state.heading, state.courseHeading);
    const prevDist = state.dist;
    state.dist += (state.speed * Math.cos((diff * Math.PI) / 180) * dt) / 3600;
    state.lateral += (state.speed * Math.sin((diff * Math.PI) / 180) * dt) / 3600;

    // Fuel burn: cruise ~14/min, full throttle ~16/min; jet burns 30% more.
    const burn = (6 + state.throttle * 10) * (state.aircraft.id === 'garuda' ? 1.3 : 1) * (dt / 60);
    state.fuel = Math.max(0, state.fuel - burn);
    if (state.fuel < 20 && !state.fuelLowWarned) {
      state.fuelLowWarned = true;
      events |= EVENT_FUEL_LOW;
      state.message = 'LOW FUEL — land soon!';
      state.messageT = 4;
    }

    state.elapsed += dt;
    if (state.mode !== 'free') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.phase = 'timeout';
        return events | EVENT_TIMEOUT | EVENT_DONE;
      }
    }
    if (state.messageT > 0) state.messageT -= dt;

    // Ring crossings.
    const ring = state.rings[state.ringIndex];
    if (ring && prevDist < ring.dist && state.dist >= ring.dist) {
      state.courseHeading = ring.heading;
      const altErr = Math.abs(state.alt - ring.alt);
      const hdgErr = Math.abs(headingDiff(state.heading, ring.heading));
      const ok = altErr <= 350 * ringTol() && Math.abs(state.lateral) <= 0.5 * ringTol() && hdgErr <= 30;
      if (ok) {
        ring.passed = true;
        state.ringsPassed += 1;
        state.combo = Math.min(state.combo + 1, COMBO_CAP);
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const pay = Math.round(RING_PAY * payMult() * (1 + 0.1 * (state.combo - 1)));
        state.coins += pay;
        state.score += pay;
        state.message = `RING ${state.ringsPassed}/${state.rings.length} — +${pay} coins`;
        state.messageT = 2.5;
        events |= EVENT_RING;
      } else {
        ring.missed = true;
        state.ringsMissed += 1;
        state.combo = 0;
        state.message = 'RING MISSED — combo lost';
        state.messageT = 2.5;
        events |= EVENT_MISS;
      }
      state.ringIndex += 1;
      if (state.ringIndex < state.rings.length) {
        state.courseHeading = state.rings[state.ringIndex].heading;
      } else {
        state.courseHeading = state.runwayHeading;
        state.message = 'ALL RINGS DONE — land on the runway!';
        state.messageT = 5;
      }
      if (state.mode === 'free' && state.ringIndex >= state.rings.length) {
        state.freeRings += state.ringsPassed;
        state.rings = buildRings(MISSIONS[0], 6);
        state.ringIndex = 0;
        state.runwayDist = state.dist + state.rings[state.rings.length - 1].dist + 3.0;
      }
    }

    // Runway: landing window, or fly past it.
    if (state.ringIndex >= state.rings.length && state.rings.length >= 0) {
      const nearRunway = Math.abs(state.dist - state.runwayDist) < 0.35;
      if (nearRunway && state.alt <= 250) {
        return finishLanding(events);
      }
      if (state.dist > state.runwayDist + 1.2 && state.mode !== 'free') {
        state.phase = 'crashed';
        state.message = 'MISSED APPROACH — flew past the runway';
        return events | EVENT_CRASH | EVENT_DONE;
      }
      if (state.mode === 'free' && state.dist > state.runwayDist + 1.2) {
        state.runwayDist = state.dist + 8;
      }
    }

    // Ground contact.
    if (state.alt <= 0) {
      state.alt = 0;
      if (Math.abs(state.dist - state.runwayDist) < 0.35 && state.speed < 150) {
        return finishLanding(events);
      }
      state.phase = 'crashed';
      state.message = state.fuel <= 0 ? 'OUT OF FUEL — crashed' : 'TERRAIN IMPACT';
      return events | EVENT_CRASH | EVENT_DONE;
    }
    if (state.alt > 12000) state.alt = 12000;
    return events;
  }

  function finishLanding(events) {
    const tol = landTol();
    const ok = state.speed <= 130 * tol && Math.abs(state.lateral) <= 0.4 * tol
      && Math.abs(headingDiff(state.heading, state.runwayHeading)) <= 20 * tol;
    state.alt = 0;
    state.speed = 0;
    if (!ok) {
      state.phase = 'crashed';
      state.message = 'HARD LANDING — too fast or off centreline';
      return events | EVENT_CRASH | EVENT_DONE;
    }
    const landPay = Math.round(LANDING_PAY * payMult());
    state.coins += landPay;
    state.score += landPay;
    let timeBonus = 0;
    if (state.mode === 'campaign') {
      timeBonus = Math.round(state.timeLeft * TIME_BONUS_PER_SEC);
      state.coins += timeBonus;
      state.score += timeBonus;
      state.stars = state.ringsMissed === 0 ? 3 : state.ringsMissed <= 2 ? 2 : 1;
      state.starsByMission[state.mission.id] = Math.max(state.starsByMission[state.mission.id] || 0, state.stars);
      state.unlocked = Math.max(state.unlocked, Math.min(12, state.mission.id + 1));
    } else if (state.mode === 'race') {
      state.stars = state.ringsMissed === 0 ? 3 : state.ringsMissed <= 2 ? 2 : 1;
      state.score = Math.round(state.elapsed * 10) + state.coins;
    } else {
      state.stars = 2;
    }
    state.bank += state.coins;
    state.phase = 'landed';
    state.message = `LANDED! +${landPay} coins${timeBonus ? ` +${timeBonus} time bonus` : ''}`;
    state.messageT = 6;
    return events | EVENT_LAND | EVENT_DONE;
  }

  // Steers the plane with the same inputs a player has: pitch for altitude,
  // roll for heading, throttle for speed, flaps for the landing.
  function autopilot() {
    const landing = state.ringIndex >= state.rings.length;
    const ring = state.rings[state.ringIndex];
    const targetAlt = landing ? 120 : ring ? ring.alt : 3000;
    const targetHdg = landing ? state.runwayHeading : ring ? ring.heading : state.courseHeading;
    let hdgErr = headingDiff(targetHdg, state.heading);
    // Correct cross-track: aim a little back toward the centreline.
    hdgErr += clamp(-state.lateral * 40, -25, 25);
    const altErr = targetAlt - state.alt;
    let throttle = 0.9;
    if (landing) throttle = state.dist > state.runwayDist - 1.0 ? 0.6 : 0.45;
    if (state.speed > maxSpeed() * 0.9) throttle = 0.5;
    return {
      pitch: clamp(altErr / 500, -1, 1),
      roll: clamp(hdgErr / 18, -1, 1),
      throttle,
      flaps: landing && state.dist > state.runwayDist - 0.7,
    };
  }

  function buyUpgrade(id) {
    const up = UPGRADE_BY_ID[id];
    if (!up || state.upgrades.has(id) || state.bank < up.cost) return false;
    state.bank -= up.cost;
    state.upgrades.add(id);
    return true;
  }
  function buyAircraft(id) {
    const ac = AIRCRAFT_BY_ID[id];
    if (!ac || state.ownedAircraft.has(id) || state.bank < ac.cost) return false;
    state.bank -= ac.cost;
    state.ownedAircraft.add(id);
    state.aircraft = ac;
    return true;
  }

  return {
    state, reset, startMission, startFreeFlight, startRingRace, startLanding,
    step, autopilot, buyUpgrade, buyAircraft, maxSpeed, finishLanding,
  };
}
