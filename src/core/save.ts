// Persistent progress in localStorage. Every field is validated on load, so corrupt,
// partial or outdated saves never crash the game — they fall back to safe defaults.

import { emptyUpgrades, UPGRADES, UPGRADE_IDS, type UpgradeLevels } from './upgrades';
import { WEAPON_IDS, type WeaponId } from './weapons';

export const SAVE_KEY = 'lastconvoy.save.v1';
export const SAVE_VERSION = 1;

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  master: number;   // 0..1
  music: number;
  sfx: number;
  muted: boolean;
  haptics: boolean;
  quality: Quality;
  shake: boolean;
}

export interface MissionProgress {
  cleared: boolean;
  stars: number;     // best 0..3
  best: number;      // best survivors
}

export interface SaveData {
  v: number;
  scrap: number;
  upgrades: UpgradeLevels;
  weapons: Record<WeaponId, boolean>;
  loadout: WeaponId;
  missions: Record<number, MissionProgress>;
  settings: Settings;
  stats: { runs: number; wins: number; kills: number; bossKills: number };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultSettings(): Settings {
  return { master: 0.8, music: 0.55, sfx: 0.85, muted: false, haptics: true, quality: 'auto', shake: true };
}

export function defaultSave(): SaveData {
  const weapons = {} as Record<WeaponId, boolean>;
  for (const id of WEAPON_IDS) weapons[id] = id === 'rifle';
  return {
    v: SAVE_VERSION,
    scrap: 0,
    upgrades: emptyUpgrades(),
    weapons,
    loadout: 'rifle',
    missions: {},
    settings: defaultSettings(),
    stats: { runs: 0, wins: 0, kills: 0, bossKills: 0 },
  };
}

const num = (v: unknown, def: number, min: number, max: number, int = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  const c = Math.min(max, Math.max(min, v));
  return int ? Math.floor(c) : c;
};
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Turns any parsed JSON into a valid SaveData. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  const r = obj(raw);
  d.scrap = num(r.scrap, 0, 0, 1e9, true);
  const up = obj(r.upgrades);
  for (const id of UPGRADE_IDS) d.upgrades[id] = num(up[id], 0, 0, UPGRADES[id].max, true);
  const w = obj(r.weapons);
  for (const id of WEAPON_IDS) d.weapons[id] = id === 'rifle' ? true : bool(w[id], false);
  d.loadout = typeof r.loadout === 'string' && (WEAPON_IDS as string[]).includes(r.loadout) && d.weapons[r.loadout as WeaponId]
    ? (r.loadout as WeaponId) : 'rifle';
  const ms = obj(r.missions);
  for (const [k, v] of Object.entries(ms)) {
    const id = Number(k);
    if (!Number.isInteger(id) || id < 1 || id > 99) continue;
    const m = obj(v);
    d.missions[id] = { cleared: bool(m.cleared, false), stars: num(m.stars, 0, 0, 3, true), best: num(m.best, 0, 0, 999, true) };
  }
  const s = obj(r.settings);
  const def = defaultSettings();
  d.settings = {
    master: num(s.master, def.master, 0, 1),
    music: num(s.music, def.music, 0, 1),
    sfx: num(s.sfx, def.sfx, 0, 1),
    muted: bool(s.muted, def.muted),
    haptics: bool(s.haptics, def.haptics),
    quality: (['auto', 'low', 'medium', 'high'] as const).includes(s.quality as Quality) ? (s.quality as Quality) : def.quality,
    shake: bool(s.shake, def.shake),
  };
  const st = obj(r.stats);
  d.stats = {
    runs: num(st.runs, 0, 0, 1e9, true), wins: num(st.wins, 0, 0, 1e9, true),
    kills: num(st.kills, 0, 0, 1e12, true), bossKills: num(st.bossKills, 0, 0, 1e9, true),
  };
  return d;
}

export function loadSave(store: KeyValueStore | null): SaveData {
  if (!store) return defaultSave();
  let text: string | null = null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (!text) return defaultSave();
  try {
    return sanitize(JSON.parse(text));
  } catch {
    // Keep the unreadable save for debugging, then start fresh.
    try { store.setItem(`${SAVE_KEY}.corrupt`, text); } catch { /* storage full */ }
    return defaultSave();
  }
}

export function writeSave(store: KeyValueStore | null, data: SaveData): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // private mode / quota exceeded: keep playing with in-memory progress
  }
}

export function resetProgress(store: KeyValueStore | null, keepSettings: Settings): SaveData {
  const d = defaultSave();
  d.settings = { ...keepSettings };
  writeSave(store, d);
  return d;
}

export function browserStore(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__lc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
