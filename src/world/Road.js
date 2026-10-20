import * as Phaser from 'phaser';
import { GAME_W, GAME_H, ROAD, LIMITS } from '../config.js';
import { Pool } from '../systems/Pool.js';

const PROP_KEYS = ['cactus', 'cactus', 'bush', 'bush', 'tree', 'rubble', 'tyres', 'wreck', 'pole'];

// Scrolling road, roadside dressing, ground decals and ambient ash.
// Used by both the menu backdrop and the gameplay scene.
export class Road {
  constructor(scene, { depthBase = 0 } = {}) {
    this.scene = scene;
    this.tile = scene.add.tileSprite(0, 0, GAME_W, GAME_H, 'road').setOrigin(0).setDepth(depthBase);
    this.propTimer = 0;
    this.decalDepth = depthBase + 1;
    this.propDepth = depthBase + 2;

    this.decals = new Pool(() => this.makeSprite(this.decalDepth), LIMITS.decals);
    this.props = new Pool(() => this.makeSprite(this.propDepth), LIMITS.props);

    // pre-dress the roadside so the first frame is not empty
    for (let y = -100; y < GAME_H; y += 70) this.spawnProp(y);

    this.ash = scene.add.particles(0, 0, 'dot', {
      x: { min: 0, max: GAME_W },
      y: -10,
      lifespan: 9000,
      speedY: { min: 30, max: 80 },
      speedX: { min: -25, max: 10 },
      scale: { min: 0.15, max: 0.45 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xd8b47a, 0xc9a167, 0xf0dcb0],
      frequency: 140,
      quantity: 1,
    }).setDepth(900);
  }

  makeSprite(depth) {
    const s = this.scene.add.image(0, 0, 'dot').setDepth(depth).setActive(false).setVisible(false);
    s.kill = () => { s.setActive(false).setVisible(false); };
    return s;
  }

  spawnProp(y) {
    const p = this.props.obtain();
    if (!p) return;
    const key = PROP_KEYS[Math.floor(Math.random() * PROP_KEYS.length)];
    const left = Math.random() < 0.5;
    const x = left ? Phaser.Math.Between(4, ROAD.left - 22) : Phaser.Math.Between(ROAD.right + 22, GAME_W - 4);
    p.setTexture(key)
      .setPosition(x, y)
      .setRotation(key === 'cactus' || key === 'bush' ? 0 : key === 'pole' ? (left ? -0.2 : 0.2) + Phaser.Math.FloatBetween(-0.3, 0.3) : Phaser.Math.FloatBetween(-Math.PI, Math.PI))
      .setScale(key === 'wreck' ? 0.75 : Phaser.Math.FloatBetween(0.8, 1.15))
      .setAlpha(0.95)
      .setTint(key === 'wreck' ? 0x8a8a8a : 0xffffff)
      .setActive(true)
      .setVisible(true);
  }

  addDecal(key, x, y, scale = 1, alpha = 0.85) {
    const d = this.decals.obtain() || this.oldestDecal();
    if (!d) return;
    d.setTexture(key).setPosition(x, y).setRotation(Math.random() * Math.PI * 2)
      .setScale(scale).setAlpha(alpha).setTint(0xffffff).setActive(true).setVisible(true);
  }

  oldestDecal() {
    // reuse the lowest decal on screen (it will vanish soonest anyway)
    let best = null;
    this.decals.forEachActive((d) => { if (!best || d.y > best.y) best = d; });
    return best;
  }

  update(dt, speed) {
    const dy = speed * dt;
    this.tile.tilePositionY -= dy;
    const step = (s) => {
      s.y += dy;
      if (s.y > GAME_H + 80) s.kill();
    };
    this.decals.forEachActive(step);
    this.props.forEachActive(step);

    this.propTimer -= dy;
    if (this.propTimer <= 0) {
      this.spawnProp(-80);
      this.propTimer = Phaser.Math.Between(50, 110);
    }
  }
}
