// Central tuning values. Pure data — no Phaser import, so tests can read it.

export const GAME_W = 540;
export const GAME_H = 960;

export const ROAD = {
  left: 78,
  right: 462,
  get width() { return this.right - this.left; },
  get center() { return (this.left + this.right) / 2; },
};

export const PALETTE = {
  night: 0x0d0f12,
  asphalt: 0x1c1e22,
  dirt: 0x2a2520,
  line: 0xc9b458,
  blood: 0x8a1414,
  bloodDark: 0x4a0a0a,
  amber: 0xffb02e,
  red: 0xe8412c,
  bone: 0xe8e2d0,
  steel: 0x8f9aa3,
  toxic: 0x9fd356,
  ui: 0x14171b,
  uiEdge: 0x3a3f46,
};

export const CSS = {
  amber: '#ffb02e',
  red: '#e8412c',
  bone: '#e8e2d0',
  muted: '#8b8f94',
  toxic: '#9fd356',
  dark: '#0d0f12',
};

export const FONT = {
  display: '"Black Ops One", "Impact", "Arial Black", sans-serif',
  ui: '"Oswald", "Arial Narrow", "Helvetica Neue", Arial, sans-serif',
};

export const LEVEL = {
  length: 24000,          // world px until the boss appears
  pxPerMeter: 8,          // HUD distance conversion
  baseScroll: 200,        // px/s at the start
  maxScroll: 250,         // px/s just before the boss
  bossScroll: 40,         // slow crawl during the boss fight
  gates: [], // (legacy) gates are now placed by the route script
};

export const VEHICLE = {
  y: 770,
  radius: 30,
  halfW: 28,
  halfH: 48,
  baseHp: 100,
  accel: 2800,
  maxSpeed: 430,
  friction: 9,
  touchFollow: 14,
  invulnTime: 0.45,
};

export const WEAPON = {
  baseDamage: 1,
  baseInterval: 0.16,
  bulletSpeed: 950,
  range: 560,
  spread: 0.11,          // radians between barrels
  shockCooldown: 11,
  shockRadius: 210,
  shockDamage: 12,
};

export const ZOMBIES = {
  walker: { hp: 3, radius: 16, fall: 40, chase: 30, kills: 1, score: 10, texture: 'z_walker' },
  runner: { hp: 3, radius: 14, fall: 150, chase: 90, kills: 1, score: 15, texture: 'z_runner' },
  brute:  { hp: 60, radius: 27, fall: 26, chase: 22, kills: 5, score: 60, texture: 'z_brute', heavy: true },
  boss:   { hp: 9000, radius: 70, fall: 18, chase: 30, kills: 1, score: 2000, texture: 'z_boss', heavy: true },
};

// Squad weapons, unlocked by shooting open the barrels on the road.
export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', damage: 2, interval: 0.26, speed: 900, tint: 0xfff1b0, icon: null },
  { id: 'rifle', name: 'RIFLE', damage: 2, interval: 0.24, speed: 1000, tint: 0xffe08a, icon: 'w_rifle' },
  { id: 'smg', name: 'SMG', damage: 2, interval: 0.12, speed: 1000, tint: 0xffc46b, icon: 'w_smg' },
  { id: 'minigun', name: 'MINIGUN', damage: 3, interval: 0.07, speed: 1100, tint: 0xffa64a, icon: 'w_minigun' },
  { id: 'rocket', name: 'ROCKETS', damage: 14, interval: 0.45, speed: 700, tint: 0xff6a3d, icon: 'w_rocket', splash: 70 },
];

export const SQUAD = {
  y: 790,
  spacing: 21,
  max: 40,
  maxVolley: 10, // visible bullets per volley; damage scales so big squads stay cheap
};

export const LIMITS = {
  zombies: 70,
  bullets: 160,
  obstacles: 14,
  pickups: 40,
  decals: 40,
  props: 26,
};

export const STORAGE_KEY = 'deadroute.save.v1';
