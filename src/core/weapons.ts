// Weapon definitions and stat calculation. Damage numbers are per projectile/pellet.

import { WEAPON_MAX_LEVEL } from './constants';

export type WeaponId = 'rifle' | 'shotgun' | 'hmg' | 'launcher' | 'railgun';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  desc: string;
  damage: number;      // per projectile
  rate: number;        // shots per second per shooter
  range: number;       // m
  speed: number;       // projectile speed m/s
  pellets: number;     // projectiles per shot
  spread: number;      // cone half-angle (rad)
  mag: number;         // shots per magazine
  reload: number;      // s
  pierce: number;      // extra enemies a projectile may pass through
  splashRadius: number;
  splashDamage: number;
  crateHits: number;   // how much one projectile counts against a crate's number
  tracer: number;      // tracer colour (hex)
  unlockCost: number;  // scrap to unlock permanently (0 = default)
  order: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle', name: 'Assault Rifle', short: 'RIFLE', order: 0,
    desc: 'Balanced damage and fire rate. Reliable at mid range.',
    damage: 10, rate: 2.7, range: 27, speed: 62, pellets: 1, spread: 0.035,
    mag: 24, reload: 1.1, pierce: 0, splashRadius: 0, splashDamage: 0, crateHits: 1,
    tracer: 0xffc46b, unlockCost: 0,
  },
  shotgun: {
    id: 'shotgun', name: 'Combat Shotgun', short: 'SHOTGUN', order: 1,
    desc: 'Five-pellet spread. Devastating up close, weak at range.',
    damage: 7, rate: 1.2, range: 16, speed: 50, pellets: 5, spread: 0.24,
    mag: 6, reload: 1.35, pierce: 0, splashRadius: 0, splashDamage: 0, crateHits: 1,
    tracer: 0xffa060, unlockCost: 120,
  },
  hmg: {
    id: 'hmg', name: 'Heavy Machine Gun', short: 'HMG', order: 2,
    desc: 'Sustained fire with a huge belt. Shreds hordes and crates.',
    damage: 8, rate: 7, range: 29, speed: 68, pellets: 1, spread: 0.07,
    mag: 90, reload: 2.5, pierce: 0, splashRadius: 0, splashDamage: 0, crateHits: 1,
    tracer: 0xffe08a, unlockCost: 350,
  },
  launcher: {
    id: 'launcher', name: 'Grenade Launcher', short: 'LAUNCHER', order: 3,
    desc: 'Explosive rounds deal area damage to packed hordes.',
    damage: 30, rate: 0.8, range: 31, speed: 30, pellets: 1, spread: 0.03,
    mag: 4, reload: 2.1, pierce: 0, splashRadius: 2.7, splashDamage: 34, crateHits: 3,
    tracer: 0xff7a3a, unlockCost: 700,
  },
  railgun: {
    id: 'railgun', name: 'Rail Rifle XR-9', short: 'RAILGUN', order: 4,
    desc: 'Experimental military weapon. Bolts pierce up to five targets.',
    damage: 44, rate: 1.25, range: 42, speed: 150, pellets: 1, spread: 0.01,
    mag: 6, reload: 1.7, pierce: 4, splashRadius: 0, splashDamage: 0, crateHits: 3,
    tracer: 0x7fe8ff, unlockCost: 1500,
  },
};

export const WEAPON_IDS = (Object.keys(WEAPONS) as WeaponId[]).sort((a, b) => WEAPONS[a].order - WEAPONS[b].order);

export interface WeaponStats {
  damage: number;
  rate: number;
  mag: number;
  reload: number;
  splashDamage: number;
}

/** Effective stats for a weapon at an in-run level (1..6) with permanent multipliers. */
export function weaponStats(id: WeaponId, level: number, dmgMult = 1, rateMult = 1, magMult = 1): WeaponStats {
  const d = WEAPONS[id];
  const lv = Math.max(1, Math.min(WEAPON_MAX_LEVEL, Math.floor(level)));
  const lvDmg = 1 + 0.15 * (lv - 1);
  const lvRate = 1 + 0.05 * (lv - 1);
  return {
    damage: d.damage * lvDmg * dmgMult,
    rate: d.rate * lvRate * rateMult,
    mag: Math.max(1, Math.round(d.mag * magMult)),
    reload: d.reload,
    splashDamage: d.splashDamage * lvDmg * dmgMult,
  };
}

/** Sustained single-target damage per second of one soldier (includes reload downtime). */
export function sustainedDps(id: WeaponId, level: number, dmgMult = 1, rateMult = 1): number {
  const d = WEAPONS[id];
  const s = weaponStats(id, level, dmgMult, rateMult);
  const burst = s.damage * d.pellets * s.rate;
  const magTime = s.mag / s.rate;
  return burst * (magTime / (magTime + s.reload));
}
