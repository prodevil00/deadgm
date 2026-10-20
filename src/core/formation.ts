// Squad formation: distributes n soldiers over rows/columns behind the leader point.
// Offsets are relative to (leaderX, frontZ); z offsets are <= 0 (rows trail behind).

import { ROAD_HALF, SOLDIER_RADIUS, SOLDIER_SPACING } from './constants';

export interface Slot { x: number; z: number }

const cache = new Map<number, Slot[]>();
export const MAX_COLUMNS = Math.floor((ROAD_HALF * 2 * 0.86) / SOLDIER_SPACING); // 11

export function columnsFor(n: number): number {
  if (n <= 1) return 1;
  return Math.max(1, Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(n * 1.5))));
}

export function formationSlots(n: number): Slot[] {
  const hit = cache.get(n);
  if (hit) return hit;
  const slots: Slot[] = [];
  const cols = columnsFor(n);
  const rows = Math.ceil(n / cols);
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    const stagger = r % 2 === 1 && inRow === cols ? SOLDIER_SPACING * 0.22 : 0;
    for (let c = 0; c < inRow; c++) {
      slots.push({
        x: (c - (inRow - 1) / 2) * SOLDIER_SPACING + stagger,
        z: -r * SOLDIER_SPACING * 0.92,
      });
    }
  }
  cache.set(n, slots);
  return slots;
}

/** Half width of the formation (from leader to the outermost soldier's edge). */
export function formationHalfWidth(n: number): number {
  const cols = Math.min(columnsFor(n), Math.max(1, n));
  return ((cols - 1) / 2) * SOLDIER_SPACING + SOLDIER_SPACING * 0.22 + SOLDIER_RADIUS;
}

export function formationDepth(n: number): number {
  const rows = Math.ceil(Math.max(1, n) / columnsFor(n));
  return (rows - 1) * SOLDIER_SPACING * 0.92 + SOLDIER_RADIUS;
}

/**
 * Maximum |leaderX|. The leader may steer close to the guardrail; soldiers whose slot would be
 * off-road are clamped and the crowd squeezes against the rail, so wide squads can still pick
 * an outer gate or slip past an obstacle.
 */
export function leaderLimit(n: number): number {
  return ROAD_HALF - (n <= 1 ? 0.45 : 0.6);
}
