// Mission configuration schema. Missions are pure data (see missions.ts) so new levels can
// be added without touching the simulation.

import type { BossId } from './bosses';
import type { EnemyType } from './enemies';
import type { WeaponId } from './weapons';

export type GateKind = 'add' | 'mul' | 'weapon' | 'heal' | 'rate' | 'dmg';
export type Side = 'L' | 'R' | 'C';

export interface GateSpec {
  kind: GateKind;
  value: number;      // add: signed soldiers; mul: factor; weapon: levels; heal: shield s; rate/dmg: % bonus
  grow?: number;      // if set, every `grow` bullet hits raise the value by one step
  max?: number;       // cap for growing gates
}

export type CrateReward =
  | { kind: 'weapon'; weapon: WeaponId }
  | { kind: 'upgrade'; levels: number }
  | { kind: 'recruit'; n: number }
  | { kind: 'ammo' }
  | { kind: 'boost'; seconds: number }
  | { kind: 'shield'; seconds: number }
  | { kind: 'airstrike'; n: number }
  | { kind: 'scrap'; n: number };

export type EnemyMix = Partial<Record<EnemyType, number>>;

export type MissionEvent =
  | { type: 'gates'; z: number; gates: Partial<Record<Side, GateSpec>> }
  | { type: 'horde'; z: number; count: number; mix: EnemyMix; x?: number; spread?: number; depth?: number }
  | { type: 'enemy'; z: number; enemy: EnemyType; x: number }
  | { type: 'crate'; z: number; x: number; hits: number; reward: CrateReward }
  | { type: 'wall'; z: number; x: number; w: number; d: number; kind: 'barrier' | 'wreck' | 'truck' | 'container' }
  | { type: 'hazard'; z: number; x: number; w: number; d: number; kind: 'fire' | 'acid' }
  | { type: 'survivors'; z: number; x: number; n: number }
  | { type: 'barrel'; z: number; x: number };

export type Objective =
  | { type: 'reach' }
  | { type: 'survivors'; count: number }
  | { type: 'boss' };

export type TimeOfDay = 'noon' | 'afternoon' | 'sunset' | 'dusk' | 'storm';

export interface MissionDef {
  id: number;
  title: string;
  tagline: string;
  intro: string;
  objective: Objective;
  difficulty: 1 | 2 | 3 | 4 | 5;
  length: number;              // distance to the finish / boss arena (m)
  speed: number;               // squad advance speed (m/s)
  enemyHp: number;             // health multiplier for regular enemies
  reward: number;              // scrap for a clear (halved on replays)
  stars: [number, number];     // survivors needed for 2 and 3 stars
  time: TimeOfDay;
  seed: number;
  boss?: BossId;
  bossHp?: number;             // multiplier on the boss' base hp
  introduces: string[];        // shown on the briefing screen
  events: MissionEvent[];
}
