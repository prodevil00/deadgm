import * as Phaser from 'phaser';
import { GAME_W, GAME_H, ROAD, FONT, CSS, PALETTE } from '../config.js';
import { Road } from '../world/Road.js';
import { Squad } from '../entities/Squad.js';
import { Zombie } from '../entities/Zombie.js';
import { Pool } from '../systems/Pool.js';
import { Button, title, label } from '../ui/Button.js';
import { getSave, commit } from '../systems/save.js';
import { audio } from '../systems/Audio.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const save = getSave();
    this.starting = false;

    // animated backdrop: the truck idling down a dead road while walkers shamble in
    this.road = new Road(this);
    this.walkers = new Pool(() => new Zombie(this), 10);
    this.walkerTimer = 0.5;
    this.squad = new Squad(this, ROAD.center, 7);
    this.squad.y = 850;
    this.squad.countText.setVisible(false);
    this.squad.ring.setVisible(false);
    this.add.image(0, 0, 'vignette_soft').setOrigin(0).setDepth(950);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a0603, 0.5).setOrigin(0).setDepth(951);
    this.t = 0;

    // logo
    const logo = this.add.container(GAME_W / 2, 210).setDepth(960);
    const slash = this.add.graphics();
    slash.fillStyle(PALETTE.red, 1);
    slash.fillRect(-210, 46, 420, 6);
    slash.fillStyle(PALETTE.red, 0.5);
    slash.fillRect(-150, 56, 300, 3);
    const t1 = title(this, 0, -14, 'DEAD ROUTE', 76);
    const t2 = this.add.text(0, 92, 'S U R V I V A L', {
      fontFamily: FONT.ui, fontSize: '28px', fontStyle: '700', color: CSS.red, stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    logo.add([slash, t1, t2]);
    logo.setAlpha(0).setScale(1.08);
    this.tweens.add({ targets: logo, alpha: 1, scale: 1, duration: 700, ease: 'Cubic.easeOut' });
    this.logoTitle = t1;

    label(this, GAME_W / 2, 350, 'One road. One squad. Too many dead.', 20, CSS.muted).setDepth(960);

    // buttons
    const cx = GAME_W / 2;
    this.playBtn = new Button(this, cx, 470, 'PLAY', () => this.startGame(), { variant: 'primary', width: 320, height: 80, fontSize: 34 }).setDepth(970);
    this.garageBtn = new Button(this, cx, 572, 'GARAGE', () => this.go('Garage'), { width: 320 }).setDepth(970);
    this.settingsBtn = new Button(this, cx, 656, 'SETTINGS', () => this.scene.launch('Settings', { from: 'Menu' }), { width: 320 }).setDepth(970);
    [this.playBtn, this.garageBtn, this.settingsBtn].forEach((b, i) => {
      b.setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, y: b.y, duration: 350, delay: 250 + i * 90 });
    });

    // sound toggle (top right)
    this.soundBtn = new Button(this, GAME_W - 58, 50, save.settings.sound ? 'SOUND ON' : 'SOUND OFF', () => this.toggleSound(), {
      variant: 'ghost', width: 96, height: 56, fontSize: 15,
    }).setDepth(970);

    const stats = `BEST ${save.best}     ·     SCRAP ${save.scrap}     ·     WINS ${save.wins}`;
    this.statsText = label(this, cx, 760, stats, 18, CSS.bone, { bold: true }).setDepth(960);
    const hint = this.sys.game.device.input.touch ? 'Drag to move · your squad fires ahead' : 'A / D or ← → to move · squad fires ahead · P pause';
    label(this, cx, GAME_H - 40, hint, 15, CSS.muted).setDepth(960);

    this.input.keyboard.on('keydown-ENTER', () => { if (!this.scene.isActive('Settings')) this.playBtn.trigger(); });
    // scene-level emitters outlive a restart, so remove our handlers on shutdown
    const onResume = () => this.refresh();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  refresh() {
    const s = getSave();
    this.soundBtn.setLabel(s.settings.sound ? 'SOUND ON' : 'SOUND OFF');
    this.statsText.setText(`BEST ${s.best}     ·     SCRAP ${s.scrap}     ·     WINS ${s.wins}`);
  }

  toggleSound() {
    const s = getSave();
    s.settings.sound = !s.settings.sound;
    audio.setEnabled(s.settings.sound);
    commit();
    this.refresh();
  }

  go(key) {
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key));
  }

  startGame() {
    if (this.starting) return;
    this.starting = true;
    audio.unlock();
    this.go('Game');
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;
    this.road.update(dt, 110);
    this.squad.x = ROAD.center + Math.sin(this.t * 0.6) * 90;
    this.squad.update(dt);

    this.walkerTimer -= dt;
    if (this.walkerTimer <= 0) {
      this.walkerTimer = Phaser.Math.FloatBetween(0.8, 1.6);
      const z = this.walkers.obtain();
      if (z) z.spawn(Math.random() < 0.8 ? 'walker' : 'runner', Phaser.Math.Between(ROAD.left + 20, ROAD.right - 20), -40);
    }
    this.walkers.forEachActive((z) => {
      z.step(dt, 110, z.x, 2000);
      if (z.y > 700) z.setAlpha(Math.max(0, z.alpha - dt * 2));
      if (z.y > GAME_H + 60 || z.alpha <= 0) z.kill();
    });

    // flickering title like a failing neon sign
    this.logoTitle.setAlpha(Math.random() < 0.015 ? 0.55 : 1);
  }
}
