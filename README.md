# DEAD ROUTE: SURVIVAL

A short, replayable zombie runner-shooter. You lead a squad of survivors up a desert highway. **Your squad fires straight ahead - you aim by moving.** Shoot gates to raise their value and walk through the better one to grow your squad (`+3`, `x2`, or a bad `-5`), shoot wooden barrels open to unlock heavier weapons, survive the hordes and brutes, and bring down **The Butcher** at the end of the road.

Inspired by the gameplay loop of mobile zombie-route games (forward push, lane-split gates, squad growth, weapon barrels, end boss, permanent upgrades). All code, art, sound and names are original; textures are drawn procedurally at startup and all sounds are synthesised with Web Audio.

## Tech

- [Phaser 3](https://phaser.io) (2D engine) — only runtime dependency
- [Vite](https://vitejs.dev) — dev server and production build
- Node's built-in test runner for unit tests (no test framework dependency)
- Plain JavaScript (ES modules), no backend, no accounts

## Quick start

Requires **Node.js 20.19+** (22 LTS recommended).

```bash
npm install          # install Phaser + Vite (creates package-lock.json — commit it)
npm run dev          # dev server on http://localhost:5173  (also reachable from your phone on the same Wi-Fi)
npm test             # unit tests for collision, difficulty, upgrades, save system, pooling
npm run build        # production build into dist/
npm run preview      # serve dist/ locally on http://localhost:4173
```

Testing on a phone: run `npm run dev`, then open the "Network" URL Vite prints (e.g. `http://192.168.1.20:5173`) on the phone.

## Controls

| | Desktop | Mobile / touch |
|---|---|---|
| Move squad | Arrow keys or `A` `D` (or click-and-drag) | Drag anywhere (relative drag - your finger never covers the squad) |
| Shoot | Continuous, straight ahead - line up with what you want to hit | Same |
| Pause | `P` / `Esc` or the pause button | Pause button (top right) |
| Menus | Mouse, `Enter` to start / retry | Tap |

The game also pauses automatically when the tab or app goes to the background.

## What's in the prototype

- **Main menu** with animated backdrop, Play / Garage / Settings, sound toggle, best score / scrap / wins.
- **One complete level** (~3 km, about 2 minutes) built from beats: gate pairs, hordes, brutes, barrels. Difficulty ramps with progress (zombie HP, horde size, runners, brutes).
- **Squad** of up to 40 soldiers in formation. Every zombie that reaches the squad kills a soldier (brutes kill 5). Squad at 0 = game over.
- **Value gates:** blue (+), red (-) and gold (x). Bullets hitting a gate raise its value (each step costs more) - a red gate can be shot up to positive. Gates also soak up bullets, so pumping one means not shooting zombies.
- **Barrels with hit points:** shoot to 0 to unlock RIFLE -> SMG -> MINIGUN -> ROCKETS (splash) or recruit extra soldiers. Walking into an unopened barrel costs soldiers.
- **Boss - The Butcher:** big HP number and bar, walks down toward you, stomps soldiers when it reaches the squad, summons walkers.
- **Feedback:** damage numbers, blood/gore particles, blood and scorch decals, muzzle flashes, screen shake (toggleable), squad-count popups, weapon unlock banners.
- **Garage:** permanent upgrades (extra starting soldiers, damage, fire rate) bought with scrap from runs, saved in `localStorage`.
- **Results screen**, pause menu with restart (no page reload), settings (sound, shake, reset progress).
- **Synthesised audio:** gunfire, hits, splats, groans, explosions, unlock jingles, boss roar, win/lose stingers, UI clicks.

## Project structure

```
index.html              page shell, fonts, mobile meta tags
vite.config.js          base: './' so the build works under any GitHub Pages path
src/
  main.js               Phaser config, scene list, font loading
  config.js             all tuning values (sizes, speeds, HP, damage, limits)
  art/textures.js       procedural textures (road, soldiers, zombies, barrels, weapons, props, FX)
  scenes/               Boot, Menu, Garage, Game, Pause/Settings/Result overlays
  entities/             Squad, Zombie, RouteObjects (value gates, reward barrels), Hazards (bullets)
  world/                Road (scrolling ground + props + decals), Spawner
  ui/                   Button, HUD
  systems/              collision, difficulty curve, upgrades, save, Pool, Audio
tests/logic.test.js     unit tests for the pure game-logic modules
.github/workflows/      GitHub Pages build + deploy
```

Balance lives in `src/config.js` and `src/systems/difficulty.js`.

Add `?renderer=canvas` to the URL to force Phaser's Canvas renderer (useful on devices with poor WebGL drivers).

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `dead-route`), then from this folder:
   ```bash
   git init            # skip if the folder is already a repo
   git add .
   git commit -m "Dead Route prototype"
   git branch -M main
   git remote add origin https://github.com/prodevil00/deadgm.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` installs, runs the unit tests, builds and deploys on every push to `main`. Watch it under the **Actions** tab; when it is green the game is live at `https://prodevil00.github.io/deadgm/`.

Because `vite.config.js` uses `base: './'`, the build doesn't need to know the repository name.

## Known limitations

- One level and one boss; no music track (SFX only).
- Runs are partly random, so difficulty varies. Without weapon upgrades the boss is very hard - open the barrels.
- Fonts (Black Ops One, Oswald) load from Google Fonts. Offline, the game falls back to system fonts after 2.5 s — it works, but the title looks plainer.
- Art is procedural vector shapes: readable and consistent, but not hand-illustrated.
- The game is portrait-first (540×960 logical resolution, scaled to fit). On landscape screens it is letterboxed.
- Balance was checked with an automated bot, not yet with human playtesters.
- No license file yet — add one before making the repository public if you want others to reuse the code.
