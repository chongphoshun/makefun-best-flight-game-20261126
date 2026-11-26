[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/chongphoshun/makefun-best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/chongphoshun/makefun-best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Nusantara Sky Courier — Make the best flight game

Built for [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057) on [make.fun](https://make.fun).

**Bounty:** `best-flight-game-20261126-0057` — "Make the best flight game" ($500 pot, free entry)
**Title:** Nusantara Sky Courier v1: 7 islands, 12 missions, 3 aircraft, 8 upgrades

A one-screen Indonesian flight game in a chase view over recognisable
terrain. Static files only, no libraries, no network — open `game/index.html`
in desktop Chrome and play. The live leaderboard for this bounty is blind
(scores not visible), so there is no live top-10 to study; the build follows
the density pattern of past game winners instead (multi-mission campaign,
upgrades, weather, modes).

## How to play

1. Pick a mode on the title screen: **Campaign** (12 missions), **Free
   Flight**, **Ring Race** (8 rings, timed) or **Landing Challenge**.
2. Fly through each glowing **ring** inside its altitude band and heading
   window — the next ring's altitude and distance are on the HUD and above
   the ring itself. A passed ring pays coins and builds your combo (up to
   x5); a missed ring breaks it.
3. After the last ring, **land on the runway**: slow down, drop below 250 ft
   on the centreline, and touch down inside the runway window. Landing pays
   +50 coins plus a time bonus.
4. Spend coins in the **upgrade shop** (8 upgrades) or on a new aircraft
   (3 aircraft, different speed/fuel/handling). Upgrades and coins carry
   across missions and persist in localStorage.

## Systems

- **7 islands / regions**, each with its own palette, landmarks and
  terrain: Bromo volcano (cone + smoke + sea of sand), Bali rice terraces,
  Raja Ampat karst islands, Jakarta skyline (Monas), Borneo jungle river,
  Komodo savanna (pink beach), Danau Toba (Pulau Samosir).
- **12-mission campaign** with stars (3 = every ring passed), timer, fuel
  and a per-mission briefing; missions unlock in order.
- **3 aircraft**: Elang Trainer (free), Komodo STOL (150c, short-field
  landings), Garuda Jet (400c, 320 kt top speed).
- **8 upgrades**: Engine Tune, Fuel Tank, Flaps+, GPS Nav (ring tolerance
  +40%), Weather Radar (storm shake −50%), Cargo Rack (+50% pay),
  Reinforced Gear (landing tolerance +60%), Autopilot (auto-trim).
- **4 weather types**: Clear, Rain, Storm (turbulence + lightning +
  reduced visibility), Fog (heavy visibility cut) — weather changes
  handling and is shown on the HUD and the radar lamp.
- **4 modes**: Campaign, Free Flight (endless rings), Ring Race,
  Landing Challenge (start at 6,000 ft, 3 nm out).
- **Live cockpit panel**: artificial horizon, altimeter, airspeed, vertical
  speed, heading compass tape, fuel gauge, throttle lever, and four warning
  lamps (LOW FUEL, STALL, FLAPS, STORM) that light from real state. HUD
  always shows ALT (ft), SPD (kt), HDG (°), next ring, timer, coins and
  combo. Sounds are WebAudio beeps generated in code — no audio files.

## Controls

Keyboard: `↑↓` pitch, `←→` turn, `Shift`/`Ctrl` throttle up/down, `Space`
flaps/brake, `P` pause, `R` restart mission, `Enter` start/next, `U` shop,
`Esc` menu. Mouse: drag to steer, click every button.

## Screenshots (deterministic, `?shot=…&seed=1`)

| File | Scene |
| --- | --- |
| `1-start.jpg` | Title panel on the right over a live chase view above Bromo: ring 1 ahead at 3,500 ft / 1.2 nm, plane + lit instruments, HUD full (ALT 3,015 ft, SPD 135 kt, HDG 018°) |
| `2-play.jpg` | Mid-mission M4 over Raja Ampat: 3/6 rings passed, combo x3, 83 coins, rings 4–6 ahead, karst islands below, VSI −736 fpm live |
| `3-rush.jpg` | M7 storm over Komodo, landing leg: runway ahead with lights (2.9 nm), LOW FUEL lamp lit (17/100), STORM lamp lit, rain, combo x4, 221 coins |
| `4-end.jpg` | Mission complete: 3 stars, 4/4 rings, 100% accuracy, +195 coins, bank 345, upgrade shop with GPS Nav owned |

Each shot flies the real rules forward from a fresh world with the world's
own autopilot (`game/src/shots.js`) — same seed, same frame — and sets
`window.__shotReady`.

## Play-test results (v1, seed 1 — observed, not claimed vs any live board)

Scripted full-campaign run with the in-game autopilot (same inputs a player
has), Node, seed 1 — full log in `playtest-autopilot-seed1.txt`:

- **12/12 missions landed**, 77/78 rings passed, 11 missions at 3 stars.
  M1 (Bromo): 4/4 rings, 211s, +195 coins, 3 stars, fuel 59 left.
  M12 (Grand Nusantara Run, storm): 10/10 rings, 355s, +567 coins, 3 stars.
  Weakest: M8 (Toba, 5,800 ft): 6/7 rings, 2 stars — the autopilot missed
  one high ring; a player with GPS Nav would do better.
- Landing Challenge: landed in 123s (+50 coins). Ring Race: 8/8 rings,
  landed in 307s.
- Live play-test in real Chrome via CDP keyboard + mouse (seed 1): clicked
  CAMPAIGN, flew 30s with arrow keys — altitude 2,500 → 3,587 ft, speed
  104 → 150 kt, heading turned to 347°, fuel 100 → 93, **zero console
  errors**. (Blind key-mashing reached 1.06/1.5 nm to ring 1 without passing
  it — the ring needs altitude + heading, not just throttle. The autopilot
  run above is the full-mission proof.)
- One real bug found and fixed during that live test: arrow/shift keys were
  not recognised (key names were stored un-normalised); fixed in
  `game/src/input.js`, re-tested live — altitude and heading now respond.

## Known gaps vs the top-10 standard (honest)

- Terrain is stylised 2D canvas art, not 3D — a Three.js entry with real
  terrain mesh would look richer in a pairwise screenshot comparison.
- The autopilot is the only full-mission proof; no human full-mission
  play-through is recorded yet (v2 should add one).
- v1 is one build; winners iterate to v3/v4. Planned v2: 3D-feel terrain
  shading, a human full-mission run, and a harder M8 ring layout.

## Run it

```
node serve.ts            # http://localhost:8080
MAKEFUN_OUTPUT_DIR=out node main.ts   # build the entry into out/
```

## Layout

- `main.ts` — copies `game/` + `screenshots/` to the output dir, writes `dossier.json`
- `vendor/makefun-game.ts` — make.fun library, copied unchanged from the kit
- `game/index.html`, `game/src/config.js` (tuning / regions / aircraft /
  missions / upgrades / weather), `random.js` (seeded RNG), `world.js`
  (pure flight rules + autopilot), `render.js` (all drawing), `input.js`,
  `shots.js` (staged scenes), `main.js` (loop/screens/sound)
- `screenshots/` — 4 JPEGs, 1280x720, each under 256 KiB
