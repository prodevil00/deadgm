import * as Phaser from 'phaser';
import { ROAD, SQUAD } from '../config.js';
import { clamp } from '../systems/collision.js';

// Hexagonal-ish packing: centre, then rings of 6, 12, 18 ...
export function formationOffsets(n, spacing = SQUAD.spacing) {
  const out = [{ x: 0, y: 0 }];
  let ring = 1;
  while (out.length < n) {
    const count = ring * 6;
    for (let i = 0; i < count && out.length < n; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      out.push({ x: Math.cos(a) * ring * spacing, y: Math.sin(a) * ring * spacing * 0.8 });
    }
    ring++;
  }
  return out;
}

export function formationRadius(n, spacing = SQUAD.spacing) {
  let ring = 0, total = 1;
  while (total < n) { ring++; total += ring * 6; }
  return ring * spacing + 12;
}

// The player's squad of shooters. The leader position (x) is steered; soldiers follow in formation.
export class Squad {
  constructor(scene, x, count) {
    this.scene = scene;
    this.x = x;
    this.vx = 0;
    this.y = SQUAD.y;
    this.soldiers = [];
    this.anim = 0;
    this.ring = scene.add.ellipse(x, this.y + 6, 60, 30, 0x5fb3ff, 0.18).setStrokeStyle(2, 0x5fb3ff, 0.5).setDepth(9);
    this.countText = scene.add.text(x, this.y + 40, '', {
      fontFamily: '"Black Ops One", Impact, sans-serif', fontSize: '26px', color: '#ffffff', stroke: '#1b3b6b', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(20);
    this.setCount(count);
  }

  get count() { return this.soldiers.length; }
  get radius() { return formationRadius(this.count); }

  setCount(n) {
    n = clamp(Math.round(n), 0, SQUAD.max);
    while (this.soldiers.length < n) {
      const s = this.scene.add.image(this.x, this.y + 30, 'soldier_0').setDepth(10);
      s.ox = 0; s.oy = 0; s.phase = Math.random() * 2;
      this.soldiers.push(s);
    }
    while (this.soldiers.length > n) {
      const s = this.soldiers.pop();
      this.scene.events.emit('soldier-died', s.x, s.y);
      s.destroy();
    }
    const offs = formationOffsets(n);
    this.soldiers.forEach((s, i) => { s.ox = offs[i].x; s.oy = offs[i].y; });
    this.countText.setText(String(n));
    const r = formationRadius(n);
    this.ring.setSize(r * 2 + 10, r * 1.6 + 10);
  }

  steer(dt, axis, targetX) {
    const r = this.radius - 8;
    if (targetX !== null && targetX !== undefined) {
      this.vx = clamp((targetX - this.x) * 12, -900, 900);
    } else if (axis !== 0) {
      this.vx = clamp(this.vx + axis * 3000 * dt, -460, 460);
    } else {
      this.vx -= this.vx * Math.min(1, 10 * dt);
    }
    this.x = clamp(this.x + this.vx * dt, ROAD.left + r, ROAD.right - r);
  }

  update(dt) {
    this.anim += dt * 9;
    const f = Math.floor(this.anim) % 2;
    for (const s of this.soldiers) {
      const tx = this.x + s.ox, ty = this.y + s.oy;
      s.x += (tx - s.x) * Math.min(1, dt * 14);
      s.y += (ty - s.y) * Math.min(1, dt * 14);
      if (s.frameIdx !== f) { s.frameIdx = f; s.setTexture(`soldier_${(f + (s.phase > 1 ? 1 : 0)) % 2}`); }
      s.setDepth(10 + s.y * 0.001);
    }
    this.ring.setPosition(this.x, this.y + 8);
    this.countText.setPosition(this.x, this.y + this.radius * 0.8 + 26);
  }
}
