import * as Phaser from 'phaser';
import { GAME_W, GAME_H, CSS, PALETTE } from '../config.js';
import { Button, title, label } from '../ui/Button.js';
import { getSave, commit, resetProgress } from '../systems/save.js';
import { audio } from '../systems/Audio.js';

function dimmer(scene, alpha = 0.72) {
  // full-screen interactive blocker so clicks never reach the scene underneath
  return scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x050607, alpha).setOrigin(0).setInteractive();
}

function panel(scene, cy, h) {
  const g = scene.add.graphics();
  g.fillStyle(0x0f1215, 0.96);
  g.fillRoundedRect(40, cy - h / 2, GAME_W - 80, h, 16);
  g.lineStyle(2, PALETTE.uiEdge, 1);
  g.strokeRoundedRect(40, cy - h / 2, GAME_W - 80, h, 16);
  g.fillStyle(PALETTE.red, 1);
  g.fillRect(40, cy - h / 2 + 18, 6, 44);
  return g;
}

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create() {
    dimmer(this);
    panel(this, GAME_H / 2, 520);
    title(this, GAME_W / 2, GAME_H / 2 - 190, 'PAUSED', 52);
    const cx = GAME_W / 2;
    const y0 = GAME_H / 2 - 80;
    this.buttons = [
      new Button(this, cx, y0, 'RESUME', () => this.resume(), { variant: 'primary', width: 320 }),
      new Button(this, cx, y0 + 88, 'RESTART', () => this.restart(), { width: 320 }),
      new Button(this, cx, y0 + 176, 'SETTINGS', () => {
        this.scene.launch('Settings', { from: 'Pause' });
        this.scene.pause();
      }, { width: 320 }),
      new Button(this, cx, y0 + 264, 'QUIT TO MENU', () => this.quit(), { width: 320, variant: 'ghost' }),
    ];
    this.input.keyboard.on('keydown-P', () => this.resume());
    this.input.keyboard.on('keydown-ESC', () => this.resume());
  }

  resume() {
    if (!this.scene.isActive()) return;
    this.scene.resume('Game');
    this.scene.stop();
  }

  restart() {
    this.scene.stop('Game');
    this.scene.start('Game');
  }

  quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  init(data) {
    this.from = data?.from || 'Menu';
  }

  create() {
    dimmer(this, 0.8);
    panel(this, GAME_H / 2, 540);
    title(this, GAME_W / 2, GAME_H / 2 - 200, 'SETTINGS', 48);
    const cx = GAME_W / 2;
    const y0 = GAME_H / 2 - 90;
    const s = getSave().settings;
    this.soundBtn = new Button(this, cx, y0, '', () => {
      s.sound = !s.sound;
      audio.setEnabled(s.sound);
      commit();
      this.refresh();
    }, { width: 340 });
    this.shakeBtn = new Button(this, cx, y0 + 88, '', () => {
      s.shake = !s.shake;
      commit();
      this.refresh();
    }, { width: 340 });
    this.resetArmed = false;
    this.resetBtn = new Button(this, cx, y0 + 176, 'RESET PROGRESS', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.resetBtn.setLabel('TAP AGAIN TO CONFIRM');
        return;
      }
      resetProgress();
      this.resetArmed = false;
      this.resetBtn.setLabel('PROGRESS RESET');
    }, { width: 340, variant: 'ghost', fontSize: 22 });
    label(this, cx, y0 + 230, 'Clears scrap, upgrades and best score.', 15, CSS.muted);
    new Button(this, cx, y0 + 304, 'BACK', () => this.close(), { variant: 'primary', width: 340 });
    this.input.keyboard.on('keydown-ESC', () => this.close());
    this.refresh();
  }

  refresh() {
    const s = getSave().settings;
    this.soundBtn.setLabel(`SOUND: ${s.sound ? 'ON' : 'OFF'}`);
    this.shakeBtn.setLabel(`SCREEN SHAKE: ${s.shake ? 'ON' : 'OFF'}`);
  }

  close() {
    if (this.from === 'Pause') this.scene.resume('Pause');
    else this.scene.get('Menu')?.refresh?.();
    this.scene.stop();
  }
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.result = data;
  }

  create() {
    const r = this.result;
    this.add.tileSprite(0, 0, GAME_W, GAME_H, 'road').setOrigin(0).setAlpha(0.3);
    this.add.image(0, 0, 'vignette_soft').setOrigin(0);
    const cx = GAME_W / 2;
    const head = title(this, cx, 150, r.won ? 'SURVIVED' : 'OVERRUN', 70, r.won ? CSS.toxic : CSS.red);
    label(this, cx, 214, r.won ? 'You reached the safe zone.' : 'The horde got your squad.', 20, CSS.muted);
    head.setScale(1.3).setAlpha(0);
    this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });

    const rows = [
      ['DISTANCE', `${r.meters} m`],
      ['KILLS', `${r.kills}`],
      ['BIGGEST SQUAD', `${r.squad ?? '-'}`],
      ['TIME', `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`],
      ['SCRAP EARNED', `+${r.scrap}`],
      ['SCORE', `${r.score}`],
      ['BEST', `${r.best}`],
    ];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(50, 270, GAME_W - 100, rows.length * 46 + 26, 12);
    rows.forEach(([k, v], i) => {
      const y = 296 + i * 46;
      label(this, 80, y, k, 20, CSS.muted, { originX: 0, bold: true });
      const val = label(this, GAME_W - 80, y, v, 26, k === 'SCORE' ? CSS.amber : CSS.bone, { originX: 1, bold: true });
      val.setAlpha(0);
      this.tweens.add({ targets: val, alpha: 1, delay: 300 + i * 90, duration: 200 });
    });
    if (r.newBest) {
      const nb = label(this, cx, 270 + rows.length * 46 + 52, '★  NEW BEST  ★', 22, CSS.amber, { bold: true });
      this.tweens.add({ targets: nb, scale: 1.08, yoyo: true, repeat: -1, duration: 500 });
    }

    const y = GAME_H - 236;
    this.retryBtn = new Button(this, cx, y, r.won ? 'DRIVE AGAIN' : 'RETRY', () => this.scene.start('Game'), { variant: 'primary', width: 320, height: 76, fontSize: 30 });
    new Button(this, cx, y + 92, 'GARAGE', () => this.scene.start('Garage'), { width: 320 });
    new Button(this, cx, y + 176, 'MAIN MENU', () => this.scene.start('Menu'), { width: 320, variant: 'ghost' });
    this.input.keyboard.on('keydown-ENTER', () => this.retryBtn.trigger());
    this.cameras.main.fadeIn(350, 0, 0, 0);
  }
}
