import * as Phaser from 'phaser';
import { ROAD } from '../config.js';

const HALF = ROAD.width / 2;
export const LEFT = ROAD.left + HALF / 2;
export const RIGHT = ROAD.right - HALF / 2;

// Weapon barrels appear at fixed points so the arsenal grows through the run.
const WEAPON_AT = [
  { at: 0.07, index: 1, hp: 20 },
  { at: 0.28, index: 2, hp: 80 },
  { at: 0.52, index: 3, hp: 220 },
  { at: 0.78, index: 4, hp: 450 },
];

const PATTERN = ['gates', 'gates', 'horde', 'barrel', 'gates', 'horde', 'brute', 'gates', 'horde'];

// The route is a sequence of "beats" (gates, hordes, barrels, brutes) placed by distance.
// Everything spawns above the screen and scrolls in, so nothing appears on top of the squad.
export class Spawner {
  constructor(game) {
    this.g = game;
    this.next = 320;     // distance of the next beat
    this.beat = 0;
    this.weaponIdx = 0;
    this.trickle = 1.2;  // timer for single stragglers between beats
  }

  update(dt, progress) {
    const g = this.g;
    if (g.distance >= this.next) {
      this.spawnBeat(progress);
      this.next += Phaser.Math.Between(480, 600) - progress * 80;
    }
    this.trickle -= dt;
    if (this.trickle <= 0 && g.distance > 2400) {
      this.trickle = Phaser.Math.FloatBetween(1.4, 2.2) - progress * 0.7;
      const type = progress > 0.25 && Math.random() < 0.3 ? 'runner' : 'walker';
      g.spawnZombie(type, Phaser.Math.Between(ROAD.left + 20, ROAD.right - 20), -40, progress);
    }
  }

  spawnBeat(progress) {
    const g = this.g;
    const w = WEAPON_AT[this.weaponIdx];
    if (w && progress >= w.at) {
      this.weaponIdx++;
      const side = Math.random() < 0.5 ? LEFT : RIGHT;
      g.spawnBarrel(side, -90, w.hp, { type: 'weapon', index: w.index });
      this.horde(side === LEFT ? RIGHT : LEFT, 2 + Math.floor(progress * 12), progress, 160);
      return;
    }
    const kind = PATTERN[this.beat % PATTERN.length];
    this.beat++;
    if (kind === 'gates') this.gatePair(progress);
    else if (kind === 'horde') this.horde(Phaser.Math.Between(ROAD.left + 80, ROAD.right - 80), 3 + Math.floor(progress * 42), progress, 340);
    else if (kind === 'brute') {
      if (progress < 0.2) { this.horde(ROAD.center, 8, progress, 260); return; }
      g.spawnZombie('brute', Phaser.Math.Between(ROAD.left + 60, ROAD.right - 60), -70, progress);
      if (progress > 0.5) g.spawnZombie('brute', Phaser.Math.Between(ROAD.left + 60, ROAD.right - 60), -190, progress);
      if (progress > 0.8) g.spawnZombie('brute', ROAD.center, -300, progress);
      this.horde(ROAD.center, 5 + Math.floor(progress * 14), progress, 380);
    } else if (kind === 'barrel') {
      const side = Math.random() < 0.5 ? LEFT : RIGHT;
      const amount = 2 + Math.floor(progress * 8);
      g.spawnBarrel(side, -90, Math.round(20 + progress * 300), { type: 'recruits', amount });
      this.horde(side === LEFT ? RIGHT : LEFT, 4 + Math.floor(progress * 8), progress, 160);
    }
  }

  gatePair(progress) {
    const r = Math.random();
    let a, b;
    if (progress < 0.15) {
      a = ['add', Phaser.Math.Between(2, 4)];
      b = ['add', Phaser.Math.Between(1, 3)];
    } else if (r < 0.3 && progress > 0.4) {
      a = ['mul', 2];
      b = ['add', -Phaser.Math.Between(4, 8)];
    } else if (r < 0.7) {
      a = ['add', -Phaser.Math.Between(3, 6) - Math.floor(progress * 8)];
      b = ['add', Phaser.Math.Between(2, 4) + Math.floor(progress * 4)];
    } else {
      a = ['add', Phaser.Math.Between(3, 6)];
      b = ['add', -Phaser.Math.Between(2, 5)];
    }
    if (Math.random() < 0.5) [a, b] = [b, a];
    this.g.spawnGatePair(a, b);
  }

  horde(cx, n, progress, depth) {
    for (let i = 0; i < n; i++) {
      const type = progress > 0.3 && Math.random() < 0.18 ? 'runner' : 'walker';
      this.g.spawnZombie(type, cx + Phaser.Math.Between(-90, 90), -40 - Math.random() * depth, progress);
    }
  }
}
