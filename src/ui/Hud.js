import * as Phaser from 'phaser';
import { GAME_W, GAME_H, FONT, CSS, PALETTE } from '../config.js';
import { label } from './Button.js';

const D = 1000;

// HUD: squad size, weapon, score, route progress, boss health, pause button.
export class Hud {
  constructor(scene, { onPause }) {
    this.scene = scene;
    const top = scene.add.graphics().setDepth(D);
    top.fillGradientStyle(0x120c06, 0x120c06, 0x120c06, 0x120c06, 0.85, 0.85, 0, 0);
    top.fillRect(0, 0, GAME_W, 120);

    scene.add.image(34, 38, 'soldier_0').setDepth(D).setScale(1.1);
    this.squadText = scene.add.text(58, 38, '1', {
      fontFamily: FONT.display, fontSize: '34px', color: '#ffffff', stroke: '#1b3b6b', strokeThickness: 6,
    }).setOrigin(0, 0.5).setDepth(D);

    this.weaponIcon = scene.add.image(170, 38, 'w_rifle').setDepth(D).setScale(0.7).setVisible(false);
    this.weaponText = label(scene, 210, 38, 'PISTOL', 18, CSS.toxic, { originX: 0, bold: true }).setDepth(D);

    this.scoreText = scene.add.text(452, 38, '0', {
      fontFamily: FONT.display, fontSize: '26px', color: CSS.bone, stroke: '#000', strokeThickness: 5,
    }).setOrigin(1, 0.5).setDepth(D);

    this.progress = scene.add.graphics().setDepth(D);
    this.distText = label(scene, 18, 96, '', 15, CSS.bone, { originX: 0, bold: true }).setDepth(D);

    // boss bar with big number
    this.bossGroup = scene.add.container(0, 0).setDepth(D).setVisible(false);
    this.bossBar = scene.add.graphics();
    this.bossSkull = scene.add.circle(80, 150, 22, 0x1a1a1a).setStrokeStyle(3, PALETTE.red);
    this.bossSkullTxt = scene.add.text(80, 150, '☠', { fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
    this.bossHp = scene.add.text(GAME_W / 2 + 20, 126, '', {
      fontFamily: FONT.display, fontSize: '30px', color: '#ffffff', stroke: '#7a1010', strokeThickness: 7,
    }).setOrigin(0.5);
    this.bossGroup.add([this.bossBar, this.bossSkull, this.bossSkullTxt, this.bossHp]);

    // pause button
    const px = GAME_W - 44, py = 40;
    const pg = scene.add.graphics().setDepth(D + 1);
    const draw = (down) => {
      pg.clear();
      pg.fillStyle(down ? 0x0b0d10 : 0x15181c, 0.9);
      pg.fillCircle(px, py, 28);
      pg.lineStyle(2, 0x6a6f76, 1);
      pg.strokeCircle(px, py, 28);
      pg.fillStyle(0xe8e2d0);
      pg.fillRoundedRect(px - 9, py - 11, 6, 22, 2);
      pg.fillRoundedRect(px + 3, py - 11, 6, 22, 2);
    };
    draw(false);
    this.pauseZone = scene.add.zone(px, py, 76, 76).setDepth(D + 2).setInteractive({ useHandCursor: true });
    this.pauseZone.on('pointerdown', (p, x, y, e) => { e?.stopPropagation?.(); draw(true); onPause(); });
    this.pauseZone.on('pointerup', () => draw(false));
    this.pauseZone.on('pointerout', () => draw(false));

    this.damageFlash = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0xb3140c, 1).setOrigin(0).setAlpha(0).setDepth(D - 5);
    this.lastWeapon = null;
  }

  flashDamage(strength = 0.25) {
    this.damageFlash.setAlpha(Math.max(this.damageFlash.alpha, strength));
    this.scene.tweens.add({ targets: this.damageFlash, alpha: 0, duration: 260 });
  }

  update(s) {
    this.squadText.setText(String(s.squad));
    this.scoreText.setText(String(s.score));
    if (s.weapon !== this.lastWeapon) {
      this.lastWeapon = s.weapon;
      if (s.weapon.icon) this.weaponIcon.setTexture(s.weapon.icon).setVisible(true);
      this.weaponText.setText(s.weapon.name).setX(s.weapon.icon ? 210 : 150);
      this.weaponText.setScale(1.4);
      this.scene.tweens.add({ targets: this.weaponText, scale: 1, duration: 250 });
    }

    const g = this.progress;
    g.clear();
    const x0 = 18, x1 = GAME_W - 18, y = 76;
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x0, y - 5, x1 - x0, 10, 5);
    g.fillStyle(PALETTE.amber, 1);
    g.fillRoundedRect(x0, y - 5, Math.max(10, (x1 - x0) * s.progress), 10, 5);
    g.fillStyle(PALETTE.red, 1);
    g.fillCircle(x1, y, 9);
    this.distText.setText(s.boss ? 'BOSS FIGHT!' : `${s.meters} m  ·  ${s.metersLeft} m to the boss`);

    if (s.boss) {
      this.bossGroup.setVisible(true);
      const r = Phaser.Math.Clamp(s.boss.hp / s.boss.maxHp, 0, 1);
      const bg = this.bossBar;
      bg.clear();
      bg.fillStyle(0x000000, 0.7);
      bg.fillRoundedRect(100, 142, GAME_W - 160, 18, 5);
      bg.fillStyle(0x6a6a6a, 1);
      bg.fillRoundedRect(103, 145, GAME_W - 166, 12, 4);
      bg.fillStyle(PALETTE.red, 1);
      bg.fillRoundedRect(103, 145, (GAME_W - 166) * r, 12, 4);
      this.bossHp.setText(String(Math.ceil(s.boss.hp)));
    } else this.bossGroup.setVisible(false);
  }

  setInteractive(on) {
    if (on) this.pauseZone.setInteractive(); else this.pauseZone.disableInteractive();
  }
}
