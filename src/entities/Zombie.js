import * as Phaser from 'phaser';
import { ZOMBIES, ROAD } from '../config.js';

// Pooled zombie. Behaviour is a tiny state machine: shamble → (lunge when close) → dead.
export class Zombie extends Phaser.GameObjects.Image {
  constructor(scene) {
    super(scene, 0, 0, 'z_walker_0');
    scene.add.existing(this);
    this.setActive(false).setVisible(false).setDepth(6);
    this.type = 'walker';
    this.def = ZOMBIES.walker;
    this.hp = 1;
    this.r = 16;
    this.anim = 0;
    this.frame2 = 0;
    this.flash = 0;
    this.knock = 0;
    this.wobble = 0;
  }

  spawn(type, x, y, hpMul = 1) {
    this.type = type;
    this.def = ZOMBIES[type];
    this.hp = Math.ceil(this.def.hp * hpMul);
    this.maxHp = this.hp;
    this.r = this.def.radius;
    this.anim = Math.random();
    this.flash = 0;
    this.knock = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.speedJitter = Phaser.Math.FloatBetween(0.85, 1.2);
    this.setTexture(`${this.def.texture}_0`)
      .setPosition(x, y)
      .setRotation(0)
      .setScale(1)
      .setAlpha(1)
      .clearTint()
      .setDepth(type === 'boss' ? 7 : 6)
      .setActive(true)
      .setVisible(true);
    return this;
  }

  // scroll: world speed in px/s; targetX: where the vehicle is.
  step(dt, scroll, targetX, targetY) {
    const d = this.def;
    this.anim += dt * (this.type === 'runner' ? 7 : 3.2);
    const frame = Math.floor(this.anim) % 2;
    if (frame !== this.frame2) {
      this.frame2 = frame;
      this.setTexture(`${d.texture}_${frame}`);
    }
    this.wobble += dt * 3;

    const close = targetY - this.y < 260;
    const chase = d.chase * this.speedJitter * (close ? 1.5 : 1);
    const dx = targetX - this.x;
    const vx = Math.sign(dx) * Math.min(Math.abs(dx) * 2, chase) + Math.sin(this.wobble) * 14;

    let vy = scroll + d.fall * this.speedJitter;
    if (this.knock > 0) {
      vy -= this.knock;
      this.knock = Math.max(0, this.knock - 900 * dt);
    }

    this.x += vx * dt;
    this.y += vy * dt;
    const pad = this.r * 0.6;
    this.x = Phaser.Math.Clamp(this.x, ROAD.left - 40 + pad, ROAD.right + 40 - pad);
    this.setRotation(Math.atan2(dx, 400) * -0.6 + Math.sin(this.wobble) * 0.06);

    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.clearTint();
    }
  }

  hit(dmg, knock = 0) {
    this.hp -= dmg;
    this.flash = 0.06;
    this.setTintFill(0xffffff);
    if (!this.def.heavy) this.knock = Math.max(this.knock, knock);
    else this.knock = Math.max(this.knock, knock * 0.25);
    return this.hp <= 0;
  }

  kill() {
    this.setActive(false).setVisible(false);
  }
}
