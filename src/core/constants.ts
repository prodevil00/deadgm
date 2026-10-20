// World and simulation constants. Units are metres; +z is "forward" along the highway.
// Pure data: no DOM / Three.js imports, so the simulation can run headless in tests.

export const SIM_DT = 1 / 60;            // fixed simulation step (s)
export const MAX_STEPS_PER_FRAME = 5;    // spiral-of-death guard

export const ROAD_HALF = 5.2;            // playable half width of the carriageway
export const BARRIER_X = 5.85;           // concrete edge barrier position
export const LANE_X = [-3.47, 0, 3.47];  // three logical lanes used by boss attacks

export const SOLDIER_RADIUS = 0.3;
export const SOLDIER_SPACING = 0.78;
export const SOLDIER_BASE_HP = 10;
export const MAX_SQUAD = 120;            // hard cap of the real squad (and rendered units)
export const MAX_SHOOTERS = 36;          // soldiers that physically emit projectiles; the rest add damage

export const MAX_ENEMIES = 160;
export const MAX_BULLETS = 520;
export const SPAWN_AHEAD = 82;           // hordes materialise when the squad is this close
export const DESPAWN_BEHIND = 16;

export const STEER_MAX_SPEED = 15;       // m/s lateral speed of the squad leader
export const BOSS_STAND_OFF = 31;        // boss spawns this far beyond the stop line
export const WEAPON_MAX_LEVEL = 6;
