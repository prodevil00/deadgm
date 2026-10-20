// LocalStorage persistence with safe fallbacks (private mode, quota, corrupt JSON).
import { STORAGE_KEY } from '../config.js';

export const DEFAULT_SAVE = Object.freeze({
  scrap: 0,
  best: 0,
  wins: 0,
  upgrades: { armor: 0, damage: 0, rate: 0 },
  settings: { sound: true, shake: true },
});

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function loadSave(store = storage()) {
  const base = clone(DEFAULT_SAVE);
  if (!store) return base;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return {
      scrap: Number.isFinite(data.scrap) ? Math.max(0, data.scrap) : 0,
      best: Number.isFinite(data.best) ? data.best : 0,
      wins: Number.isFinite(data.wins) ? data.wins : 0,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
    };
  } catch {
    return base;
  }
}

export function writeSave(data, store = storage()) {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Single in-memory copy shared by all scenes.
let current = null;
export function getSave() {
  if (!current) current = loadSave();
  return current;
}
export function commit() {
  return writeSave(getSave());
}
export function resetProgress() {
  const settings = getSave().settings;
  current = clone(DEFAULT_SAVE);
  current.settings = settings;
  commit();
  return current;
}
