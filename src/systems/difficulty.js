// Difficulty curve as pure functions of route progress (0 → 1).
import { LEVEL } from '../config.js';

export function scrollSpeed(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  return LEVEL.baseScroll + (LEVEL.maxScroll - LEVEL.baseScroll) * p;
}

// Seconds between zombie spawn "events" (an event may spawn a small group).
export function spawnInterval(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  return 1.05 - 0.48 * p; // 1.05s → 0.57s
}

// How many zombies spawn together.
export function groupSize(progress, rand = Math.random) {
  const max = 2 + Math.floor(progress * 3); // 1-2 → 1-5
  return 1 + Math.floor(rand() * max);
}

// Weighted pick of zombie type; runners and brutes phase in over the route.
export function pickZombieType(progress, rand = Math.random) {
  const p = Math.min(Math.max(progress, 0), 1);
  const weights = {
    walker: 1,
    runner: p < 0.12 ? 0 : 0.15 + p * 0.55,
    brute: p < 0.35 ? 0 : (p - 0.35) * 0.35,
  };
  const total = weights.walker + weights.runner + weights.brute;
  let roll = rand() * total;
  for (const key of ['walker', 'runner', 'brute']) {
    roll -= weights[key];
    if (roll <= 0) return key;
  }
  return 'walker';
}

// Seconds between obstacle rows.
export function obstacleInterval(progress) {
  const p = Math.min(Math.max(progress, 0), 1);
  return 3.4 - 1.6 * p;
}

export function maxAliveZombies(progress) {
  return Math.round(12 + progress * 22);
}
