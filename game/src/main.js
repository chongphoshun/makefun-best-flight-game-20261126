// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. Screens: title,
// play, paused, mission-over (with shop rows) and the full shop.
// ?seed=N fixes the mission layout. ?shot=start|play|rush|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady.
import { AIRCRAFT_BY_ID, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_DONE, EVENT_FUEL_LOW, EVENT_LAND, EVENT_MISS, EVENT_RING, EVENT_TIMEOUT } from './world.js';
import { createInput, inRect } from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SAVE_KEY = 'nusantara-sky-courier.save.v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
window.__world = world; // test/debug hook: play-test scripts read live state here
const renderer = createRenderer(canvas);

// --- tiny WebAudio beeps, generated in code, no audio files ---
let audioCtx = null;
function beep(freq, dur, type) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch {
    // Audio is decoration; a blocked context must never break the game.
  }
}
function soundFor(events) {
  if (events & EVENT_LAND) { beep(523, 0.15, 'sine'); setTimeout(() => beep(784, 0.3, 'sine'), 140); }
  else if (events & EVENT_RING) { beep(660, 0.1, 'sine'); setTimeout(() => beep(880, 0.12, 'sine'), 80); }
  else if (events & EVENT_CRASH) beep(160, 0.4, 'sawtooth');
  else if (events & EVENT_TIMEOUT) beep(300, 0.3, 'triangle');
  else if (events & EVENT_FUEL_LOW) beep(440, 0.2, 'square');
  else if (events & EVENT_MISS) beep(220, 0.15, 'square');
}

function saveGame() {
  try {
    const s = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      bank: s.bank, upgrades: [...s.upgrades], ownedAircraft: [...s.ownedAircraft],
      aircraft: s.aircraft.id, unlocked: s.unlocked, starsByMission: s.starsByMission,
    }));
  } catch { /* storage unavailable: progress just does not persist */ }
}
function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    const s = world.state;
    s.bank = d.bank || 0;
    s.upgrades = new Set(d.upgrades || []);
    s.ownedAircraft = new Set(d.ownedAircraft || ['elang']);
    s.unlocked = d.unlocked || 1;
    s.starsByMission = d.starsByMission || {};
    if (d.aircraft && AIRCRAFT_BY_ID[d.aircraft]) s.aircraft = AIRCRAFT_BY_ID[d.aircraft];
  } catch { /* corrupt save: start fresh */ }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { best: 0, summary: scene.summary, rects: {} };
  let painted = 0;
  function paint() {
    // Keep repainting every frame: a late viewport resize resets the canvas,
    // and a one-off paint would leave it blank in the screenshot.
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted >= 2) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toLogical);
  loadGame();
  world.reset();
  let screen = SCREEN_TITLE;
  let best = world.state.bank;
  const ui = { best, summary: null, rects: {} };
  let accumulator = 0;
  let last = performance.now();
  let demoT = 0;

  function announce(message) {
    status.textContent = message;
  }
  function startMission(id) {
    world.startMission(id);
    screen = SCREEN_PLAY;
    announce(`Mission ${id}: ${world.state.mission.name}. Fly the rings, then land.`);
  }
  function handleClick(p) {
    for (const [id, r] of Object.entries(ui.rects)) {
      if (!inRect(p, r)) continue;
      if (id === 'campaign') { startMission(Math.min(world.state.unlocked, 12)); return; }
      if (id === 'free') { world.startFreeFlight(); screen = SCREEN_PLAY; return; }
      if (id === 'race') { world.startRingRace(); screen = SCREEN_PLAY; return; }
      if (id === 'landing') { world.startLanding(); screen = SCREEN_PLAY; return; }
      if (id.startsWith('aircraft:')) {
        const acId = id.slice(9);
        if (world.state.ownedAircraft.has(acId)) {
          world.state.aircraft = AIRCRAFT_BY_ID[acId];
        } else if (world.buyAircraft(acId)) {
          saveGame();
        }
        return;
      }
      if (id.startsWith('upgrade:')) {
        if (world.buyUpgrade(id.slice(8))) saveGame();
        return;
      }
      if (id === 'next') {
        if (world.state.phase === 'landed') startMission(Math.min((world.state.mission?.id || 1) + 1, 12));
        else startMission(world.state.mission?.id || 1);
        return;
      }
      if (id === 'menu') { world.reset(); screen = SCREEN_TITLE; return; }
      return;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const clicks = input.takeClicks();
    for (const p of clicks) handleClick(p);
    if (input.pressed('p') || input.pressed('P')) {
      if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
    if (input.pressed('enter') || input.pressed('Enter')) {
      if (screen === SCREEN_TITLE) startMission(Math.min(world.state.unlocked, 12));
      else if (screen === SCREEN_OVER) handleClick({ x: 935, y: 528 });
    }
    if (input.pressed('r') || input.pressed('R')) {
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER) {
        startMission(world.state.mission?.id || 1);
      }
    }
    if (input.pressed('escape') || input.pressed('Escape')) {
      if (screen !== SCREEN_TITLE) { world.reset(); screen = SCREEN_TITLE; }
    }
    if (input.pressed('u') || input.pressed('U')) {
      if (screen === SCREEN_TITLE) screen = SCREEN_SHOP;
      else if (screen === SCREEN_SHOP) screen = SCREEN_TITLE;
    }

    if (screen === SCREEN_TITLE) {
      // Attract mode: the plane flies itself over Bromo behind the panel.
      demoT += dt;
      if (world.state.phase !== 'fly') world.startMission(1);
      const ev = world.step(dt, world.autopilot());
      if (ev & EVENT_DONE) world.startMission(1);
      void ev;
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      let events = 0;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        events |= world.step(STEP, input.flight(world.state.throttle));
      }
      if (events) {
        soundFor(events);
        if (events & EVENT_DONE) {
          saveGame();
          screen = SCREEN_OVER;
          announce(world.state.message);
        }
      }
    }
    ui.best = Math.max(ui.best, world.state.bank + world.state.coins);
    renderer.draw(world.state, screen, ui);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
