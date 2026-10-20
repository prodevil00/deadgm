# LAST CONVOY — Mobile Apocalypse

A portrait, touch-first **3D zombie squad runner** for phones, playable in Safari and Chrome (and installable as a PWA). You lead a squad of survivors up a desert highway: drag to steer, walk through the better gate to grow your army, shoot numbered crates open for heavier weapons, survive the hordes and bring down four multi-phase bosses.

Gameplay structure, camera and presentation are inspired by mobile games such as *Z Route: Redemption*. **All code, models, textures, sounds and names are original** — characters and props are built from primitives at startup, textures are drawn on canvases, every sound is synthesised with the Web Audio API.

## Play / run locally

Requires **Node.js 20.19+** (22 LTS recommended).

```bash
npm install          # three + build tooling (creates package-lock.json — commit it)
npm run dev          # dev server with live reload on http://localhost:5173
                     #   → also prints a "Network" URL: open it on your phone (same Wi-Fi)
npm test             # unit tests: gates, formation, weapons, saves, progression, simulation
npm run balance      # plays the whole campaign with bots of 3 skill levels (prints a table)
npm run build        # type-check + production build into dist/
npm run preview      # serves dist/ on http://localhost:4173 (+ LAN URL)
```

Developer conveniences (not part of the phone experience): arrow keys steer, and `window.__game` exposes the game in the console.

## How to play

| | |
|---|---|
| **Steer** | Press anywhere and drag left/right. Relative drag — your finger never covers the squad. |
| **Shoot** | Automatic. Soldiers pick targets by distance and threat. Line up with crates and cracked gates to shoot them. |
| **Gates** | Blue `+N` soldiers · yellow `×2/×3` multiply · pink `GUN +1` weapon level · green `SHIELD` heal + shield · purple `RATE` · orange `DMG` · red `-N` lose soldiers. Gates with cracked glass grow when shot — even a red gate can turn blue. |
| **Crates** | The number is how many hits it needs. Shoot it to zero to get the reward shown above it (weapon, recruits, ammo, damage boost, shield, airstrike, scrap). Walking into a closed crate crushes soldiers. |
| **Danger** | Red circles / red lanes fill up before an attack lands — move out. Walls and fire only hurt if you steer *into* them; the crowd squeezes past on the side you're on. |
| **Airstrike** | Gold button (bottom right) when you have one. Huge damage, great against bosses. |
| **Pause** | Top-left button. The game also pauses when you switch apps. |

## What's in the game

- **Real 3D scene** (Three.js, WebGL): desert highway with lane markings, jersey barriers, dunes, cacti, rocks, wrecked cars, military trucks, tanks, telegraph poles, mesas on the horizon, sky dome with sun glow, fog and five times of day.
- **Squad system**: up to 120 real soldiers, each with position, health, magazine, reload, recoil and walk cycle. Dynamic formation (rows/columns, no overlap, stays on the road, squeezes through gaps). New recruits run in with a golden glow; casualties fall and leave the formation.
- **5 weapons**: assault rifle, combat shotgun (5-pellet spread), heavy machine gun, grenade launcher (splash), XR-9 rail rifle (piercing). Damage, fire rate, range, projectile speed, magazine/reload, upgrade levels 1–6, distinct models, tracers, muzzle flashes and sounds.
- **6 enemy archetypes**: walker, runner (fast), riot zombie (armour −55 % damage), mutant (grabs the front line and telegraphs ground slams), spitter (keeps distance, lobs acid at telegraphed spots) — plus summoned minions.
- **4 bosses with phases**: The Matron (summons, lane slams, enrage), Rot Hulk (acid storms), The Convoy Breaker (armoured, throws wrecks, lane charges), The Wasteland Queen (4 phases). Phase transitions, stagger, readable telegraphs, stomp at close range, big HP bar with phase ticks.
- **10 missions** with different layouts, enemy mixes, gate sequences, walls, fire/acid zones, explosive barrels, survivors to rescue, three objective types (reach / bring N survivors / defeat boss), difficulty rating, star thresholds, rewards and unlock order. Missions are data in `src/core/missions.ts`.
- **Progression**: scrap from kills, survivors, stars and missions; 6 permanent upgrades (recruits, damage, fire rate, armour, recruiter, airstrikes) and weapon unlocks/loadout, saved in `localStorage` with validation of corrupt/missing data and a reset option.
- **Complete mobile UI**: loading, main menu with the game playing live in the background, mission select, briefing, HUD (squad badge, objective/progress, weapon level, buffs, boss bar, captions, airstrike), pause, victory (stars, reward breakdown), defeat (reason, tips, retry/upgrade), upgrades/armory, settings (volumes, mute, vibration, shake, graphics Auto/Low/Medium/High). Safe-area aware, portrait only (landscape phones see a rotate prompt).
- **Audio**: synthesised gunfire per weapon, impacts, splats, explosions, zombie groans, boss roars, warnings, gate/recruit/crate/upgrade jingles, victory/defeat stingers, procedural music (menu / run / boss) and desert wind. Starts after the first tap (mobile autoplay rules).
- **Performance**: instanced characters (≈5 draw calls for the whole squad), merged vertex-coloured props, pooled bullets/particles/decals/text, fixed caps (160 enemies, 520 bullets, ≤1100 particles), fixed 60 Hz simulation, frame cap (30 fps on Low), automatic quality downgrade when FPS drops, pause on tab hide.
- **Offline / PWA**: manifest, icons, service worker with a versioned precache (works offline after the first visit).

