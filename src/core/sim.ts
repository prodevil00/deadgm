// The gameplay simulation. Deterministic, fixed-timestep, renderer-agnostic.
// The renderer and UI read its public state and consume `events` every frame.

import {
  BOSS_STAND_OFF, DESPAWN_BEHIND, LANE_X, MAX_BULLETS, MAX_ENEMIES, MAX_SHOOTERS, MAX_SQUAD,
  ROAD_HALF, SIM_DT, SOLDIER_RADIUS, SPAWN_AHEAD, STEER_MAX_SPEED, WEAPON_MAX_LEVEL,
} from './constants';
import { BOSSES, type BossAttack, type BossDef } from './bosses';
import { ELITE_SPIT, ENEMIES, HEAVY_SLAM, type EnemyDef, type EnemyType } from './enemies';
import { formationDepth, formationSlots, leaderLimit } from './formation';
import { applyGate, gateLabel, grownValue, isGoodGate } from './gates';
import type { DefeatReason, RunResult } from './progression';
import { Rng } from './rng';
import type { CrateReward, GateSpec, MissionDef, MissionEvent, Side } from './types';
import type { RunModifiers } from './upgrades';
import { WEAPONS, weaponStats, type WeaponId } from './weapons';

// ---------------------------------------------------------------- entities

export interface Soldier {
  id: number;
  x: number; z: number;
  hp: number; maxHp: number;
  fireCd: number; mag: number; reloadT: number;
  recoil: number;          // 1 → 0 after a shot (render)
  aimYaw: number;          // aim direction (render)
  walk: number;            // walk-cycle phase
  spawnT: number;          // >0 while running in as a new recruit (render glow)
  hitT: number;            // >0 shortly after taking damage
}

export interface Fallen { x: number; z: number; yaw: number; t: number; kind: 'soldier' }

export type EnemyState = 'idle' | 'chase' | 'engaged' | 'dying';

export interface Enemy {
  id: number;
  type: EnemyType;
  def: EnemyDef;
  x: number; z: number;
  vx: number; vz: number;
  hp: number; maxHp: number;
  state: EnemyState;
  walk: number;
  yaw: number;
  hitT: number;
  dieT: number;
  attackCd: number;
  windT: number;          // >0 while winding up an attack (heavy slam / elite spit)
  variant: number;        // cosmetic 0..1
  fromBoss: boolean;
}

interface Bullet {
  active: boolean;
  x: number; z: number; px: number; pz: number;
  vx: number; vz: number;
  life: number;
  dmg: number;
  splashR: number; splashDmg: number;
  pierce: number;
  crateHits: number;
  weapon: WeaponId;
  hit0: number; hit1: number; hit2: number; hit3: number; hit4: number;
}

export interface Gate {
  id: number;
  group: number;
  z: number;
  side: Side;
  xMin: number; xMax: number;
  spec: GateSpec;          // current spec (value changes on growing gates)
  baseValue: number;
  hits: number;
  used: boolean;
  chosen: boolean;
  flash: number;           // render: bullet-hit flash
}

export interface Crate {
  id: number; x: number; z: number;
  hits: number; maxHits: number;
  reward: CrateReward;
  state: 'closed' | 'open' | 'smashed';
  t: number;               // time since state change
  flash: number;
}

export interface Wall { id: number; x: number; z: number; w: number; d: number; kind: 'barrier' | 'wreck' | 'truck' | 'container'; blocks: boolean }
export interface Hazard { id: number; x: number; z: number; w: number; d: number; kind: 'fire' | 'acid' }
export interface Survivors { id: number; x: number; z: number; n: number; taken: boolean }
export interface Barrel { id: number; x: number; z: number; hp: number; exploded: boolean }

export type TelegraphSource = 'slam' | 'spit' | 'throw' | 'charge' | 'stomp' | 'heavy' | 'elite' | 'airstrike';

export interface Telegraph {
  id: number;
  kind: 'circle' | 'strip';
  source: TelegraphSource;
  x: number;
  dz: number;              // z offset relative to the squad front (follows the squad)
  r: number;               // circle radius / strip half width
  len: number;             // strip length (extends forward from dz)
  t: number; dur: number;
  damage: number;
  friendly: boolean;       // airstrike marker (hurts enemies, not soldiers)
  ownerId: number;         // enemy id (heavy/elite), -1 boss, -2 player
}

export type BossAnim = 'idle' | 'walk' | 'roar' | 'slam' | 'throw' | 'spit' | 'charge' | 'stomp' | 'dying';

export interface Boss {
  def: BossDef;
  x: number; z: number;
  hp: number; maxHp: number;
  phase: number;
  active: boolean;          // fight started
  anim: BossAnim;
  animT: number;            // time in current anim
  animDur: number;
  walk: number;
  hitT: number;
  cds: number[];
  pending: { attack: BossAttack; t: number } | null;
  staggerT: number;
  nextStagger: number;
  stompCd: number;
  dead: boolean;
  dieT: number;
  chargeTo: number;         // target x lane of a charge dash
  retreatTo: number;        // after a charge the boss backs off to where it started
}

export type SimPhase = 'run' | 'boss' | 'won' | 'lost';

export type SimEvent =
  | { t: 'fire'; weapon: WeaponId; n: number; x: number; z: number }
  | { t: 'hit'; x: number; y: number; z: number; dmg: number; target: 'enemy' | 'boss' | 'crate' | 'gate' | 'barrel' | 'wall'; big: boolean }
  | { t: 'kill'; x: number; z: number; enemy: EnemyType; scrap: number; consumed: boolean }
  | { t: 'soldierDown'; x: number; z: number; cause: 'melee' | 'crush' | 'blast' | 'hazard' | 'gate' }
  | { t: 'recruit'; n: number; x: number; z: number; source: 'gate' | 'crate' | 'survivors' }
  | { t: 'gate'; id: number; group: number; label: string; good: boolean; x: number; z: number; kind: GateSpec['kind']; before: number; after: number }
  | { t: 'gateGrow'; id: number; value: number }
  | { t: 'crateOpen'; id: number; x: number; z: number; reward: CrateReward; label: string }
  | { t: 'crateSmash'; id: number; x: number; z: number }
  | { t: 'explosion'; x: number; z: number; r: number; kind: 'rocket' | 'barrel' | 'airstrike' | 'slam' | 'acid' | 'throw' | 'charge' }
  | { t: 'weapon'; weapon: WeaponId; level: number }
  | { t: 'shield'; seconds: number }
  | { t: 'boost'; seconds: number }
  | { t: 'telegraph'; source: TelegraphSource }
  | { t: 'bossSpawn' }
  | { t: 'bossStart' }
  | { t: 'bossPhase'; phase: number; caption: string }
  | { t: 'bossAttack'; kind: BossAttack['kind'] | 'stomp' }
  | { t: 'bossDead'; x: number; z: number }
  | { t: 'zombieGroan'; x: number; z: number; type: EnemyType }
  | { t: 'caption'; text: string; tone: 'gold' | 'red' | 'blue' | 'pink' | 'green' | 'purple' | 'white' }
  | { t: 'end'; won: boolean; reason: DefeatReason | null };

// ---------------------------------------------------------------- simulation

const LANE_W = 3.6;

export class Simulation {
  readonly mission: MissionDef;
  readonly mods: RunModifiers;
  readonly rng: Rng;

  phase: SimPhase = 'run';
  time = 0;
  endT = 0;                 // time since the run ended (outro)
  squadX = 0;
  squadZ = 0;
  steerX = 0;
  speed: number;

