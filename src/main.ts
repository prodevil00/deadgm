// Entry point: loading screen, WebGL check, game boot, service worker registration.

import './ui/styles.css';
import { Game } from './app/game';

declare const __DEV__: boolean | undefined;
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;
const loading = document.getElementById('loading')!;
const fill = document.getElementById('loadfill')!;
const label = document.getElementById('loadtxt')!;

function progress(p: number, text: string): void {
  fill.style.width = `${Math.round(p * 100)}%`;
  label.textContent = text;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function start(): Promise<void> {
  // stop iOS double-tap zoom / pinch gestures from scrolling the page
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  if (!webglAvailable()) {
    progress(1, 'WEBGL NOT AVAILABLE');
    label.style.color = '#ff8a7a';
    label.insertAdjacentHTML('afterend', '<div class="muted" style="max-width:280px;text-align:center;font-weight:700">Your browser has WebGL disabled. Please update Safari / Chrome or enable hardware acceleration.</div>');
    return;
  }
  const game = new Game(stage, ui, __APP_VERSION__);
  (window as unknown as { __game: Game }).__game = game;
  try {
    await game.boot(progress);
  } catch (err) {
    console.error(err);
    progress(1, 'FAILED TO START');
    label.style.color = '#ff8a7a';
    return;
  }
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 450);

  if (!isDev && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

void start();
