import * as Phaser from 'phaser';
import { GAME_W, GAME_H } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GarageScene } from './scenes/GarageScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PauseScene, SettingsScene, ResultScene } from './scenes/OverlayScenes.js';

// Wait (briefly) for the web fonts so Phaser text renders with the right typeface.
// If fonts are blocked or offline, the CSS fallbacks are used after the timeout.
async function fontsReady(timeoutMs = 2500) {
  if (!document.fonts?.load) return;
  const load = Promise.all([
    document.fonts.load('40px "Black Ops One"'),
    document.fonts.load('600 20px "Oswald"'),
    document.fonts.load('700 20px "Oswald"'),
  ]).catch(() => {});
  await Promise.race([load, new Promise((r) => setTimeout(r, timeoutMs))]);
}

async function start() {
  await fontsReady();
  document.getElementById('loading')?.remove();
  // ?renderer=canvas forces the Canvas renderer (fallback for weak GPUs / debugging)
  const forceCanvas = new URLSearchParams(location.search).get('renderer') === 'canvas';
  const game = new Phaser.Game({
    type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0d0f12',
    pixelArt: false,
    antialias: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_W,
      height: GAME_H,
    },
    input: { activePointers: 3 },
    fps: { target: 60, smoothStep: true },
    scene: [BootScene, MenuScene, GarageScene, GameScene, PauseScene, SettingsScene, ResultScene],
  });
  // handle for automated browser tests and debugging in the console
  window.__DEADROUTE = game;
}

start();