## Project structure

```
index.html                 page shell (stage, loading screen, rotate prompt)
public/                    manifest.webmanifest, icons/ (copied to dist/ as-is)
scripts/                   build.mjs · dev.mjs · preview.mjs · test.mjs (esbuild-based) · icons.mjs
src/
  main.ts                  entry: WebGL check, boot, service worker
  sw-template.js           service worker template (precache list injected at build)
  core/                    PURE game logic — no DOM, no Three.js, fully testable
    constants.ts           world size, caps, timestep
    sim.ts                 the deterministic simulation (squad, combat, AI, bosses, gates, crates, win/lose)
    missions.ts            the 10 missions (data)
    bosses.ts enemies.ts weapons.ts upgrades.ts gates.ts formation.ts
    progression.ts save.ts rng.ts bot.ts types.ts
  render/                  Three.js view: view.ts (maps sim → visuals), world.ts (environment),
                           models.ts (original low-poly models), rig.ts (instanced animated characters),
                           fx.ts (particles, tracers, decals, telegraphs), textures.ts, floattext.ts
  ui/                      hud.ts, screens.ts, icons.ts, styles.css
  app/                     game.ts (state machine, loop, flow), input.ts (touch steering, haptics)
  audio/audio.ts           Web Audio synthesiser
tests/                     logic.test.ts (fast), balance.test.ts (campaign simulation)
LICENSES/                  font licences (SIL OFL 1.1)
```

Balance lives in `src/core/missions.ts`, `bosses.ts`, `enemies.ts`, `weapons.ts` and `upgrades.ts`. After changing numbers run `npm run balance`.

### Adding a mission

Append an object to `MISSIONS` in `src/core/missions.ts` (see the helpers at the top: `pair`, `single`, `horde`, `crate`, `wall`, `fire`, `acid`, `surv`, `barrel`, `mutant`, `spitter`). The unit test checks ids/ordering; the balance test tells you if it is beatable.

## Publish on GitHub Pages

The workflow `.github/workflows/deploy.yml` installs dependencies, runs the unit tests and the balance simulation, builds and deploys `dist/` on every push to `main`.

1. Push this project to your repository's `main` branch (e.g. merge the pull request).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (one-time).
3. Watch the **Actions** tab. When it is green the game is live at `https://<user>.github.io/<repo>/` — for this repository `https://prodevil00.github.io/deadgm/`.
4. Open that URL on the iPhone in Safari → tap **Play**. To install: Share → **Add to Home Screen** (Android/Chrome: menu → Install app).

All asset URLs are relative, so the build works at a domain root or under any sub-path. Any static host works the same way: upload the contents of `dist/` (Netlify, Cloudflare Pages, Vercel, an S3 bucket, nginx…).

**HTTPS matters**: browsers only register service workers (offline mode, installable PWA) on HTTPS or `localhost`. GitHub Pages and the hosts above serve HTTPS automatically. Over plain HTTP — e.g. the LAN URL of `npm run dev` on your phone — the game plays normally but won't install or work offline. If you self-host, serve `sw.js` and `index.html` with `Cache-Control: no-cache` (the hashed files in `assets/` can be cached forever).

## Testing that was done

- `npm test`: 23 unit tests — gate maths, formation (no overlap, inside road), weapons, upgrades, save sanitising (corrupt JSON, hostile values, missing storage), rewards/unlocks/purchases, and simulation tests (gates apply exactly once, penalties, combat, crate rewards, crushing, survivor objective, boss phases and kill, no damage after the end, determinism, bounded entity counts).
- `npm run balance`: bots at skill 0.85 / 0.7 / 0.55 play the full campaign, buying upgrades between runs; all finish (≈11–14 attempts for 10 missions; boss missions sometimes need retries). A player who never upgrades can clear missions 1–3; the final mission is not beatable on a fresh save.
- Headless Chromium (Playwright, software WebGL) in an iPhone-sized viewport with touch emulation: boot, menu, briefing, real touch-drag steering, gates, pause/resume, full boss mission to victory, defeat flow, upgrades/armory purchases, settings, persistence across reload, 16 repeated mission loads with stable GPU resources and heap, audio context unlock, no console errors.

## Known limitations

- Not yet tested on physical iPhones/Android phones — only in emulated mobile Chromium. Real-device frame rate depends on the GPU; use Settings → Graphics if a phone runs hot (Auto also downgrades itself when FPS drops).
- Vibration uses the Vibration API, which iOS Safari does not support (the toggle is hidden there; Android only).
- Characters are stylised low-poly models with procedural animation, not skinned/motion-captured models.
- No `package-lock.json` is committed yet (it was generated offline); the first `npm install` creates one — commit it for reproducible builds.
- Balance has been verified by bots, not yet by human playtesters.

## Assets & licences

- Fonts: **Anton** and **Barlow Condensed** (SIL Open Font License 1.1), subset and bundled locally — see `LICENSES/`.
- Everything else (models, textures, icons, sounds, music) is generated by the code in this repository.
- Three.js is MIT licensed.
