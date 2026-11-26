// Nusantara Sky Courier — every tuning number, region, aircraft, mission and
// upgrade in one place. The playfield is a fixed 1280x720 logical area; the
// renderer scales it to the window, so no rule below depends on screen size.
export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const PALETTE = {
  sky: '#7ec8f2',
  skyDusk: '#f2a35e',
  hud: '#0b1c2c',
  hudText: '#eaf6ff',
  panel: '#101c26',
  panelEdge: '#3a5a72',
  text: '#eaf6ff',
  muted: '#9db8c9',
  gold: '#f2c94c',
  danger: '#ff5a4e',
  ok: '#37c25f',
  ring: '#ffd94d',
  ringPass: '#37c25f',
  runway: '#3a3f46',
};

// 7 regions, each with its own palette + landmark set the renderer draws.
export const REGIONS = [
  {
    id: 'bromo', name: 'Bromo, Jawa Timur', short: 'BROMO', kind: 'volcano',
    sky: '#8ec9ee', ground: '#6b7a52', groundFar: '#8a9a6a', water: null,
    accent: '#5a4632', note: 'Gunung Bromo & lautan pasir',
  },
  {
    id: 'bali', name: 'Tegalalang, Bali', short: 'BALI', kind: 'terraces',
    sky: '#7ec8f2', ground: '#3f9e4d', groundFar: '#7cc46a', water: '#2e86c1',
    accent: '#2e7d32', note: 'Sawah terasering Tegalalang',
  },
  {
    id: 'rajaampat', name: 'Raja Ampat, Papua', short: 'RAJA AMPAT', kind: 'karst',
    sky: '#6fc3ef', ground: '#1d7a6e', groundFar: '#2fae8f', water: '#19b8c9',
    accent: '#0e5f52', note: 'Pulau karst di laut turquoise',
  },
  {
    id: 'jakarta', name: 'Jakarta', short: 'JAKARTA', kind: 'city',
    sky: '#9fc4dd', ground: '#7a7f85', groundFar: '#a8adb2', water: '#3f6d8e',
    accent: '#33414f', note: 'Skyline Monas & gedung pencakar langit',
  },
  {
    id: 'borneo', name: 'Kalimantan — Sungai Kapuas', short: 'BORNEO', kind: 'jungle',
    sky: '#86c9a8', ground: '#1f6b34', groundFar: '#3f9e4d', water: '#2e6fb3',
    accent: '#123f1e', note: 'Hutan hujan & sungai berkelok',
  },
  {
    id: 'komodo', name: 'Pulau Komodo', short: 'KOMODO', kind: 'savanna',
    sky: '#f2c184', ground: '#c9a35a', groundFar: '#e0c078', water: '#2e86c1',
    accent: '#8a6d2f', note: 'Sabana kering & bukit pink beach',
  },
  {
    id: 'toba', name: 'Danau Toba, Sumatra', short: 'TOBA', kind: 'lake',
    sky: '#7ec8f2', ground: '#3f7a4d', groundFar: '#6aa86a', water: '#2e6fb3',
    accent: '#1f4d2e', note: 'Danau vulkanik & Pulau Samosir',
  },
];

// 3 aircraft: speed, fuel capacity, handling (turn/pitch authority), landing ease.
export const AIRCRAFT = [
  { id: 'elang', name: 'Elang Trainer', desc: 'Prop trainer — slow, forgiving', maxSpeed: 150, fuel: 100, handling: 1.0, landEase: 1.0, cost: 0, color: '#e8b13c' },
  { id: 'komodo', name: 'Komodo STOL', desc: 'Bush plane — short-field landings', maxSpeed: 180, fuel: 95, handling: 1.25, landEase: 1.6, cost: 150, color: '#3fae5a' },
  { id: 'garuda', name: 'Garuda Jet', desc: 'Jet courier — fast, thirsty', maxSpeed: 320, fuel: 80, handling: 0.8, landEase: 0.8, cost: 400, color: '#4da3ff' },
];

// 8 upgrades. cost in coins, effect applied in world.js.
export const UPGRADES = [
  { id: 'engine', name: 'Engine Tune', desc: '+25 kt top speed', cost: 80 },
  { id: 'tank', name: 'Fuel Tank', desc: '+30 fuel capacity', cost: 60 },
  { id: 'flaps', name: 'Flaps+', desc: 'Stronger braking, easier landing', cost: 70 },
  { id: 'gps', name: 'GPS Nav', desc: 'Ring tolerance +40%', cost: 50 },
  { id: 'radar', name: 'Weather Radar', desc: 'Storm shake −50%, see through fog', cost: 90 },
  { id: 'rack', name: 'Cargo Rack', desc: '+50% ring & delivery pay', cost: 65 },
  { id: 'gear', name: 'Reinforced Gear', desc: 'Landing tolerance +60%', cost: 75 },
  { id: 'autopilot', name: 'Autopilot', desc: 'Auto-trim holds altitude', cost: 120 },
];

