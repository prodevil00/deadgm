import * as Phaser from 'phaser';
import { generateTextures } from '../art/textures.js';
import { getSave } from '../systems/save.js';
import { audio } from '../systems/Audio.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    audio.setEnabled(getSave().settings.sound);
    // first gesture anywhere unlocks Web Audio (browser autoplay policy)
    const unlock = () => audio.unlock();
    this.input.once('pointerdown', unlock);
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    this.scene.start('Menu');
  }
}
