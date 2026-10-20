// Permanent upgrades bought with scrap, and the run modifiers they produce.

import { SOLDIER_BASE_HP } from './constants';
import { WEAPONS, type WeaponId } from './weapons';

export type UpgradeId = 'squad' | 'damage' | 'rate' | 'armor' | 'recruiter' | 'frags';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  max: number;
  costs: number[];                     // cost of buying level i+1
  value: (level: number) => number;    // numeric effect at a level
  format: (v: number) => string;       // how the effect is shown
}

const geometric = (base: number, factor: number, n: number) =>
  Array.from({ length: n }, (_, i) => Math.round((base * Math.pow(factor, i)) / 5) * 5);

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  squad: {
    id: 'squad', name: 'Recruits', desc: 'Soldiers at the start of every mission.',
    max: 8, costs: geometric(40, 1.5, 8),
    value: (l) => 3 + l, format: (v) => `${v} soldiers`,
  },
  damage: {
    id: 'damage', name: 'Hollow Points', desc: 'Permanent bonus to all weapon damage.',
    max: 10, costs: geometric(50, 1.42, 10),
    value: (l) => 1 + 0.08 * l, format: (v) => `+${Math.round((v - 1) * 100)}% damage`,
  },
  rate: {
    id: 'rate', name: 'Drum Mags', desc: 'Permanent bonus to fire rate.',
    max: 8, costs: geometric(60, 1.45, 8),
    value: (l) => 1 + 0.05 * l, format: (v) => `+${Math.round((v - 1) * 100)}% fire rate`,
  },
  armor: {
    id: 'armor', name: 'Body Armour', desc: 'More health per soldier — survive more hits.',
    max: 8, costs: geometric(45, 1.45, 8),
    value: (l) => SOLDIER_BASE_HP * (1 + 0.2 * l), format: (v) => `${Math.round(v)} HP per soldier`,
  },
  recruiter: {
    id: 'recruiter', name: 'Field Recruiter', desc: 'Every blue "+" gate brings extra soldiers.',
    max: 3, costs: [150, 400, 900],
    value: (l) => l, format: (v) => (v === 0 ? 'No bonus' : `+${v} per blue gate`),
  },
  frags: {
    id: 'frags', name: 'Airstrike Beacon', desc: 'Airstrikes you can call in each mission.',
    max: 3, costs: [120, 350, 800],
    value: (l) => l, format: (v) => `${v} per mission`,
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export type UpgradeLevels = Record<UpgradeId, number>;

export function emptyUpgrades(): UpgradeLevels {
  return { squad: 0, damage: 0, rate: 0, armor: 0, recruiter: 0, frags: 0 };
}

export function upgradeCost(id: UpgradeId, level: number): number | null {
  const d = UPGRADES[id];
  return level >= d.max ? null : d.costs[level];
}

export interface RunModifiers {
  startSquad: number;
  dmgMult: number;
  rateMult: number;
  soldierHp: number;
  recruiterBonus: number;
  airstrikes: number;
  startWeapon: WeaponId;
}

export function runModifiers(levels: UpgradeLevels, startWeapon: WeaponId = 'rifle'): RunModifiers {
  return {
    startSquad: UPGRADES.squad.value(levels.squad),
    dmgMult: UPGRADES.damage.value(levels.damage),
    rateMult: UPGRADES.rate.value(levels.rate),
    soldierHp: UPGRADES.armor.value(levels.armor),
    recruiterBonus: UPGRADES.recruiter.value(levels.recruiter),
    airstrikes: UPGRADES.frags.value(levels.frags),
    startWeapon: WEAPONS[startWeapon] ? startWeapon : 'rifle',
  };
}
