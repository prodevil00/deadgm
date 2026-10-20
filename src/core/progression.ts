// Rewards, mission unlocks and purchases. Pure functions operating on SaveData.

import type { MissionDef } from './types';
import type { SaveData } from './save';
import { upgradeCost, UPGRADES, type UpgradeId } from './upgrades';
import { WEAPONS, type WeaponId } from './weapons';

export type DefeatReason = 'wiped' | 'survivors' | 'boss' | 'quit';

export interface RunResult {
  missionId: number;
  won: boolean;
  reason: DefeatReason | null;
  kills: number;
  killScrap: number;
  bonusScrap: number;   // scrap crates
  survivors: number;
  peakSquad: number;
  time: number;
  bossKilled: boolean;
}

export interface RewardBreakdown {
  mission: number;
  kills: number;
  survivors: number;
  stars: number;
  crates: number;
  total: number;
  starsEarned: number;
  firstClear: boolean;
}

export function starsFor(m: MissionDef, r: RunResult): number {
  if (!r.won) return 0;
  return 1 + (r.survivors >= m.stars[0] ? 1 : 0) + (r.survivors >= m.stars[1] ? 1 : 0);
}

export function computeRewards(m: MissionDef, r: RunResult, save: SaveData): RewardBreakdown {
  const prev = save.missions[m.id];
  const firstClear = r.won && !prev?.cleared;
  const starsEarned = starsFor(m, r);
  const mission = r.won ? Math.round(m.reward * (firstClear ? 1 : 0.5)) : 0;
  // A failed run still salvages part of what was earned, so progress never stalls completely.
  const kills = Math.round(r.killScrap * (r.won ? 1 : 0.6));
  const survivors = r.won ? r.survivors : 0;
  const stars = r.won ? starsEarned * 15 : 0;
  const crates = Math.round(r.bonusScrap * (r.won ? 1 : 0.6));
  return { mission, kills, survivors, stars, crates, total: mission + kills + survivors + stars + crates, starsEarned, firstClear };
}

/** Applies a finished run to the save (scrap, best stars, stats). Returns the reward breakdown. */
export function applyRun(save: SaveData, m: MissionDef, r: RunResult): RewardBreakdown {
  const rw = computeRewards(m, r, save);
  save.scrap += rw.total;
  save.stats.runs += 1;
  save.stats.kills += r.kills;
  if (r.won) save.stats.wins += 1;
  if (r.bossKilled) save.stats.bossKills += 1;
  const prev = save.missions[m.id] ?? { cleared: false, stars: 0, best: 0 };
  save.missions[m.id] = {
    cleared: prev.cleared || r.won,
    stars: Math.max(prev.stars, rw.starsEarned),
    best: r.won ? Math.max(prev.best, r.survivors) : prev.best,
  };
  return rw;
}

export function isUnlocked(save: SaveData, missionId: number): boolean {
  return missionId <= 1 || !!save.missions[missionId - 1]?.cleared;
}

/** The mission the "Play" button starts: first uncleared unlocked mission, else the last one. */
export function currentMission(save: SaveData, missions: MissionDef[]): MissionDef {
  for (const m of missions) if (!save.missions[m.id]?.cleared) return m;
  return missions[missions.length - 1];
}

export function buyUpgrade(save: SaveData, id: UpgradeId): boolean {
  const lvl = save.upgrades[id];
  const cost = upgradeCost(id, lvl);
  if (cost === null || save.scrap < cost || lvl >= UPGRADES[id].max) return false;
  save.scrap -= cost;
  save.upgrades[id] = lvl + 1;
  return true;
}

export function unlockWeapon(save: SaveData, id: WeaponId): boolean {
  if (save.weapons[id]) return false;
  const cost = WEAPONS[id].unlockCost;
  if (save.scrap < cost) return false;
  save.scrap -= cost;
  save.weapons[id] = true;
  return true;
}

export function totalStars(save: SaveData): number {
  return Object.values(save.missions).reduce((s, m) => s + m.stars, 0);
}