  soldiers: Soldier[] = [];
  fallen: Fallen[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  bulletCount = 0;
  gates: Gate[] = [];
  crates: Crate[] = [];
  walls: Wall[] = [];
  hazards: Hazard[] = [];
  survivors: Survivors[] = [];
  barrels: Barrel[] = [];
  telegraphs: Telegraph[] = [];
  boss: Boss | null = null;

  weapon: WeaponId;
  weaponLevel = 1;
  magMult = 1;
  rateBonus = 0;
  dmgBonus = 0;
  shieldT = 0;
  boostT = 0;
  airstrikes: number;

  kills = 0;
  killScrap = 0;
  bonusScrap = 0;
  peakSquad = 0;
  bossStartT = -1;
  result: RunResult | null = null;
  events: SimEvent[] = [];

  private nextId = 1;
  private pending: MissionEvent[];
  private gateGroups = new Map<number, Gate[]>();
  private buckets: Enemy[][] = [];
  private bucketBase = 0;
  private targets: Enemy[] = [];
  private groanCd = 0;
  private reason: DefeatReason | null = null;

  constructor(mission: MissionDef, mods: RunModifiers, seed = mission.seed) {
    this.mission = mission;
    this.mods = mods;
    this.rng = new Rng(seed);
    this.speed = mission.speed;
    this.weapon = mods.startWeapon;
    this.airstrikes = mods.airstrikes;
    for (let i = 0; i < MAX_BULLETS; i++) this.bullets.push(newBullet());

    // static mission objects are created up-front so the renderer can build them once
    this.pending = [];
    let group = 0;
    for (const ev of [...mission.events].sort((a, b) => a.z - b.z)) {
      switch (ev.type) {
        case 'gates': {
          group++;
          const list: Gate[] = [];
          for (const side of ['L', 'R', 'C'] as Side[]) {
            const spec = ev.gates[side];
            if (!spec) continue;
            const [xMin, xMax] = side === 'L' ? [-ROAD_HALF, 0] : side === 'R' ? [0, ROAD_HALF] : [-ROAD_HALF, ROAD_HALF];
            const g: Gate = { id: this.nextId++, group, z: ev.z, side, xMin, xMax, spec: { ...spec }, baseValue: spec.value, hits: 0, used: false, chosen: false, flash: 0 };
            list.push(g);
            this.gates.push(g);
          }
          this.gateGroups.set(group, list);
          break;
        }
        case 'crate':
          this.crates.push({ id: this.nextId++, x: ev.x, z: ev.z, hits: ev.hits, maxHits: ev.hits, reward: ev.reward, state: 'closed', t: 0, flash: 0 });
          break;
        case 'wall':
          this.walls.push({ id: this.nextId++, x: ev.x, z: ev.z, w: ev.w, d: ev.d, kind: ev.kind, blocks: ev.kind !== 'barrier' });
          break;
        case 'hazard':
          this.hazards.push({ id: this.nextId++, x: ev.x, z: ev.z, w: ev.w, d: ev.d, kind: ev.kind });
          break;
        case 'survivors':
          this.survivors.push({ id: this.nextId++, x: ev.x, z: ev.z, n: ev.n, taken: false });
          break;
        case 'barrel':
          this.barrels.push({ id: this.nextId++, x: ev.x, z: ev.z, hp: 25, exploded: false });
          break;
        default:
          this.pending.push(ev);
      }
    }
    this.addSoldiers(mods.startSquad, 0, -2, 'gate', false);
    this.peakSquad = this.soldiers.length;
  }

  // ------------------------------------------------------------ public API

  get count(): number { return this.soldiers.length; }
  get ended(): boolean { return this.phase === 'won' || this.phase === 'lost'; }
  get progress(): number { return Math.min(1, this.squadZ / this.mission.length); }
  get weaponDef() { return WEAPONS[this.weapon]; }

  setSteer(x: number): void {
    this.steerX = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, x));
  }

  /** Calls in an airstrike on the most valuable target ahead. Returns false if unavailable. */
  callAirstrike(): boolean {
    if (this.airstrikes <= 0 || this.ended) return false;
    let tx = this.squadX;
    let tdz = 22;
    if (this.boss && this.boss.active && !this.boss.dead) {
      tx = this.boss.x;
      tdz = this.boss.z - this.squadZ - this.boss.def.radius * 0.5;
    } else {
      let best = -1;
      for (const e of this.enemies) {
        if (e.state === 'dying') continue;
        const dz = e.z - this.squadZ;
        if (dz < 7 || dz > 42) continue;
        let score = e.type === 'heavy' || e.type === 'elite' ? 6 : 0;
        for (const o of this.enemies) {
          if (o.state !== 'dying' && Math.abs(o.x - e.x) < 3.5 && Math.abs(o.z - e.z) < 3.5) score++;
        }
        if (score > best) { best = score; tx = e.x; tdz = dz; }
      }
    }
    this.airstrikes--;
    this.telegraphs.push({
      id: this.nextId++, kind: 'circle', source: 'airstrike', x: tx, dz: tdz, r: 5, len: 0,
      t: 0, dur: 0.95, damage: 340, friendly: true, ownerId: -2,
    });
    this.emit({ t: 'telegraph', source: 'airstrike' });
    this.emit({ t: 'caption', text: 'AIRSTRIKE INBOUND', tone: 'gold' });
    return true;
  }

  /** Advances the simulation by exactly one fixed step. */
  step(dt = SIM_DT): void {
    this.time += dt;
    if (this.ended) {
      this.endT += dt;
      this.updateSoldierMotion(dt, true);
      this.updateDyingOnly(dt);
      this.updateFallen(dt);
      return;
    }
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.boostT = Math.max(0, this.boostT - dt);

    this.advance(dt);
    this.spawnPending();
    this.updateSoldierMotion(dt, false);
    this.rebuildBuckets();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateShooting(dt);
    this.updateBullets(dt);
    this.updateTelegraphs(dt);
    this.updateObjects(dt);
    this.updateFallen(dt);
    this.checkEnd();
  }

  // ------------------------------------------------------------ helpers

  private emit(e: SimEvent): void {
    if (this.events.length < 600) this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private addSoldiers(n: number, x: number, z: number, source: 'gate' | 'crate' | 'survivors', announce = true): number {
    const room = MAX_SQUAD - this.soldiers.length;
    const add = Math.max(0, Math.min(room, n));
    const hp = this.mods.soldierHp;
    const stats = weaponStats(this.weapon, this.weaponLevel, 1, 1, this.magMult);
    for (let i = 0; i < add; i++) {
      this.soldiers.push({
        id: this.nextId++,
        x: this.squeeze(x + this.rng.range(-0.8, 0.8), z), z: z + this.rng.range(-0.4, 0.4),
        hp, maxHp: hp,
        fireCd: this.rng.range(0, 0.4), mag: stats.mag, reloadT: 0,
        recoil: 0, aimYaw: 0, walk: this.rng.range(0, 6.28), spawnT: announce ? 0.9 : 0, hitT: 0,
      });
    }
    if (add > 0 && announce) this.emit({ t: 'recruit', n: add, x, z, source });
    this.peakSquad = Math.max(this.peakSquad, this.soldiers.length);
    return add;
  }

  private killSoldier(index: number, cause: 'melee' | 'crush' | 'blast' | 'hazard' | 'gate'): void {
    const s = this.soldiers[index];
    if (!s) return;
    this.soldiers.splice(index, 1);
    this.fallen.push({ x: s.x, z: s.z, yaw: this.rng.range(-0.6, 0.6), t: 0, kind: 'soldier' });
    if (this.fallen.length > 60) this.fallen.shift();
    this.emit({ t: 'soldierDown', x: s.x, z: s.z, cause });
  }

  /** Applies damage to soldier i. Returns true if it died. */
  private hurtSoldier(index: number, dmg: number, cause: 'melee' | 'crush' | 'blast' | 'hazard'): boolean {
    const s = this.soldiers[index];
    if (!s) return false;
    if (this.shieldT > 0 && cause !== 'crush') return false;
    s.hp -= dmg;
    s.hitT = 0.25;
    if (s.hp <= 0) {
      this.killSoldier(index, cause);
      return true;
    }
    return false;
  }

  private stats() {
    const dmg = this.mods.dmgMult * (1 + this.dmgBonus) * (this.boostT > 0 ? 1.5 : 1);
    const rate = this.mods.rateMult * (1 + this.rateBonus);
    return weaponStats(this.weapon, this.weaponLevel, dmg, rate, this.magMult);
  }

  // ------------------------------------------------------------ movement

  private advance(dt: number): void {
    const L = this.mission.length;
    if (this.phase === 'run') {
      let v = this.mission.speed;
      if (this.mission.boss) {
        const left = L - this.squadZ;
        if (left < 14) v *= Math.max(0.12, left / 14);
        if (!this.boss && left < 70) this.spawnBoss();
      }
      this.speed = v;
      this.squadZ = Math.min(L, this.squadZ + v * dt);
      if (this.mission.boss && this.squadZ >= L - 0.05) {
        this.squadZ = L;
        this.phase = 'boss';
        this.speed = 0;
        this.bossStartT = this.time;
        if (this.boss) {
          this.boss.active = true;
          this.setBossAnim('roar', 1.3);
          this.emit({ t: 'bossStart' });
          this.emit({ t: 'caption', text: this.boss.def.phases[0].caption, tone: 'red' });
        }
      }
    } else {
      this.speed = 0;
    }
    // leader steering: critically damped approach, capped speed, formation kept on the road
    const lim = leaderLimit(this.soldiers.length);
    const target = Math.max(-lim, Math.min(lim, this.steerX));
    const dx = target - this.squadX;
    const stepMax = STEER_MAX_SPEED * dt;
    this.squadX += Math.max(-stepMax, Math.min(stepMax, dx * Math.min(1, dt * 14)));
  }

  private updateSoldierMotion(dt: number, outro: boolean): void {
    const n = this.soldiers.length;
    const slots = formationSlots(Math.max(1, n));
    const walkRate = outro ? 7 : this.speed > 0.5 ? 9 : 3.5;
    for (let i = 0; i < n; i++) {
      const s = this.soldiers[i];
      const slot = slots[i];
      let tx = this.squadX + slot.x;
      if (!outro) tx = this.squeeze(tx, s.z);
      const tz = (outro && this.phase === 'won' && !this.mission.boss ? this.squadZ + this.endT * 5 : this.squadZ) + slot.z;
      const kx = Math.min(1, dt * (s.spawnT > 0 ? 5 : 12));
      const kz = Math.min(1, dt * (s.spawnT > 0 ? 4 : 8));
      s.x += (tx - s.x) * kx;
      s.z += (tz - s.z) * kz;
      s.x = Math.max(-ROAD_HALF + 0.2, Math.min(ROAD_HALF - 0.2, s.x));
      s.walk += dt * walkRate;
      s.recoil = Math.max(0, s.recoil - dt * 9);
      s.spawnT = Math.max(0, s.spawnT - dt);
      s.hitT = Math.max(0, s.hitT - dt);
    }
  }

  /**
   * Narrow passages: soldiers squeeze around walls and fire on the side their leader is on.
   * Only when the leader steers *into* an obstacle does the formation get hurt.
   */
  private squeeze(tx: number, z: number): number {
    const lead = this.squadX;
    const check = (cx: number, w: number, z0: number, z1: number) => {
      if (z1 < z - 0.6 || z0 > z + 6) return;
      const minX = cx - w / 2 - SOLDIER_RADIUS - 0.1, maxX = cx + w / 2 + SOLDIER_RADIUS + 0.1;
      if (tx <= minX || tx >= maxX) return;
      if (lead <= cx - w / 2) tx = minX;
      else if (lead >= cx + w / 2) tx = maxX;
    };
    for (const w of this.walls) check(w.x, w.w, w.z - w.d / 2, w.z + w.d / 2);
    for (const h of this.hazards) check(h.x, h.w, h.z - h.d / 2, h.z + h.d / 2);
    return Math.max(-ROAD_HALF + 0.2, Math.min(ROAD_HALF - 0.2, tx));
  }

  // ------------------------------------------------------------ spawning

  private spawnPending(): void {
    while (this.pending.length && this.pending[0].z - this.squadZ < SPAWN_AHEAD) {
      const ev = this.pending[0];
      const alive = this.enemies.length;
      if (ev.type === 'horde') {
        if (alive + Math.min(ev.count, 8) > MAX_ENEMIES) return; // wait for room
        const n = Math.min(ev.count, MAX_ENEMIES - alive);
        const cx = ev.x ?? 0;
        const spread = ev.spread ?? ROAD_HALF * 0.85;
        const depth = ev.depth ?? 4 + ev.count * 0.35;
        const mix = Object.entries(ev.mix) as [EnemyType, number][];
        const total = mix.reduce((s, [, w]) => s + w, 0);
        for (let i = 0; i < n; i++) {
          let r = this.rng.next() * total;
          let type: EnemyType = mix[0][0];
          for (const [t, w] of mix) { if ((r -= w) <= 0) { type = t; break; } }
          const x = Math.max(-ROAD_HALF + 0.4, Math.min(ROAD_HALF - 0.4, cx + this.rng.range(-spread, spread)));
          this.spawnEnemy(type, x, ev.z + this.rng.range(0, depth), false);
        }
      } else if (ev.type === 'enemy') {
        if (alive >= MAX_ENEMIES) return;
        this.spawnEnemy(ev.enemy, ev.x, ev.z, false);
      }
      this.pending.shift();
    }
  }

  private spawnEnemy(type: EnemyType, x: number, z: number, fromBoss: boolean, chase = false): Enemy | null {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    const def = ENEMIES[type];
    const hpMult = this.mission.enemyHp;
    const e: Enemy = {
      id: this.nextId++, type, def, x, z, vx: 0, vz: 0,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult,
      state: chase ? 'chase' : 'idle', walk: this.rng.range(0, 6.28), yaw: Math.PI + this.rng.range(-0.5, 0.5),
      hitT: 0, dieT: 0, attackCd: type === 'elite' ? ELITE_SPIT.cooldown * 0.6 : 0, windT: 0,
      variant: this.rng.next(), fromBoss,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------ enemies

  private rebuildBuckets(): void {
    // 1-D buckets along z (2 m) for fast bullet and contact queries
    this.bucketBase = Math.floor((this.squadZ - DESPAWN_BEHIND - 4) / 2);
    const count = Math.ceil((SPAWN_AHEAD + DESPAWN_BEHIND + 60) / 2);
    while (this.buckets.length < count) this.buckets.push([]);
    for (let i = 0; i < count; i++) this.buckets[i].length = 0;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const b = Math.floor(e.z / 2) - this.bucketBase;
      if (b >= 0 && b < count) this.buckets[b].push(e);
    }
  }

  private squadSpan(): { minX: number; maxX: number; backZ: number } {
    let minX = Infinity, maxX = -Infinity, backZ = Infinity;
    for (const s of this.soldiers) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.z < backZ) backZ = s.z;
    }
    if (!Number.isFinite(minX)) return { minX: this.squadX, maxX: this.squadX, backZ: this.squadZ };
    return { minX, maxX, backZ };
  }

  private updateEnemies(dt: number): void {
    const span = this.squadSpan();
    const front = this.squadZ;
    this.groanCd -= dt;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.hitT = Math.max(0, e.hitT - dt);
      if (e.state === 'dying') {
        e.dieT += dt;
        if (e.dieT > 1.6) this.enemies.splice(i, 1);
        continue;
      }
      if (e.z < this.squadZ - DESPAWN_BEHIND) { this.enemies.splice(i, 1); continue; }
      const def = e.def;
      const dz = e.z - front;
      if (e.state === 'idle') {
        e.walk += dt * 1.6;
        e.vx = Math.sin(this.time * 0.7 + e.id) * 0.25;
        e.vz = -0.35;
        if (dz < def.aggro) {
          e.state = 'chase';
          if (this.groanCd <= 0 && dz < 30) {
            this.groanCd = 0.7;
            this.emit({ t: 'zombieGroan', x: e.x, z: e.z, type: e.type });
          }
        }
      }
      if (e.state === 'chase') {
        if (e.type === 'elite') {
          // hold distance ahead of the squad and line up laterally
          const want = front + ELITE_SPIT.hold;
          e.vz = Math.max(-def.speed, Math.min(this.speed + def.speed, (want - e.z) * 1.2 + this.speed));
          const tx = Math.max(-ROAD_HALF + 0.5, Math.min(ROAD_HALF - 0.5, this.squadX * 0.6 + Math.sin(this.time * 0.5 + e.id) * 2));
          e.vx = Math.max(-def.speed, Math.min(def.speed, (tx - e.x) * 1.5));
          e.attackCd -= dt;
          if (e.attackCd <= 0 && dz < ELITE_SPIT.hold + 8 && this.soldiers.length) {
            e.attackCd = ELITE_SPIT.cooldown;
            e.windT = ELITE_SPIT.windup;
            const target = this.soldiers[Math.floor(this.rng.next() * this.soldiers.length)];
            this.telegraphs.push({
              id: this.nextId++, kind: 'circle', source: 'elite', x: target.x, dz: target.z - front, r: ELITE_SPIT.radius,
              len: 0, t: 0, dur: ELITE_SPIT.windup, damage: ELITE_SPIT.damage, friendly: false, ownerId: e.id,
            });
            this.emit({ t: 'telegraph', source: 'elite' });
          }
        } else {
          const tx = Math.max(span.minX, Math.min(span.maxX, e.x));
          const tz = front;
          const ddx = tx - e.x;
          const ddz = tz - e.z;
          const d = Math.hypot(ddx, ddz) || 1;
          const sp = def.speed * (e.hitT > 0 ? 0.55 : 1);
          e.vx = (ddx / d) * sp;
          e.vz = (ddz / d) * sp;
          // contact: the zombie reaches the formation
          if (e.z - def.radius <= front + 0.35 && e.z + def.radius >= span.backZ - 0.3) {
            const si = this.nearestSoldier(e.x, e.z, def.radius + SOLDIER_RADIUS + 0.12);
            if (si >= 0) {
              if (e.type === 'heavy') {
                e.state = 'engaged';
                e.attackCd = 0.25;
              } else {
                this.hurtSoldier(si, def.contactDamage, 'melee');
                this.killEnemy(e, true);
                continue;
              }
            }
          }
        }
        e.walk += dt * (e.type === 'runner' ? 13 : e.type === 'heavy' ? 4 : 6) * (Math.hypot(e.vx, e.vz) / def.speed + 0.3);
      }
      if (e.state === 'engaged') {
        // heavy mutant grapples the front of the squad and slams periodically
        e.vz = this.speed;
        e.vx = (Math.max(span.minX, Math.min(span.maxX, e.x)) - e.x) * 1.5;
        e.z = Math.max(e.z, front + def.radius * 0.6);
        e.walk += dt * 4;
        if (e.windT <= 0) {
          e.attackCd -= dt;
          if (e.attackCd <= 0) {
            e.windT = HEAVY_SLAM.windup;
            e.attackCd = HEAVY_SLAM.cooldown;
            this.telegraphs.push({
              id: this.nextId++, kind: 'circle', source: 'heavy', x: e.x, dz: Math.max(-1, e.z - front - def.radius - 0.4),
              r: HEAVY_SLAM.radius, len: 0, t: 0, dur: HEAVY_SLAM.windup, damage: HEAVY_SLAM.damage, friendly: false, ownerId: e.id,
            });
            this.emit({ t: 'telegraph', source: 'heavy' });
          }
        }
      }
      if (e.windT > 0) e.windT = Math.max(0, e.windT - dt);

      e.x += e.vx * dt;
      e.z += e.vz * dt;
      e.x = Math.max(-ROAD_HALF + 0.3, Math.min(ROAD_HALF - 0.3, e.x));
      // face direction of travel / squad
      const fx = e.state === 'idle' ? e.vx : this.squadX - e.x;
      const fz = e.state === 'idle' ? e.vz : front - e.z;
      const yaw = Math.atan2(fx, fz);
      e.yaw += angleDelta(e.yaw, yaw) * Math.min(1, dt * 6);
      // hazards hurt zombies too
      for (const h of this.hazards) {
        if (Math.abs(e.x - h.x) < h.w / 2 && Math.abs(e.z - h.z) < h.d / 2) this.damageEnemy(e, (h.kind === 'fire' ? 45 : 60) * dt, false, false);
      }
      // push out of walls
      for (const w of this.walls) {
        const hw = w.w / 2 + def.radius, hd = w.d / 2 + def.radius;
        if (Math.abs(e.x - w.x) < hw && Math.abs(e.z - w.z) < hd) {
          const px = e.x < w.x ? w.x - hw : w.x + hw;
          if (Math.abs(px) < ROAD_HALF) e.x = px; else e.z = w.z + hd;
        }
      }
    }
    this.separate();
  }

  private separate(): void {
    // light separation so crowds read as crowds instead of a single blob
    const count = this.buckets.length;
    for (let b = 0; b < count; b++) {
      const list = this.buckets[b];
      const next = b + 1 < count ? this.buckets[b + 1] : null;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) this.push(a, list[j]);
        if (next) for (const o of next) this.push(a, o);
      }
    }
  }

  private push(a: Enemy, b: Enemy): void {
    const min = (a.def.radius + b.def.radius) * 0.9;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) return;
    const d = Math.sqrt(d2);
    const k = ((min - d) / d) * 0.5;
    const wa = b.def.radius / (a.def.radius + b.def.radius);
    a.x -= dx * k * wa * 2; a.z -= dz * k * wa * 2;
    b.x += dx * k * (1 - wa) * 2; b.z += dz * k * (1 - wa) * 2;
  }

  private nearestSoldier(x: number, z: number, maxDist: number): number {
    let best = -1, bd = maxDist * maxDist;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      const dx = s.x - x, dz = s.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  }

  private damageEnemy(e: Enemy, raw: number, report: boolean, big: boolean): void {
    if (e.state === 'dying') return;
    const dmg = raw * e.def.damageTaken;
    e.hp -= dmg;
    if (report) {
      e.hitT = 0.12;
      if (e.state === 'idle') e.state = 'chase';
      this.emit({ t: 'hit', x: e.x, y: 1.2 * e.def.scale, z: e.z, dmg, target: 'enemy', big });
    }
    if (e.hp <= 0) this.killEnemy(e, false);
  }

  private killEnemy(e: Enemy, consumed: boolean): void {
    if (e.state === 'dying') return;
    e.state = 'dying';
    e.dieT = 0;
    e.hp = 0;
    e.windT = 0;
    // cancel this enemy's pending attacks
    this.telegraphs = this.telegraphs.filter((t) => t.ownerId !== e.id);
    const scrap = consumed ? 0 : e.def.scrap;
    if (!consumed) {
      this.kills++;
      this.killScrap += scrap;
    }
    this.emit({ t: 'kill', x: e.x, z: e.z, enemy: e.type, scrap, consumed });
  }

  private updateDyingOnly(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.state === 'dying') {
        e.dieT += dt;
        if (e.dieT > 1.6) this.enemies.splice(i, 1);
      } else {
        e.walk += dt * 1.2; // idle sway after the run ends; no more attacks
      }
    }
    if (this.boss?.dead) this.boss.dieT += dt;
  }

  // ------------------------------------------------------------ boss

  private spawnBoss(): void {
    const id = this.mission.boss;
    if (!id) return;
    const def = BOSSES[id];
    const hp = def.hp * (this.mission.bossHp ?? 1);
    this.boss = {
      def, x: 0, z: this.mission.length + BOSS_STAND_OFF, hp, maxHp: hp, phase: 0, active: false,
      anim: 'idle', animT: 0, animDur: 0, walk: 0, hitT: 0,
      cds: def.phases[0].attacks.map((a) => a.cooldown * 0.45),
      pending: null, staggerT: 0, nextStagger: 0.9, stompCd: 0.8, dead: false, dieT: 0, chargeTo: 0, retreatTo: 0,
    };
    this.emit({ t: 'bossSpawn' });
    this.emit({ t: 'caption', text: `BOSS: ${def.name}`, tone: 'red' });
  }

  private setBossAnim(anim: BossAnim, dur: number): void {
    if (!this.boss) return;
    this.boss.anim = anim;
    this.boss.animT = 0;
    this.boss.animDur = dur;
  }

  private densestLane(): number {
    const counts = [0, 0, 0];
    for (const s of this.soldiers) {
      const lane = s.x < -LANE_W / 2 ? 0 : s.x > LANE_W / 2 ? 2 : 1;
      counts[lane]++;
    }
    let best = 1;
    for (let i = 0; i < 3; i++) if (counts[i] > counts[best]) best = i;
    return best;
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.hitT = Math.max(0, b.hitT - dt);
    b.animT += dt;
    if (b.dead) { b.dieT += dt; return; }
    if (!b.active) {
      // waiting at the far end of the arena
      if (b.animT > b.animDur && b.anim !== 'idle') this.setBossAnim('idle', 0);
      b.walk += dt * 1.2;
      return;
    }
    const phase = b.def.phases[b.phase];
    const front = this.squadZ;
    const contactZ = front + 1.1 + b.def.radius;

    // phase transitions
    const frac = b.hp / b.maxHp;
    if (frac <= phase.above && b.phase < b.def.phases.length - 1) {
      b.phase++;
      const np = b.def.phases[b.phase];
      b.cds = np.attacks.map((a) => a.cooldown * 0.5);
      b.pending = null;
      this.telegraphs = this.telegraphs.filter((t) => t.ownerId !== -1);
      this.setBossAnim('roar', 1.2);
      b.staggerT = 1.2;
      this.emit({ t: 'bossPhase', phase: b.phase, caption: np.caption });
      this.emit({ t: 'caption', text: np.caption, tone: 'red' });
      return;
    }

    if (b.staggerT > 0) {
      b.staggerT -= dt;
    } else if (b.anim === 'charge' && b.animT < b.animDur) {
      // dashing forward along the telegraphed lane
      b.z = Math.max(contactZ, b.z - 16 * dt);
      b.walk += dt * 6;
    } else if (b.retreatTo > b.z + 0.05) {
      // backing off after a charge (charges do not permanently close the distance)
      b.z = Math.min(b.retreatTo, b.z + 7 * dt);
      b.walk -= dt * 4;
      if (b.anim !== 'walk') this.setBossAnim('walk', 0);
    } else if (b.z > contactZ) {
      b.z = Math.max(contactZ, b.z - phase.speed * dt);
      b.retreatTo = b.z;
      b.walk += dt * (1.4 + phase.speed);
      const lim = ROAD_HALF - b.def.radius * 0.5;
      const tx = Math.max(-lim, Math.min(lim, this.squadX * 0.7));
      b.x += Math.max(-0.7 * dt, Math.min(0.7 * dt, tx - b.x));
      if (b.anim !== 'walk' && b.animT >= b.animDur) this.setBossAnim('walk', 0);
    } else {
      // reached the squad: it follows the formation sideways and stomps
      const lim = ROAD_HALF - b.def.radius * 0.5;
      const tx = Math.max(-lim, Math.min(lim, this.squadX));
      b.x += Math.max(-2.6 * dt, Math.min(2.6 * dt, tx - b.x));
      b.stompCd -= dt;
      if (b.stompCd <= 0) {
        b.stompCd = 1.15;
        this.setBossAnim('stomp', 0.6);
        this.telegraphs.push({
          id: this.nextId++, kind: 'circle', source: 'stomp', x: b.x, dz: -0.5, r: b.def.stompRadius,
          len: 0, t: 0, dur: 0.6, damage: 999, friendly: false, ownerId: -1,
        });
        this.emit({ t: 'bossAttack', kind: 'stomp' });
      }
    }

    // attacks
    if (b.pending) {
      b.pending.t -= dt;
      if (b.pending.t <= 0) {
        this.resolveBossAttack(b, b.pending.attack);
        b.pending = null;
      }
    } else if (b.staggerT <= 0) {
      for (let i = 0; i < phase.attacks.length; i++) {
        b.cds[i] -= dt;
        if (b.cds[i] <= 0) {
          b.cds[i] = phase.attacks[i].cooldown;
          this.startBossAttack(b, phase.attacks[i]);
          break;
        }
      }
    }
  }

  private startBossAttack(b: Boss, a: BossAttack): void {
    const front = this.squadZ;
    switch (a.kind) {
      case 'summon':
        this.setBossAnim('roar', a.windup);
        break;
      case 'slam': {
        const lane = this.densestLane();
        this.setBossAnim('slam', a.windup + 0.4);
        const z0 = -6;
        this.telegraphs.push({
          id: this.nextId++, kind: 'strip', source: 'slam', x: LANE_X[lane], dz: z0, r: LANE_W / 2,
          len: b.z - front - z0 - b.def.radius * 0.6, t: 0, dur: a.windup, damage: 999, friendly: false, ownerId: -1,
        });
        break;
      }
      case 'spit':
      case 'throw': {
        this.setBossAnim(a.kind, a.windup + 0.3);
        const n = a.count ?? 2;
        for (let i = 0; i < n && this.soldiers.length; i++) {
          const s = this.soldiers[Math.floor(this.rng.next() * this.soldiers.length)];
          const x = Math.max(-ROAD_HALF + 1, Math.min(ROAD_HALF - 1, s.x + this.rng.range(-0.6, 0.6)));
          this.telegraphs.push({
            id: this.nextId++, kind: 'circle', source: a.kind, x, dz: s.z - front + this.rng.range(-0.5, 0.5), r: a.radius ?? 1.6,
            len: 0, t: 0, dur: a.windup + i * 0.18, damage: 999, friendly: false, ownerId: -1,
          });
        }
        break;
      }
      case 'charge': {
        const lane = this.densestLane();
        b.x = LANE_X[lane] * 0.6 + b.x * 0.4;
        this.setBossAnim('roar', a.windup);
        const z0 = -6;
        this.telegraphs.push({
          id: this.nextId++, kind: 'strip', source: 'charge', x: LANE_X[lane], dz: z0, r: LANE_W / 2,
          len: b.z - front - z0, t: 0, dur: a.windup, damage: 999, friendly: false, ownerId: -1,
        });
        b.chargeTo = LANE_X[lane];
        break;
      }
    }
    b.pending = { attack: a, t: a.windup };
    this.emit({ t: 'telegraph', source: a.kind === 'summon' ? 'slam' : a.kind });
  }

  private resolveBossAttack(b: Boss, a: BossAttack): void {
    this.emit({ t: 'bossAttack', kind: a.kind });
    if (a.kind === 'summon') {
      const n = a.count ?? 6;
      for (let i = 0; i < n; i++) {
        const x = Math.max(-ROAD_HALF + 0.5, Math.min(ROAD_HALF - 0.5, b.x + this.rng.range(-4.5, 4.5)));
        this.spawnEnemy(a.enemy ?? 'walker', x, b.z - b.def.radius - this.rng.range(0.5, 4), true, true);
      }
    } else if (a.kind === 'charge') {
      b.x = b.chargeTo;
      b.retreatTo = b.z;
      this.setBossAnim('charge', 0.7);
    }
  }

  private damageBoss(raw: number, x: number, z: number, big: boolean): void {
    const b = this.boss;
    if (!b || b.dead || !b.active) return;
    const dmg = raw * b.def.damageTaken;
    b.hp -= dmg;
    b.hitT = 0.1;
    this.emit({ t: 'hit', x, y: b.def.scale * 1.3, z, dmg, target: 'boss', big });
    if (b.hp / b.maxHp < b.nextStagger && b.hp > 0) {
      b.nextStagger -= 0.1;
      if (b.staggerT <= 0 && !b.pending) b.staggerT = 0.45;
    }
    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      b.dieT = 0;
      this.setBossAnim('dying', 3);
      this.telegraphs = this.telegraphs.filter((t) => t.friendly);
      this.kills++;
      this.killScrap += b.def.scrap;
      for (const e of this.enemies) if (e.state !== 'dying') this.killEnemy(e, false);
      this.emit({ t: 'bossDead', x: b.x, z: b.z });
      this.emit({ t: 'caption', text: `${b.def.name} DEFEATED`, tone: 'gold' });
    }
  }

  // ------------------------------------------------------------ combat

  private updateShooting(dt: number): void {
    const n = this.soldiers.length;
    if (!n) return;
    const st = this.stats();
    const def = WEAPONS[this.weapon];
    const front = this.squadZ;
    const range = def.range;

    // candidate targets, best first: near + dangerous enemies are preferred
    const targets = this.targets;
    targets.length = 0;
    let nearestDz = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const dz = e.z - front;
      if (dz < -2 || dz > range + 2) continue;
      targets.push(e);
      if (dz < nearestDz) nearestDz = dz;
    }
    targets.sort((a, b) => (a.z - front - a.def.threat) - (b.z - front - b.def.threat));
    const boss = this.boss && this.boss.active && !this.boss.dead ? this.boss : null;
    const bossDz = boss ? boss.z - front - boss.def.radius : Infinity;

    const shooters = Math.min(n, MAX_SHOOTERS);
    const stride = n / shooters;
    // Every soldier contributes damage; beyond 30 the back rows add less (crowded firing lines).
    const effective = n <= 30 ? n : 30 + (n - 30) * 0.45;
    const squadFactor = effective / shooters;
    let fired = 0;
    for (let k = 0; k < shooters; k++) {
      const s = this.soldiers[Math.floor(k * stride)];
      if (s.reloadT > 0) {
        s.reloadT -= dt;
        if (s.reloadT <= 0) s.mag = st.mag;
        continue;
      }
      s.fireCd -= dt;
      if (s.fireCd > 0) continue;

      // choose an aim direction
      let ax = 0, az = 1, has = false;
      const threatClose = nearestDz < 13;
      const aligned = !threatClose && this.alignedObject(s.x, front, range);
      if (!aligned) {
        if (targets.length) {
          const pickN = Math.min(targets.length, 6);
          let t = targets[(k + s.id) % pickN];
          let dx = t.x - s.x, dz = t.z - s.z;
          if (dx * dx + dz * dz > range * range) { t = targets[0]; dx = t.x - s.x; dz = t.z - s.z; }
          if (dx * dx + dz * dz <= range * range && dz > -1) {
            const tFlight = Math.sqrt(dx * dx + dz * dz) / def.speed;
            ax = t.x + t.vx * tFlight - s.x;
            az = t.z + t.vz * tFlight - s.z;
            has = true;
          }
        }
        if (!has && boss && bossDz < range) {
          ax = boss.x + ((k % 5) - 2) * 0.35 - s.x;
          az = boss.z - s.z;
          has = true;
        }
      } else {
        has = true;
      }
      if (!has) { s.fireCd = 0.05; continue; }
      const len = Math.hypot(ax, az) || 1;
      ax /= len; az /= len;
      if (az < 0.25) { az = 0.25; ax = Math.sign(ax) * Math.sqrt(1 - az * az); }
      s.aimYaw = Math.atan2(ax, az);
      for (let p = 0; p < def.pellets; p++) {
        const ang = this.rng.range(-def.spread, def.spread);
        const c = Math.cos(ang), sn = Math.sin(ang);
        const dx = ax * c + az * sn, dz = -ax * sn + az * c;
        this.fireBullet(s.x + dx * 0.55, s.z + dz * 0.55, dx * def.speed, dz * def.speed, range / def.speed,
          st.damage * squadFactor, def.splashRadius, st.splashDamage * squadFactor, def.pierce, def.crateHits);
      }
      fired++;
      s.recoil = 1;
      s.fireCd += (1 / st.rate) * this.rng.range(0.9, 1.1);
      if (s.fireCd < -0.2) s.fireCd = 0;
      s.mag--;
      if (s.mag <= 0) s.reloadT = st.reload;
    }
    if (fired) this.emit({ t: 'fire', weapon: this.weapon, n: fired, x: this.squadX, z: front });
  }

  private alignedObject(x: number, front: number, range: number): boolean {
    for (const c of this.crates) {
      if (c.state === 'closed' && Math.abs(c.x - x) < 0.95 && c.z > front && c.z - front < range) return true;
    }
    for (const b of this.barrels) {
      if (!b.exploded && Math.abs(b.x - x) < 0.6 && b.z > front + 4 && b.z - front < range) return true;
    }
    for (const g of this.gates) {
      if (!g.used && g.spec.grow && x > g.xMin && x < g.xMax && g.z > front + 2 && g.z - front < range) return true;
    }
    return false;
  }

  private fireBullet(x: number, z: number, vx: number, vz: number, life: number, dmg: number,
    splashR: number, splashDmg: number, pierce: number, crateHits: number): void {
    if (this.bulletCount >= MAX_BULLETS) {
      // pool exhausted: recycle the oldest-lived bullet slot (keeps memory bounded)
      let oldest = 0, ol = Infinity;
      for (let i = 0; i < this.bullets.length; i++) if (this.bullets[i].life < ol) { ol = this.bullets[i].life; oldest = i; }
      this.bullets[oldest].active = false;
      this.bulletCount--;
    }
    for (const b of this.bullets) {
      if (b.active) continue;
      b.active = true;
      b.x = b.px = x; b.z = b.pz = z; b.vx = vx; b.vz = vz; b.life = life;
      b.dmg = dmg; b.splashR = splashR; b.splashDmg = splashDmg; b.pierce = pierce; b.crateHits = crateHits;
      b.weapon = this.weapon;
      b.hit0 = b.hit1 = b.hit2 = b.hit3 = b.hit4 = -1;
      this.bulletCount++;
      return;
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.px = b.x; b.pz = b.z;
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.life -= dt;
      this.collideBullet(b);
      if (b.active && (b.life <= 0 || Math.abs(b.x) > ROAD_HALF + 3)) {
        if (b.splashR > 0) this.explode(b.x, b.z, b.splashR, b.splashDmg, 'rocket', false);
        this.killBullet(b);
      }
    }
  }

  private killBullet(b: Bullet): void {
    if (!b.active) return;
    b.active = false;
    this.bulletCount--;
  }

  private collideBullet(b: Bullet): void {
    const x0 = b.px, z0 = b.pz, dx = b.x - x0, dz = b.z - z0;
    const segLen2 = dx * dx + dz * dz || 1e-9;
    // gather the earliest hit along the segment
    let bestT = Infinity;
    let kind = 0; // 1 enemy 2 boss 3 crate 4 barrel 5 wall 6 gate
    let ref: Enemy | Crate | Barrel | Wall | Gate | null = null;

    const circleT = (cx: number, cz: number, r: number): number => {
      // smallest t in [0,1] where the segment enters the circle
      const fx = x0 - cx, fz = z0 - cz;
      const a = segLen2, bb = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
      if (c <= 0) return 0;
      const disc = bb * bb - 4 * a * c;
      if (disc < 0) return Infinity;
      const t = (-bb - Math.sqrt(disc)) / (2 * a);
      return t >= 0 && t <= 1 ? t : Infinity;
    };

    const zMin = Math.min(z0, b.z) - 2, zMax = Math.max(z0, b.z) + 2;
    const b0 = Math.max(0, Math.floor(zMin / 2) - this.bucketBase);
    const b1 = Math.min(this.buckets.length - 1, Math.floor(zMax / 2) - this.bucketBase);
    for (let bi = b0; bi <= b1; bi++) {
      for (const e of this.buckets[bi]) {
        if (e.state === 'dying') continue;
        if (e.id === b.hit0 || e.id === b.hit1 || e.id === b.hit2 || e.id === b.hit3 || e.id === b.hit4) continue;
        const t = circleT(e.x, e.z, e.def.radius + 0.08);
        if (t < bestT) { bestT = t; kind = 1; ref = e; }
      }
    }
    const boss = this.boss;
    if (boss && boss.active && !boss.dead) {
      const t = circleT(boss.x, boss.z, boss.def.radius);
      if (t < bestT) { bestT = t; kind = 2; ref = null; }
    }
    for (const c of this.crates) {
      if (c.state !== 'closed' || Math.abs(c.z - b.z) > 3) continue;
      const t = circleT(c.x, c.z, 0.85);
      if (t < bestT) { bestT = t; kind = 3; ref = c; }
    }
    for (const br of this.barrels) {
      if (br.exploded || Math.abs(br.z - b.z) > 3) continue;
      const t = circleT(br.x, br.z, 0.55);
      if (t < bestT) { bestT = t; kind = 4; ref = br; }
    }
    for (const w of this.walls) {
      if (!w.blocks || Math.abs(w.z - b.z) > w.d / 2 + 3) continue;
      const t = rectT(x0, z0, dx, dz, w.x - w.w / 2, w.x + w.w / 2, w.z - w.d / 2, w.z + w.d / 2);
      if (t < bestT) { bestT = t; kind = 5; ref = w; }
    }
    for (const g of this.gates) {
      if (g.used || !g.spec.grow) continue;
      if ((z0 - g.z) * (b.z - g.z) > 0 || dz === 0) continue;
      const t = (g.z - z0) / dz;
      const xAt = x0 + dx * t;
      if (xAt > g.xMin + 0.15 && xAt < g.xMax - 0.15 && t < bestT) { bestT = t; kind = 6; ref = g; }
    }
    if (kind === 0) return;

    const hx = x0 + dx * bestT, hz = z0 + dz * bestT;
    if (kind === 1) {
      const e = ref as Enemy;
      this.damageEnemy(e, b.dmg, true, b.dmg >= 40);
      e.z += 0.08; // knock back
      if (b.splashR > 0) { this.explode(hx, hz, b.splashR, b.splashDmg, 'rocket', false); this.killBullet(b); return; }
      if (b.pierce > 0) {
        b.pierce--;
        if (b.hit0 < 0) b.hit0 = e.id; else if (b.hit1 < 0) b.hit1 = e.id; else if (b.hit2 < 0) b.hit2 = e.id;
        else if (b.hit3 < 0) b.hit3 = e.id; else b.hit4 = e.id;
        return;
      }
      this.killBullet(b);
    } else if (kind === 2) {
      this.damageBoss(b.dmg, hx, hz, b.dmg >= 40);
      if (b.splashR > 0) this.explode(hx, hz, b.splashR, b.splashDmg, 'rocket', true);
      this.killBullet(b);
    } else if (kind === 3) {
      const c = ref as Crate;
      c.hits = Math.max(0, c.hits - b.crateHits);
      c.flash = 0.08;
      this.emit({ t: 'hit', x: hx, y: 0.9, z: hz, dmg: b.crateHits, target: 'crate', big: false });
      if (c.hits <= 0) this.openCrate(c);
      this.killBullet(b);
    } else if (kind === 4) {
      const br = ref as Barrel;
      br.hp -= b.dmg;
      this.emit({ t: 'hit', x: hx, y: 0.6, z: hz, dmg: b.dmg, target: 'barrel', big: false });
      if (br.hp <= 0) this.explodeBarrel(br);
      this.killBullet(b);
    } else if (kind === 5) {
      this.emit({ t: 'hit', x: hx, y: 0.9, z: hz, dmg: 0, target: 'wall', big: false });
      if (b.splashR > 0) this.explode(hx, hz, b.splashR, b.splashDmg, 'rocket', false);
      this.killBullet(b);
    } else if (kind === 6) {
      const g = ref as Gate;
      g.hits++;
      g.flash = 0.08;
      const v = grownValue(g.spec, g.baseValue, g.hits);
      if (v !== g.spec.value) {
        g.spec.value = v;
        this.emit({ t: 'gateGrow', id: g.id, value: v });
      }
      this.emit({ t: 'hit', x: hx, y: 1.6, z: hz, dmg: 0, target: 'gate', big: false });
      this.killBullet(b);
    }
  }

  private explode(x: number, z: number, r: number, dmg: number, kind: 'rocket' | 'barrel' | 'airstrike', skipBoss: boolean): void {
    this.emit({ t: 'explosion', x, z, r, kind });
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < r + e.def.radius) this.damageEnemy(e, dmg * (1 - 0.5 * Math.min(1, d / r)), true, true);
    }
    const boss = this.boss;
    if (!skipBoss && boss && boss.active && !boss.dead && Math.hypot(boss.x - x, boss.z - z) < r + boss.def.radius) {
      this.damageBoss(kind === 'airstrike' ? Math.max(dmg * 3, boss.maxHp * 0.05) : dmg, boss.x, boss.z - boss.def.radius, true);
    }
    for (const br of this.barrels) {
      if (!br.exploded && Math.hypot(br.x - x, br.z - z) < r) { br.hp = 0; }
    }
  }

  private explodeBarrel(br: Barrel): void {
    if (br.exploded) return;
    br.exploded = true;
    this.explode(br.x, br.z, 3.4, 160, 'barrel', false);
    // soldiers too close get caught in the blast
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      const s = this.soldiers[i];
      if (Math.hypot(s.x - br.x, s.z - br.z) < 2.3) this.hurtSoldier(i, 30, 'blast');
    }
    for (const o of this.barrels) if (!o.exploded && o.hp <= 0) this.explodeBarrel(o);
  }

  // ------------------------------------------------------------ telegraphs

  private updateTelegraphs(dt: number): void {
    const front = this.squadZ;
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      // heavy slams follow the mutant that is dragging along the squad
      if (t.source === 'heavy') {
        const owner = this.enemies.find((e) => e.id === t.ownerId);
        if (owner) { t.x = owner.x; t.dz = Math.max(-1, owner.z - front - owner.def.radius - 0.4); }
      }
      t.t += dt;
      if (t.t < t.dur) continue;
      this.telegraphs.splice(i, 1);
      const cz = front + t.dz;
      if (t.friendly) {
        this.explode(t.x, cz, t.r, t.damage, 'airstrike', false);
        continue;
      }
      if (t.kind === 'circle') {
        const kind = t.source === 'spit' || t.source === 'elite' ? 'acid' : t.source === 'throw' ? 'throw' : 'slam';
        this.emit({ t: 'explosion', x: t.x, z: cz, r: t.r, kind });
        for (let s = this.soldiers.length - 1; s >= 0; s--) {
          const so = this.soldiers[s];
          if (Math.hypot(so.x - t.x, so.z - cz) < t.r + SOLDIER_RADIUS * 0.5) this.hurtSoldier(s, t.damage, 'blast');
        }
      } else {
        this.emit({ t: 'explosion', x: t.x, z: cz + t.len * 0.25, r: t.r, kind: t.source === 'charge' ? 'charge' : 'slam' });
        for (let s = this.soldiers.length - 1; s >= 0; s--) {
          const so = this.soldiers[s];
          if (Math.abs(so.x - t.x) < t.r + SOLDIER_RADIUS * 0.3 && so.z > cz - 1 && so.z < cz + t.len) this.hurtSoldier(s, t.damage, 'blast');
        }
      }
    }
  }

  // ------------------------------------------------------------ static objects

  private updateObjects(dt: number): void {
    const front = this.squadZ;
    const depth = formationDepth(this.soldiers.length) + 0.5;
    // gates: the squad passes through the gate under its leader
    for (const g of this.gates) g.flash = Math.max(0, g.flash - dt);
    for (const [, list] of this.gateGroups) {
      const g0 = list[0];
      if (g0.used || g0.z > front) continue;
      const chosen = list.find((g) => this.squadX >= g.xMin - 0.001 && this.squadX <= g.xMax + 0.001) ?? null;
      for (const g of list) g.used = true;
      if (chosen) this.enterGate(chosen);
    }
    // crates
    for (const c of this.crates) {
      c.t += dt;
      c.flash = Math.max(0, c.flash - dt);
      if (c.state !== 'closed' || c.z > front + 1.2 || c.z < front - depth - 1) continue;
      let smashed = false;
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        if (Math.hypot(s.x - c.x, s.z - c.z) < 0.85 + SOLDIER_RADIUS) {
          smashed = true;
          this.hurtSoldier(i, 999, 'crush');
        }
      }
      if (smashed) {
        c.state = 'smashed';
        c.t = 0;
        this.emit({ t: 'crateSmash', id: c.id, x: c.x, z: c.z });
        this.emit({ t: 'caption', text: 'CRATE SMASHED — SHOOT IT OPEN!', tone: 'red' });
      }
    }
    // barrels explode when the squad runs into them
    for (const br of this.barrels) {
      if (br.exploded || br.z > front + 0.8 || br.z < front - depth) continue;
      if (this.soldiers.some((s) => Math.hypot(s.x - br.x, s.z - br.z) < 0.55 + SOLDIER_RADIUS)) this.explodeBarrel(br);
    }
    // survivors waiting on the road
    for (const p of this.survivors) {
      if (p.taken || p.z > front + 0.5 || p.z < front - depth - 1) continue;
      if (this.soldiers.some((s) => Math.abs(s.x - p.x) < 1.3 && Math.abs(s.z - p.z) < 1)) {
        p.taken = true;
        const n = this.addSoldiers(p.n, p.x, p.z, 'survivors');
        this.emit({ t: 'caption', text: `+${n} SURVIVORS JOINED`, tone: 'gold' });
      }
    }
    // walls crush soldiers that run into them
    for (const w of this.walls) {
      if (w.z - w.d / 2 > front + 0.5 || w.z + w.d / 2 < front - depth - 1) continue;
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        if (Math.abs(s.x - w.x) < w.w / 2 + SOLDIER_RADIUS * 0.4 && Math.abs(s.z - w.z) < w.d / 2 + SOLDIER_RADIUS * 0.4) {
          this.hurtSoldier(i, 999, 'crush');
        }
      }
    }
    // hazard zones
    for (const h of this.hazards) {
      if (h.z - h.d / 2 > front + 0.5 || h.z + h.d / 2 < front - depth - 1) continue;
      const dps = h.kind === 'fire' ? 14 : 22;
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        if (Math.abs(s.x - h.x) < h.w / 2 && Math.abs(s.z - h.z) < h.d / 2) this.hurtSoldier(i, dps * dt, 'hazard');
      }
    }
  }

  private enterGate(g: Gate): void {
    g.chosen = true;
    const before = this.soldiers.length;
    const out = applyGate(g.spec, { count: before, weaponLevel: this.weaponLevel, recruiterBonus: this.mods.recruiterBonus });
    const label = gateLabel(g.spec);
    const gx = (g.xMin + g.xMax) / 2;
    if (out.count > before) {
      this.addSoldiers(out.count - before, Math.max(g.xMin + 0.8, Math.min(g.xMax - 0.8, this.squadX)), g.z, 'gate');
    } else if (out.count < before) {
      for (let i = 0; i < before - out.count; i++) this.killSoldier(this.soldiers.length - 1, 'gate');
    }
    if (out.weaponLevel !== this.weaponLevel) {
      this.weaponLevel = out.weaponLevel;
      this.emit({ t: 'weapon', weapon: this.weapon, level: this.weaponLevel });
    }
    if (out.heal) {
      for (const s of this.soldiers) s.hp = s.maxHp;
      this.shieldT = Math.max(this.shieldT, out.shield);
      this.emit({ t: 'shield', seconds: out.shield });
    }
    this.rateBonus += out.rateBonus;
    this.dmgBonus += out.dmgBonus;
    this.emit({ t: 'gate', id: g.id, group: g.group, label, good: isGoodGate(g.spec), x: gx, z: g.z, kind: g.spec.kind, before, after: this.soldiers.length });
  }

  private openCrate(c: Crate): void {
    c.state = 'open';
    c.t = 0;
    const r = c.reward;
    let label = '';
    switch (r.kind) {
      case 'weapon': {
        const changed = r.weapon !== this.weapon;
        this.weapon = r.weapon;
        if (!changed) this.weaponLevel = Math.min(WEAPON_MAX_LEVEL, this.weaponLevel + 1);
        const mag = weaponStats(this.weapon, this.weaponLevel, 1, 1, this.magMult).mag;
        for (const s of this.soldiers) { s.mag = mag; s.reloadT = 0; }
        label = changed ? `${WEAPONS[r.weapon].short} UNLOCKED` : `${WEAPONS[r.weapon].short} LV ${this.weaponLevel}`;
        this.emit({ t: 'weapon', weapon: this.weapon, level: this.weaponLevel });
        break;
      }
      case 'upgrade':
        this.weaponLevel = Math.min(WEAPON_MAX_LEVEL, this.weaponLevel + r.levels);
        label = `WEAPON LV ${this.weaponLevel}`;
        this.emit({ t: 'weapon', weapon: this.weapon, level: this.weaponLevel });
        break;
      case 'recruit': {
        const n = this.addSoldiers(r.n, c.x, c.z, 'crate');
        label = `+${n} SOLDIERS`;
        break;
      }
      case 'ammo': {
        this.magMult = Math.min(2.5, this.magMult + 0.5);
        const mag = weaponStats(this.weapon, this.weaponLevel, 1, 1, this.magMult).mag;
        for (const s of this.soldiers) { s.mag = mag; s.reloadT = 0; }
        label = 'EXTENDED MAGS';
        break;
      }
      case 'boost':
        this.boostT = Math.max(this.boostT, r.seconds);
        label = `DAMAGE ×1.5 · ${r.seconds}s`;
        this.emit({ t: 'boost', seconds: r.seconds });
        break;
      case 'shield':
        this.shieldT = Math.max(this.shieldT, r.seconds);
        label = `SHIELD · ${r.seconds}s`;
        this.emit({ t: 'shield', seconds: r.seconds });
        break;
      case 'airstrike':
        this.airstrikes += r.n;
        label = `+${r.n} AIRSTRIKE`;
        break;
      case 'scrap':
        this.bonusScrap += r.n;
        label = `+${r.n} SCRAP`;
        break;
    }
    this.emit({ t: 'crateOpen', id: c.id, x: c.x, z: c.z, reward: r, label });
    this.emit({ t: 'caption', text: label, tone: r.kind === 'weapon' || r.kind === 'upgrade' ? 'pink' : 'gold' });
  }

  private updateFallen(dt: number): void {
    for (let i = this.fallen.length - 1; i >= 0; i--) {
      const f = this.fallen[i];
      f.t += dt;
      if (f.t > 2.2) this.fallen.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ end conditions

  private checkEnd(): void {
    if (this.soldiers.length === 0) {
      this.finish(false, this.phase === 'boss' ? 'boss' : 'wiped');
      return;
    }
    if (this.phase === 'boss' && this.boss?.dead && this.boss.dieT > 2.4) {
      this.finish(true, null);
      return;
    }
    if (this.phase === 'run' && !this.mission.boss && this.squadZ >= this.mission.length) {
      const obj = this.mission.objective;
      if (obj.type === 'survivors' && this.soldiers.length < obj.count) this.finish(false, 'survivors');
      else this.finish(true, null);
    }
  }

  private finish(won: boolean, reason: DefeatReason | null): void {
    if (this.ended) return; // victory / defeat can only trigger once
    this.phase = won ? 'won' : 'lost';
    this.reason = reason;
    this.endT = 0;
    this.telegraphs = [];
    for (const b of this.bullets) b.active = false;
    this.bulletCount = 0;
    this.result = {
      missionId: this.mission.id,
      won,
      reason,
      kills: this.kills,
      killScrap: this.killScrap,
      bonusScrap: this.bonusScrap,
      survivors: this.soldiers.length,
      peakSquad: this.peakSquad,
      time: this.time,
      bossKilled: !!this.boss?.dead,
    };
    this.emit({ t: 'end', won, reason });
  }

  /** Ends the run as a defeat (used by "quit to menu" so the result is still recorded). */
  abort(): void {
    this.finish(false, 'quit');
  }

  get defeatReason(): DefeatReason | null { return this.reason; }

  /** Bullet positions for the renderer (avoids exposing the pool type). */
  forEachBullet(fn: (x: number, z: number, vx: number, vz: number, weapon: WeaponId) => void): void {
    for (const b of this.bullets) if (b.active) fn(b.x, b.z, b.vx, b.vz, b.weapon);
  }
}

// ---------------------------------------------------------------- utils

function newBullet(): Bullet {
  return {
    active: false, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, life: 0, dmg: 0, splashR: 0, splashDmg: 0,
    pierce: 0, crateHits: 1, weapon: 'rifle', hit0: -1, hit1: -1, hit2: -1, hit3: -1, hit4: -1,
  };
}

export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Earliest t in [0,1] where segment (x0,z0)+(dx,dz)t enters the axis-aligned rectangle. */
function rectT(x0: number, z0: number, dx: number, dz: number, minX: number, maxX: number, minZ: number, maxZ: number): number {
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (clip(-dx, x0 - minX) && clip(dx, maxX - x0) && clip(-dz, z0 - minZ) && clip(dz, maxZ - z0)) return t0;
  return Infinity;
}