// Weather: turbulence shake (deg/s jitter), visibility (0-1), rain/fog flags.
export const WEATHER = {
  clear: { label: 'CLEAR', turb: 0.0, vis: 1.0, rain: false, fog: 0 },
  rain: { label: 'RAIN', turb: 0.35, vis: 0.85, rain: true, fog: 0 },
  storm: { label: 'STORM', turb: 1.0, vis: 0.6, rain: true, fog: 0.25 },
  fog: { label: 'FOG', turb: 0.15, vis: 0.45, rain: false, fog: 0.55 },
};

// 12-mission campaign. rings: count; altBand: target altitude per ring (ft);
// course: heading changes per leg (deg); time: seconds; reward: base coins.
export const MISSIONS = [
  { id: 1, name: 'Penerbangan Perdana', region: 'bromo', weather: 'clear', rings: 4, altBase: 3500, time: 225, reward: 100, brief: 'Terbang melewati 4 ring di atas Bromo, lalu mendarat.' },
  { id: 2, name: 'Antar Kopi Gayo', region: 'toba', weather: 'clear', rings: 5, altBase: 4200, time: 250, reward: 120, brief: 'Antar kopi melintasi Danau Toba — 5 ring, mendarat di tepi danau.' },
  { id: 3, name: 'Terasering Bali', region: 'bali', weather: 'rain', rings: 5, altBase: 3000, time: 250, reward: 130, brief: 'Hujan di atas sawah Tegalalang. Jaga ketinggian di antara ring.' },
  { id: 4, name: 'Kurir Karst', region: 'rajaampat', weather: 'clear', rings: 6, altBase: 2800, time: 275, reward: 150, brief: 'Slalom antar pulau karst Raja Ampat — 6 ring sempit.' },
  { id: 5, name: 'Jakarta Rush Hour', region: 'jakarta', weather: 'fog', rings: 6, altBase: 5000, time: 300, reward: 160, brief: 'Kabut di atas skyline Jakarta. Percaya pada instrumen.' },
  { id: 6, name: 'Sungai Kapuas', region: 'borneo', weather: 'rain', rings: 6, altBase: 3200, time: 300, reward: 170, brief: 'Ikuti sungai berkelok Kalimantan di tengah hujan.' },
  { id: 7, name: 'Badai Komodo', region: 'komodo', weather: 'storm', rings: 7, altBase: 3800, time: 325, reward: 200, brief: 'Badai di atas sabana Komodo. Radar cuaca sangat membantu.' },
  { id: 8, name: 'Foto Udara Toba', region: 'toba', weather: 'clear', rings: 7, altBase: 5800, time: 375, reward: 200, brief: 'Naik tinggi untuk foto udara Pulau Samosir — 7 ring.' },
  { id: 9, name: 'Malam di Bromo', region: 'bromo', weather: 'fog', rings: 7, altBase: 4500, time: 325, reward: 210, brief: 'Kabut malam di kawah Bromo. Terbang dengan kompas.' },
  { id: 10, name: 'Evakuasi Raja Ampat', region: 'rajaampat', weather: 'storm', rings: 8, altBase: 3000, time: 350, reward: 240, brief: 'Misi penyelamatan di tengah badai — 8 ring, tanpa boleh gagal.' },
  { id: 11, name: 'Kurir Lintas Pulau', region: 'jakarta', weather: 'rain', rings: 8, altBase: 5500, time: 400, reward: 260, brief: 'Jakarta ke Toba dalam satu penerbangan — 8 ring, bahan bakar ketat.' },
  { id: 12, name: 'Grand Nusantara Run', region: 'bali', weather: 'storm', rings: 10, altBase: 4000, time: 450, reward: 400, brief: 'Final: 10 ring melintasi 7 pulau dalam badai. Buktikan kau kurir terbaik Nusantara.' },
];

export const RING_PAY = 25;
export const LANDING_PAY = 50;
export const TIME_BONUS_PER_SEC = 2;
export const COMBO_CAP = 5;

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const AIRCRAFT_BY_ID = Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
