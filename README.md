# Vice Harbor — Neon Tide

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/vinzagent/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/vinzagent/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in a neon dusk island city, built for make.fun's
gta6-01 bounty. Steal cars, run paid jobs, stack cash — and when the stars climb,
outrun the Harbor PD or get BUSTED. Everything runs offline in a desktop browser:
no installs, no network calls, no audio files.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8000
node serve.ts --port 9000
```

Then open the printed URL. Any static file server pointed at `game/` works too.
(Plain `file://` will not work — the game loads its scripts as ES modules.)

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Walk on foot · drive (accelerate, brake/reverse, steer) |
| Shift | Sprint on foot |
| Space | Handbrake |
| E | Steal / enter a car · exit your car |
| P or Esc | Pause |
| R | Restart after BUSTED / WASTED (or click) |
| Enter / click | Start from the title screen |

## What is in the city

- **A full 3D island city** (three.js, vendored locally): a 7×7 block grid with
  procedurally varied towers, lit windows, rooftop neon signs, parking lots,
  palm trees, street lamps, painted crosswalks and dashed lane lines, wrapped
  in a sunset sky, gradient ocean and warm dusk fog.
- **On foot and behind the wheel.** Walk the sidewalks, then jack any parked or
  moving car with E. Arcade driving with acceleration, reverse, handbrake
  slides, wheel spin and speed-sensitive steering.
- **Living traffic and crowds.** Cars loop the ring roads, brake for each other
  and stop (briefly) when you step in front of them; pedestrians stroll the
  blocks, panic and flee from reckless driving, and can be knocked down.
- **A real wanted system.** Stars rise for carjacking, collisions, hit-and-runs
  and gunning it past the law. Each star sends another cruiser with flashing
  light bars after you; they ram, box you in, and fill your BUST meter when
  they pin you. Break line of sight and stay clean to cool the heat down.
  Health drains in crashes and on foot — hit zero and you are WASTED.
- **Three rotating jobs**, marked by light pillars and a minimap target, each
  with a countdown and a cash payout that scales with the heat:
  *Checkpoint Run* (reach the marker), *Cash Grab* (collect five briefcases),
  and *Hot Delivery* (pick up a package, then beat the clock to the drop-off).
- **Full HUD**: cash, health bar, wanted stars, live mission banner with
  timer, context prompts, toasts, a BUST meter, speedometer, and a real-time
  canvas minimap with traffic, police, pedestrians and your objective.
- **Synthesized sound** — engine hum that follows your speed, two-tone sirens,
  pickup chimes, crash thuds and end-of-run stings, all generated with
  WebAudio after your first click. No audio files anywhere.
- **Deterministic screenshot scenes** for the dossier: `?shot=title|play|chase|busted&seed=<n>`
  freezes a seeded, fixed-step scene and sets `window.__shotReady`.

## Layout

- `game/index.html` — page, HUD and overlays
- `game/src/` — `main.js` (game loop, physics, police, camera), `city.js`
  (procedural city), `actors.js` (cars, police, pedestrians), `missions.js`
  (the three jobs), `hud.js` (HUD + minimap), `audio.js` (WebAudio SFX),
  `rng.js` (seeded randomness)
- `game/vendor/three.min.js` — three.js r160, vendored so the game is offline
- `main.ts` — builds the submission dossier into `$MAKEFUN_OUTPUT_DIR`
- `screenshots/` — the four dossier screenshots, captured from the real game

Vice Harbor is an original work: its city, name, art and code were created for
this bounty and borrow nothing from any existing game.
