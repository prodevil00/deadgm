import * as Phaser from 'phaser';
import { GAME_W, GAME_H, ROAD, LEVEL, LIMITS, ZOMBIES, WEAPONS, SQUAD, FONT, CSS } from '../config.js';
import { Road } from '../world/Road.js';
import { Spawner } from '../world/Spawner.js';
import { Squad } from '../entities/Squad.js';
import { Zombie } from '../entities/Zombie.js';
import { Bullet } from '../entities/Hazards.js';
import { ValueGate, RewardBarrel } from '../entities/RouteObjects.js';
import { Hud } from '../ui/Hud.js';
import { Pool } from '../systems/Pool.js';
import { audio } from '../systems/Audio.js';
import { getSave, commit } from '../systems/save.js';
import { statsFromUpgrades } from '../systems/upgrades.js';
import { scrollSpeed } from '../systems/difficulty.js';
import { circlesOverlap, segmentHitsCircle, segmentHitsBox } from '../systems/collision.js';

// Core gameplay: steer a squad of shooters up the road. They fire straight ahead,
// so you aim by moving. Shoot gates to raise their value, walk through the better one,
// shoot barrels open for new weapons, survive the hordes, kill the boss.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    const save = getSave();
    this.settings = save.settings;
    const base = statsFromUpgrades(save.upgrades);
    this.damageMul = base.damageMul;
    this.rateMul = base.rateMul;

    this.state = 'run';
    this.distance = 0;
    this.speed = LEVEL.baseScroll;
    this.kills = 0;
    this.score = 0;
    this.bonusScrap = 0;
    this.weaponIndex = 0;
    this.fireTimer = 0.3;
    this.stateTimer = 0;
    this.leaving = false;
    this.boss = null;
    this.gates = [];
    this.barrels = [];
    this.elapsed = 0;
    this.peakSquad = base.startSquad;

    this.road = new Road(this);
    this.zombies = new Pool(() => new Zombie(this), LIMITS.zombies);
    this.bullets = new Pool(() => new Bullet(this), LIMITS.bullets);
    this.squad = new Squad(this, ROAD.center, base.startSquad);
    this.spawner = new Spawner(this);

    this.createFx();
    this.add.image(0, 0, 'vignette_soft').setOrigin(0).setDepth(950);
    this.hud = new Hud(this, { onPause: () => this.pauseGame() });

    this.popups = [];
    for (let i = 0; i < 28; i++) {
      this.popups.push(this.add.text(0, 0, '', {
        fontFamily: FONT.display, fontSize: '20px', color: '#ff5a4a', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(960).setVisible(false));
    }
    this.popupCooldown = 0;

    this.events.on('soldier-died', this.onSoldierDied, this);
    this.setupInput();
    this.showIntro();

    this.onHidden = () => { if (this.controlsActive) this.pauseGame(); };
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden);
    this.events.once('shutdown', () => this.cleanup());
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  createFx() {
    this.bloodFx = this.add.particles(0, 0, 'dot', {
      speed: { min: 60, max: 240 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.9, end: 0.2 },
      alpha: { start: 1, end: 0 }, tint: [0x8a1414, 0x5e0b0b, 0xa31d1d], emitting: false,
    }).setDepth(11);
    this.goreFx = this.add.particles(0, 0, 'chunk', {
      speed: { min: 80, max: 220 }, lifespan: 450, rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 }, tint: [0x6d7f55, 0x5e0b0b, 0x4a5560], emitting: false,
    }).setDepth(11);
    this.sparkFx = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 300 }, lifespan: 200, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xffd27a, 0xffffff], blendMode: Phaser.BlendModes.ADD, emitting: false, rotate: { min: 0, max: 360 },
    }).setDepth(12);
    this.fireFx = this.add.particles(0, 0, 'glow', {
      speed: { min: 40, max: 220 }, lifespan: { min: 250, max: 600 }, scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.9, end: 0 }, tint: [0xff9a2e, 0xff5a1f, 0xffd27a], blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(14);
    this.woodFx = this.add.particles(0, 0, 'chunk', {
      speed: { min: 120, max: 320 }, lifespan: 600, rotate: { min: 0, max: 360 }, scale: { start: 1.6, end: 0.8 },
      alpha: { start: 1, end: 0 }, tint: [0x8a5a2b, 0xa86f37, 0x4b4f55], emitting: false,
    }).setDepth(12);
    this.muzzles = this.add.particles(0, 0, 'glow', {
      lifespan: 70, scale: { start: 0.22, end: 0.05 }, alpha: { start: 0.9, end: 0 }, tint: 0xffd27a,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(13);
  }

  setupInput() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' });
    kb.on('keydown-P', () => this.pauseGame());
    kb.on('keydown-ESC', () => this.pauseGame());
    this.input.addPointer(2);
    this.steer = null;
    this.input.on('pointerdown', (p, over) => {
      audio.unlock();
      if ((over && over.length) || !this.controlsActive) return;
      this.steer = { id: p.id, ax: p.x, startX: this.squad.x, targetX: this.squad.x };
    });
    this.input.on('pointermove', (p) => {
      if (this.steer && this.steer.id === p.id && p.isDown) this.steer.targetX = this.steer.startX + (p.x - this.steer.ax) * 1.25;
    });
    const release = (p) => { if (this.steer && this.steer.id === p.id) this.steer = null; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  get controlsActive() { return this.state === 'run' || this.state === 'boss'; }
  get weapon() { return WEAPONS[this.weaponIndex]; }

  showIntro() {
    const touch = this.sys.game.device.input.touch;
    const t1 = this.add.text(GAME_W / 2, 380, 'GO!', {
      fontFamily: FONT.display, fontSize: '80px', color: '#ffffff', stroke: '#1b3b6b', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(970).setScale(0.4);
    const t2 = this.add.text(GAME_W / 2, 600, touch ? 'DRAG TO MOVE · YOUR SQUAD SHOOTS AHEAD\nSHOOT GATES TO RAISE THEIR VALUE' : '← → / A D TO MOVE · YOUR SQUAD SHOOTS AHEAD\nSHOOT GATES TO RAISE THEIR VALUE', {
      fontFamily: FONT.ui, fontSize: '18px', fontStyle: '700', color: '#ffffff', align: 'center', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(970);
    this.tweens.add({ targets: t1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t1, alpha: 0, delay: 900, duration: 400, onComplete: () => t1.destroy() });
    this.tweens.add({ targets: t2, alpha: 0, delay: 3500, duration: 600, onComplete: () => t2.destroy() });
  }

  // ---- spawning ---------------------------------------------------------------
  spawnZombie(type, x, y, progress = 0) {
    const z = this.zombies.obtain();
    if (!z) return null;
    const mul = type === 'boss' ? 1 : 1 + progress * 2;
    return z.spawn(type, Phaser.Math.Clamp(x, ROAD.left + 16, ROAD.right - 16), y, mul);
  }

  spawnGatePair(a, b) {
    const half = ROAD.width / 2;
    const w = half - 10;
    const g1 = new ValueGate(this, ROAD.left + half / 2, -60, w, a[0], a[1]);
    const g2 = new ValueGate(this, ROAD.right - half / 2, -60, w, b[0], b[1]);
    g1.partner = g2; g2.partner = g1;
    this.gates.push(g1, g2);
  }

  spawnBarrel(x, y, hp, reward) {
    this.barrels.push(new RewardBarrel(this, x, y, hp, reward));
  }

  popup(x, y, text, color = '#ff5a4a', size = 20) {
    const t = this.popups.find((p) => !p.visible);
    if (!t) return;
    t.setText(text).setColor(color).setFontSize(size).setPosition(x + Phaser.Math.Between(-10, 10), y).setAlpha(1).setScale(1).setVisible(true);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => t.setVisible(false) });
  }

  shake(d, i) { if (this.settings.shake) this.cameras.main.shake(d, i); }

  // ---- loop ---------------------------------------------------------------------
  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    this.popupCooldown -= dt;
    const progress = Math.min(this.distance / LEVEL.length, 1);

    let target = 0;
    if (this.state === 'run') target = scrollSpeed(progress);
    else if (this.state === 'boss') target = LEVEL.bossScroll;
    else if (this.state === 'victory') target = 320;
    this.speed += (target - this.speed) * Math.min(1, dt * 2);
    if (this.state === 'run') this.distance += this.speed * dt;
    this.road.update(dt, this.speed);

    let axis = 0, targetX = null;
    if (this.controlsActive) {
      if (this.keys.left.isDown || this.keys.a.isDown) axis -= 1;
      if (this.keys.right.isDown || this.keys.d.isDown) axis += 1;
      if (axis !== 0) this.steer = null;
      else if (this.steer) targetX = this.steer.targetX;
    }
    this.squad.steer(dt, axis, targetX);
    this.squad.update(dt);

    if (this.controlsActive) {
      if (this.state === 'run') {
        this.spawner.update(dt, progress);
        if (progress >= 1) this.startBoss();
      }
      this.fire(dt);
    }

    this.stepEntities(dt);
    if (this.controlsActive) this.collide(dt);
    if (this.boss) this.updateBoss(dt);
    this.updateState(dt);

    this.hud.update({
      squad: this.squad.count, score: this.score, weapon: this.weapon, progress,
      meters: Math.floor(this.distance / LEVEL.pxPerMeter),
      metersLeft: Math.max(0, Math.ceil((LEVEL.length - this.distance) / LEVEL.pxPerMeter)),
      boss: this.boss && this.boss.active ? this.boss : null,
    });
  }

  // Squad fires straight up the road: you aim by moving.
  fire(dt) {
    const n = this.squad.count;
    if (n === 0) return;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    const w = this.weapon;
    this.fireTimer = w.interval / this.rateMul;
    const shooters = Math.min(n, SQUAD.maxVolley);
    const dmg = (w.damage * this.damageMul * n) / shooters;
    const start = Math.floor(Math.random() * n);
    for (let i = 0; i < shooters; i++) {
      const s = this.squad.soldiers[(start + Math.floor((i * n) / shooters)) % n];
      const b = this.bullets.obtain();
      if (!b) break;
      b.fire(s.x + 5, s.y - 22, -Math.PI / 2 + Phaser.Math.FloatBetween(-0.025, 0.025), w.speed, dmg);
      b.setTint(w.tint).setScale(w.splash ? 1.6 : 1);
      b.splash = w.splash || 0;
      if (i < 4) this.muzzles.emitParticleAt(s.x + 5, s.y - 22);
    }
    audio.shoot();
  }

  stepEntities(dt) {
    const sx = this.squad.x, sy = this.squad.y;
    this.bullets.forEachActive((b) => b.step(dt));
    this.zombies.forEachActive((z) => {
      if (z.type === 'boss') return;
      z.step(dt, this.speed, this.controlsActive ? sx : z.x, sy);
      if (z.y > GAME_H + 60) z.kill();
    });
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.step(dt, this.speed);
      if (g.offscreen) { g.destroy(); this.gates.splice(i, 1); }
    }
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      b.step(dt, this.speed);
      if (b.offscreen || !b.alive) { b.destroy(); this.barrels.splice(i, 1); }
    }
  }

  collide(dt) {
    const sq = this.squad;
    // bullets vs gates, barrels, zombies
    this.bullets.forEachActive((b) => {
      for (const g of this.gates) {
        if (!g.used && segmentHitsBox(b.px, b.py, b.x, b.y, g.x, g.y, g.w / 2, g.h / 2)) {
          g.shot(b.damage);
          this.sparkFx.explode(2, b.x, g.y + g.h / 2);
          b.kill();
          return;
        }
      }
      for (const br of this.barrels) {
        if (br.alive && segmentHitsCircle(b.px, b.py, b.x, b.y, br.x, br.y, br.r)) {
          this.woodFx.explode(1, b.x, br.y + 30);
          if (br.hit(b.damage)) this.openBarrel(br);
          b.kill();
          return;
        }
      }
      let hitZ = null;
      this.zombies.forEachActive((z) => {
        if (!hitZ && segmentHitsCircle(b.px, b.py, b.x, b.y, z.x, z.y, z.r + 4)) hitZ = z;
      });
      if (hitZ) {
        if (b.splash) this.explode(b.x, b.y, b.splash, b.damage);
        else this.damageZombie(hitZ, b.damage, b.x, b.y);
        b.kill();
      }
    });

    // zombies reaching the squad
    const r = sq.radius;
    this.zombies.forEachActive((z) => {
      if (z.type === 'boss') return;
      if (!circlesOverlap(z.x, z.y, z.r, sq.x, sq.y, r)) return;
      this.loseSoldiers(z.def.kills);
      this.killZombie(z, false);
    });

    // walking through gates
    for (const g of this.gates) {
      if (g.used || g.y < sq.y - 10 || g.y > sq.y + 60) continue;
      if (Math.abs(sq.x - g.x) <= g.w / 2 + 5) {
        const before = sq.count;
        const after = Math.max(0, g.apply(before));
        g.markUsed();
        if (g.partner) g.partner.markUsed();
        this.changeSquad(after - before);
        this.score += Math.max(0, after - before) * 10;
      }
    }

    // walking into a barrel that is still closed
    for (const br of this.barrels) {
      if (br.alive && circlesOverlap(br.x, br.y, br.r, sq.x, sq.y, r * 0.8)) {
        this.loseSoldiers(Math.max(1, Math.ceil(br.hp / 40)));
        br.alive = false;
        this.woodFx.explode(16, br.x, br.y);
        audio.crash();
        this.shake(200, 0.012);
      }
    }
  }

  damageZombie(z, dmg, x, y) {
    if (z.hit(dmg, z.def.heavy ? 0 : 30)) {
      this.killZombie(z, true);
    } else {
      this.bloodFx.explode(2, x, y);
      if (z.def.heavy && this.popupCooldown <= 0) {
        this.popupCooldown = 0.08;
        this.popup(z.x, z.y - z.r, `-${Math.round(dmg)}`, '#ff5a4a', z.type === 'boss' ? 26 : 20);
      }
    }
    audio.hit();
  }

  killZombie(z, byGun) {
    this.kills++;
    this.score += z.def.score;
    this.bloodFx.explode(z.def.heavy ? 24 : 10, z.x, z.y);
    this.goreFx.explode(z.def.heavy ? 10 : 4, z.x, z.y);
    this.road.addDecal(`blood_${Phaser.Math.Between(0, 2)}`, z.x, z.y, z.r / 18, 0.75);
    if (byGun && this.popupCooldown <= 0) {
      this.popupCooldown = 0.05;
      this.popup(z.x, z.y - 10, `+${z.def.score}`, '#ffd27a', 16);
    }
    audio.splat();
    z.kill();
    if (z.type === 'boss') this.onBossKilled(z);
  }

  explode(x, y, radius, dmg) {
    this.fireFx.explode(16, x, y);
    this.road.addDecal('scorch', x, y, radius / 60, 0.7);
    audio.explode();
    this.shake(120, 0.006);
    this.zombies.forEachActive((z) => {
      if (circlesOverlap(z.x, z.y, z.r, x, y, radius)) this.damageZombie(z, dmg, z.x, z.y);
    });
  }

  openBarrel(br) {
    this.woodFx.explode(22, br.x, br.y);
    this.fireFx.explode(10, br.x, br.y);
    audio.explode();
    this.shake(160, 0.008);
    this.score += 100;
    if (br.reward.type === 'weapon') {
      if (br.reward.index > this.weaponIndex) this.weaponIndex = br.reward.index;
      this.bonusScrap += 10;
      audio.gate();
      this.banner(`${WEAPONS[br.reward.index].name} UNLOCKED!`, CSS.toxic);
    } else {
      this.changeSquad(br.reward.amount);
      audio.gate();
    }
    br.alive = false;
  }

  banner(text, color) {
    const t = this.add.text(GAME_W / 2, 470, text, {
      fontFamily: FONT.display, fontSize: '40px', color, stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(970).setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, y: 440, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  changeSquad(delta) {
    if (delta === 0) return;
    const sq = this.squad;
    sq.setCount(sq.count + delta);
    this.peakSquad = Math.max(this.peakSquad, sq.count);
    const up = delta > 0;
    this.popup(sq.x, sq.y - sq.radius - 30, `${up ? '+' : ''}${delta}`, up ? '#7fc4ff' : '#ff5a4a', 34);
    if (up) {
      audio.heal();
      sq.ring.setFillStyle(0xffe08a, 0.45);
      this.time.delayedCall(180, () => sq.ring.active && sq.ring.setFillStyle(0x5fb3ff, 0.18));
    } else {
      audio.hurt();
      this.hud.flashDamage(0.2);
    }
  }

  loseSoldiers(n) {
    if (n <= 0 || this.squad.count === 0) return;
    this.squad.setCount(this.squad.count - n);
    this.hud.flashDamage(0.18);
    audio.hurt();
    this.shake(90, 0.004);
  }

  onSoldierDied(x, y) {
    this.bloodFx.explode(8, x, y);
    this.road.addDecal(`blood_${Phaser.Math.Between(0, 2)}`, x, y, 0.6, 0.7);
  }

  // ---- boss ------------------------------------------------------------------------
  startBoss() {
    this.state = 'boss';
    const boss = this.spawnZombie('boss', ROAD.center, -170);
    if (!boss) return;
    boss.setScale(1.5);
    boss.r = ZOMBIES.boss.radius;
    boss.summon = 4;
    boss.stomp = 0;
    this.boss = boss;
    audio.bossRoar();
    this.shake(600, 0.01);
    this.banner('THE BUTCHER', CSS.red);
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b || !b.active) return;
    b.anim += dt * 1.8;
    const f = Math.floor(b.anim) % 2;
    if (f !== b.frame2) { b.frame2 = f; b.setTexture(`z_boss_${f}`); }
    if (b.flash > 0) { b.flash -= dt; if (b.flash <= 0) b.clearTint(); }
    if (this.state !== 'boss') return;

    const sq = this.squad;
    const stopY = sq.y - sq.radius - b.r * 0.6;
    if (b.y < stopY) b.y += (b.hp < b.maxHp * 0.4 ? 48 : 34) * dt;
    const dx = sq.x - b.x;
    b.x += Math.sign(dx) * Math.min(Math.abs(dx) * 2, 55) * dt;
    b.x = Phaser.Math.Clamp(b.x, ROAD.left + 50, ROAD.right - 50);
    b.setRotation(Math.sin(b.anim * Math.PI) * 0.04);

    b.summon -= dt;
    if (b.summon <= 0) {
      b.summon = 5;
      for (let i = 0; i < 6; i++) this.spawnZombie('walker', Phaser.Math.Between(ROAD.left + 30, ROAD.right - 30), -40 - i * 30, 0.8);
      audio.groan();
    }

    // stomping the squad
    if (b.y >= stopY - 4 && Math.abs(dx) < b.r + sq.radius * 0.6) {
      b.stomp -= dt;
      if (b.stomp <= 0) {
        b.stomp = 0.25;
        this.loseSoldiers(1);
        this.shake(80, 0.006);
      }
    }
  }

  onBossKilled(b) {
    this.score += 2000;
    this.fireFx.explode(40, b.x, b.y);
    this.bloodFx.explode(60, b.x, b.y);
    this.road.addDecal('blood_0', b.x, b.y, 3, 0.9);
    this.shake(700, 0.02);
    this.boss = null;
    this.win();
  }

  // ---- states ----------------------------------------------------------------------
  updateState(dt) {
    if (this.controlsActive && this.squad.count === 0) this.lose();
    if (this.state === 'victory' || this.state === 'dead') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0 && !this.leaving) this.finish();
    }
  }

  win() {
    if (this.state !== 'boss') return;
    this.state = 'victory';
    this.stateTimer = 2.6;
    this.steer = null;
    this.hud.setInteractive(false);
    this.zombies.forEachActive((z) => { if (z.y > -20) this.killZombie(z, false); else z.kill(); });
    this.score += this.squad.count * 50;
    audio.victory();
    this.banner('ROUTE CLEARED!', CSS.toxic);
  }

  lose() {
    this.state = 'dead';
    this.stateTimer = 2;
    this.steer = null;
    this.hud.setInteractive(false);
    audio.defeat();
    const t = this.add.text(GAME_W / 2, 420, 'OVERRUN', {
      fontFamily: FONT.display, fontSize: '64px', color: CSS.red, stroke: '#000', strokeThickness: 9,
    }).setOrigin(0.5).setDepth(970).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 400 });
  }

  finish() {
    this.leaving = true;
    const won = this.state === 'victory';
    const save = getSave();
    const meters = Math.floor(this.distance / LEVEL.pxPerMeter);
    const score = this.score + meters;
    const newBest = score > save.best;
    save.best = Math.max(save.best, score);
    const scrap = Math.floor(this.kills / 4) + this.bonusScrap + (won ? 50 : 0);
    save.scrap += scrap;
    if (won) save.wins += 1;
    commit();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Result', { won, score, meters, kills: this.kills, scrap, best: save.best, newBest, time: this.elapsed, squad: this.peakSquad });
    });
  }

  pauseGame() {
    if (!this.controlsActive || this.scene.isPaused()) return;
    this.steer = null;
    this.scene.launch('Pause');
    this.scene.pause();
  }

  cleanup() {
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden);
    this.events.off('soldier-died', this.onSoldierDied, this);
    this.gates.forEach((g) => g.destroy());
    this.barrels.forEach((b) => b.destroy());
    this.gates = [];
    this.barrels = [];
  }
}
