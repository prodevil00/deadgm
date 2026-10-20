import * as Phaser from 'phaser';
import { FONT, WEAPONS } from '../config.js';

const COLORS = { pos: 0x3d8bff, neg: 0xe8412c, mul: 0xffb02e };

function fmt(op, value) {
  if (op === 'mul') return `×${value}`;
  return value >= 0 ? `+${value}` : `${value}`;
}

// A shootable gate. Shooting it raises its value; walking through applies it to the squad.
export class ValueGate {
  constructor(scene, x, y, w, op, value) {
    this.scene = scene;
    this.x = x; this.y = y; this.w = w; this.h = 70;
    this.op = op; this.value = value;
    this.hits = 0;
    this.used = false;
    this.partner = null;
    this.g = scene.add.graphics().setDepth(8);
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(w / 70, 1.1).setAlpha(0.3).setDepth(7);
    this.text = scene.add.text(x, y - 4, '', {
      fontFamily: FONT.display, fontSize: '40px', color: '#ffffff', stroke: '#0a1630', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(9);
    this.redraw();
  }

  get kind() { return this.op === 'mul' ? 'mul' : this.value >= 0 ? 'pos' : 'neg'; }

  redraw() {
    const c = COLORS[this.kind];
    const { g, w, h } = this;
    g.clear();
    g.fillStyle(c, this.used ? 0.08 : 0.32);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.lineStyle(3, 0xffffff, this.used ? 0.15 : 0.7);
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.fillStyle(0xdfe7f2, this.used ? 0.2 : 1);
    g.fillRect(-w / 2 - 5, -h / 2 - 8, 8, h + 16);
    g.fillRect(w / 2 - 3, -h / 2 - 8, 8, h + 16);
    g.setPosition(this.x, this.y);
    this.glow.setTint(c);
    this.text.setText(fmt(this.op, this.value)).setAlpha(this.used ? 0.25 : 1);
  }

  // A bullet hit: every few hits bump the value up (negative gates can be "repaired").
  // Damage accumulates; each step up costs more, so big squads can't pump gates endlessly.
  shot(dmg = 1) {
    if (this.used) return;
    if (this.op === 'mul' ? this.value >= 4 : this.value >= 20) return;
    this.hits += dmg;
    const need = this.op === 'mul' ? 600 * this.value : 12 + Math.pow(Math.max(0, this.value), 1.5) * 8;
    if (this.hits >= need) {
      this.hits = 0;
      this.value += 1;
      this.redraw();
      this.text.setScale(1.3);
      this.scene.tweens.add({ targets: this.text, scale: 1, duration: 120 });
    }
  }

  apply(count) {
    if (this.op === 'mul') return count * this.value;
    return count + this.value;
  }

  markUsed() {
    this.used = true;
    this.redraw();
  }

  step(dt, scroll) {
    this.y += scroll * dt;
    this.g.y = this.y;
    this.glow.y = this.y;
    this.text.y = this.y - 4;
  }

  get offscreen() { return this.y > 1050; }

  destroy() { this.g.destroy(); this.glow.destroy(); this.text.destroy(); }
}

// A wooden barrel with hit points. Shoot it to zero to claim its reward (weapon or recruits).
export class RewardBarrel {
  constructor(scene, x, y, hp, reward) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.hp = hp; this.maxHp = hp;
    this.r = 40;
    this.reward = reward; // { type: 'weapon', index } | { type: 'recruits', amount }
    this.alive = true;
    this.img = scene.add.image(x, y, 'barrelw').setDepth(8);
    const icon = reward.type === 'weapon' ? WEAPONS[reward.index].icon : 'soldier_0';
    this.icon = scene.add.image(x, y - 48, icon).setDepth(9).setScale(reward.type === 'weapon' ? 0.9 : 1.1);
    this.iconGlow = scene.add.image(x, y - 48, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(reward.type === 'weapon' ? 0x9fd356 : 0x5fb3ff).setScale(1.1, 0.6).setAlpha(0.6).setDepth(8);
    this.label = scene.add.text(x, y - 82, reward.type === 'weapon' ? WEAPONS[reward.index].name : `+${reward.amount}`, {
      fontFamily: FONT.ui, fontSize: '17px', fontStyle: '700', color: '#ffffff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9);
    this.text = scene.add.text(x, y + 2, String(hp), {
      fontFamily: FONT.display, fontSize: '34px', color: '#ffffff', stroke: '#2a1606', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(9);
    this.flash = 0;
    this.t = Math.random() * 3;
  }

  hit(dmg) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.text.setText(String(Math.ceil(this.hp)));
    this.img.setTintFill(0xffe2b0);
    this.flash = 0.05;
    if (this.hp <= 0) { this.alive = false; return true; }
    return false;
  }

  step(dt, scroll) {
    this.y += scroll * dt;
    this.t += dt;
    if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) this.img.clearTint(); }
    this.img.y = this.y;
    this.text.y = this.y + 2;
    const bob = Math.sin(this.t * 3) * 3;
    this.icon.y = this.y - 48 + bob;
    this.icon.rotation = Math.sin(this.t * 1.5) * 0.15;
    this.iconGlow.y = this.y - 48 + bob;
    this.label.y = this.y - 82 + bob;
  }

  get offscreen() { return this.y > 1100; }

  destroy() {
    [this.img, this.icon, this.iconGlow, this.label, this.text].forEach((o) => o.destroy());
  }
}
