import * as Phaser from 'phaser';
import { GAME_W, GAME_H, CSS, PALETTE } from '../config.js';
import { Button, title, label } from '../ui/Button.js';
import { getSave, commit } from '../systems/save.js';
import { UPGRADES, upgradeCost, statsFromUpgrades } from '../systems/upgrades.js';
import { audio } from '../systems/Audio.js';

// Permanent upgrades bought with scrap collected on runs.
export class GarageScene extends Phaser.Scene {
  constructor() {
    super('Garage');
  }

  create() {
    this.add.tileSprite(0, 0, GAME_W, GAME_H, 'road').setOrigin(0).setAlpha(0.35);
    this.add.image(0, 0, 'vignette_soft').setOrigin(0);
    title(this, GAME_W / 2, 92, 'GARAGE', 60);
    [[-40, 0], [0, -14], [40, 0], [-20, 34], [20, 34]].forEach(([dx, dy]) => this.add.image(GAME_W / 2 + dx, 240 + dy, 'soldier_0').setScale(1.6));

    this.scrapText = label(this, GAME_W / 2, 360, '', 26, CSS.amber, { bold: true });
    this.statsText = label(this, GAME_W / 2, 396, '', 16, CSS.muted, { bold: true });

    this.cards = UPGRADES.map((def, i) => this.makeCard(def, 470 + i * 128));

    this.backBtn = new Button(this, GAME_W / 2, GAME_H - 70, 'BACK', () => this.back(), { width: 260 });
    this.input.keyboard.on('keydown-ESC', () => this.back());
    this.refresh();
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  makeCard(def, y) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(24, y - 54, GAME_W - 48, 108, 12);
    g.lineStyle(1, PALETTE.uiEdge, 1);
    g.strokeRoundedRect(24, y - 54, GAME_W - 48, 108, 12);
    const name = label(this, 44, y - 26, def.name, 22, CSS.bone, { originX: 0, bold: true });
    const desc = label(this, 44, y + 2, def.desc, 16, CSS.muted, { originX: 0 });
    const pips = this.add.graphics();
    const btn = new Button(this, GAME_W - 116, y, '', () => this.buy(def), { width: 160, height: 64, fontSize: 20, variant: 'primary' });
    return { def, name, desc, pips, btn, y };
  }

  buy(def) {
    const save = getSave();
    const lvl = save.upgrades[def.id] || 0;
    const cost = upgradeCost(def, lvl);
    if (cost === Infinity || save.scrap < cost) {
      audio.denied();
      this.cameras.main.shake(120, 0.004);
      return;
    }
    save.scrap -= cost;
    save.upgrades[def.id] = lvl + 1;
    commit();
    audio.heal();
    this.refresh();
  }

  refresh() {
    const save = getSave();
    this.scrapText.setText(`SCRAP: ${save.scrap}`);
    const st = statsFromUpgrades(save.upgrades);
    this.statsText.setText(`START SQUAD ${st.startSquad}   ·   DAMAGE ×${st.damageMul.toFixed(2)}   ·   FIRE RATE ×${st.rateMul.toFixed(2)}`);
    this.cards.forEach((c) => {
      const lvl = save.upgrades[c.def.id] || 0;
      const cost = upgradeCost(c.def, lvl);
      c.pips.clear();
      for (let i = 0; i < c.def.max; i++) {
        c.pips.fillStyle(i < lvl ? PALETTE.amber : 0x2a2f35, 1);
        c.pips.fillRect(44 + i * 26, c.y + 26, 20, 8);
      }
      if (cost === Infinity) {
        c.btn.setLabel('MAXED').setEnabled(false);
      } else {
        c.btn.setLabel(`UPGRADE\n${cost} SCRAP`).setEnabled(save.scrap >= cost);
      }
    });
  }

  back() {
    this.scene.start('Menu');
  }
}
