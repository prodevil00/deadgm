import * as Phaser from 'phaser';

// Road obstacles. Boxes for collision (half extents), optional hit points.
export const HAZARDS = {
  wreck: { texture: 'wreck', hw: 26, hh: 46, hp: 14, ram: 18, score: 25, explodes: false },
  barrier: { texture: 'barrier', hw: 58, hh: 13, hp: Infinity, ram: 20, score: 0, explodes: false },
  barrel: { texture: 'barrel', hw: 15, hh: 15, hp: 2, ram: 10, score: 15, explodes: true },
};

export class Hazard extends Phaser.GameObjects.Image {
  constructor(scene) {
    super(scene, 0, 0, 'wreck');
    scene.add.existing(this);
    this.setActive(false).setVisible(false).setDepth(5);
  }

  spawn(kind, x, y) {
    this.kind = kind;
    this.def = HAZARDS[kind];
    this.hp = this.def.hp;
    this.hw = this.def.hw;
    this.hh = this.def.hh;
    this.flash = 0;
    const flip = kind === 'wreck' && Math.random() < 0.5;
    this.setTexture(this.def.texture)
      .setPosition(x, y)
      .setRotation(kind === 'wreck' ? (flip ? Math.PI : 0) + Phaser.Math.FloatBetween(-0.12, 0.12) : Phaser.Math.FloatBetween(-0.05, 0.05))
      .setScale(1)
      .clearTint()
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    return this;
  }

  hit(dmg) {
    if (this.hp === Infinity) return false;
    this.hp -= dmg;
    this.flash = 0.05;
    this.setTintFill(0xffd9a0);
    return this.hp <= 0;
  }

  step(dt, scroll) {
    this.y += scroll * dt;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.clearTint();
    }
  }

  kill() {
    this.setActive(false).setVisible(false);
  }
}

export class Bullet extends Phaser.GameObjects.Image {
  constructor(scene) {
    super(scene, 0, 0, 'bullet');
    scene.add.existing(this);
    this.setActive(false).setVisible(false).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
  }

  fire(x, y, angle, speed, damage) {
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.px = x;
    this.py = y;
    this.damage = damage;
    this.life = 0.8;
    this.setPosition(x, y).setRotation(angle + Math.PI / 2).setActive(true).setVisible(true);
    return this;
  }

  step(dt) {
    this.px = this.x;
    this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.y < -40 || this.x < -40 || this.x > 580) this.kill();
  }

  kill() {
    this.setActive(false).setVisible(false);
  }
}

export class Pickup extends Phaser.GameObjects.Image {
  constructor(scene) {
    super(scene, 0, 0, 'scrap');
    scene.add.existing(this);
    this.setActive(false).setVisible(false).setDepth(9);
  }

  spawn(kind, x, y) {
    this.kind = kind;
    this.vx = Phaser.Math.FloatBetween(-60, 60);
    this.vy = Phaser.Math.FloatBetween(-140, -60);
    this.spin = Phaser.Math.FloatBetween(-4, 4);
    this.age = 0;
    this.setTexture(kind).setPosition(x, y).setScale(kind === 'medkit' ? 1.1 : 0.9).setAlpha(1).setActive(true).setVisible(true);
    return this;
  }

  step(dt, scroll, tx, ty) {
    this.age += dt;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 170 * 170 && this.age > 0.25) {
      const d = Math.sqrt(distSq) || 1;
      this.vx += (dx / d) * 2600 * dt;
      this.vy += (dy / d) * 2600 * dt;
    } else {
      this.vx *= 1 - Math.min(1, dt * 3);
      this.vy *= 1 - Math.min(1, dt * 3);
    }
    this.x += this.vx * dt;
    this.y += (this.vy + scroll) * dt;
    if (this.kind === 'scrap') this.rotation += this.spin * dt;
    else this.setScale(1.1 + Math.sin(this.age * 6) * 0.08);
    if (this.y > 1020) this.kill();
  }

  kill() {
    this.setActive(false).setVisible(false);
  }
}
