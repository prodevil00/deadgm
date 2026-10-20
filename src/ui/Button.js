import * as Phaser from 'phaser';
import { FONT } from '../config.js';
import { audio } from '../systems/Audio.js';

const STYLES = {
  primary: { fill: 0xe8412c, hover: 0xff5a3f, press: 0xb82f1f, edge: 0xffb39f, text: '#fff6ee' },
  secondary: { fill: 0x1b1f24, hover: 0x262b32, press: 0x111418, edge: 0x4a525c, text: '#e8e2d0' },
  ghost: { fill: 0x0d0f12, hover: 0x1b1f24, press: 0x08090b, edge: 0x2f353c, text: '#b9b4a6' },
};

// A real interactive button: hover, press, disabled states, and a minimum touch target.
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, label, onClick, opts = {}) {
    super(scene, x, y);
    this.w = opts.width || 300;
    this.h = Math.max(opts.height || 68, 56);
    this.style = STYLES[opts.variant || 'secondary'];
    this.onClick = onClick;
    this.enabledState = true;
    this.isDown = false;

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, label, {
      fontFamily: FONT.ui,
      fontSize: `${opts.fontSize || 28}px`,
      fontStyle: '600',
      color: this.style.text,
      align: 'center',
    }).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.draw('idle');

    this.setSize(this.w, this.h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabledState && this.draw('hover'));
    this.on('pointerout', () => { this.isDown = false; this.draw('idle'); this.setScale(1); });
    this.on('pointerdown', (p, lx, ly, event) => {
      if (!this.enabledState) return;
      event?.stopPropagation?.();
      this.isDown = true;
      this.draw('press');
      this.setScale(0.97);
    });
    this.on('pointerup', (p, lx, ly, event) => {
      event?.stopPropagation?.();
      if (!this.isDown || !this.enabledState) return;
      this.isDown = false;
      this.setScale(1);
      this.draw('hover');
      audio.unlock();
      audio.ui();
      this.onClick?.();
    });
    scene.add.existing(this);
  }

  draw(state) {
    const s = this.style;
    const fill = !this.enabledState ? 0x15181c : state === 'hover' ? s.hover : state === 'press' ? s.press : s.fill;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-this.w / 2 + 3, -this.h / 2 + 5, this.w, this.h, 10);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
    g.lineStyle(2, this.enabledState ? s.edge : 0x2a2f35, state === 'hover' ? 1 : 0.6);
    g.strokeRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 10);
    // stencil notch accent
    g.fillStyle(this.enabledState ? s.edge : 0x2a2f35, 0.5);
    g.fillRect(-this.w / 2 + 12, -this.h / 2 + 8, 4, this.h - 16);
    this.label.setAlpha(this.enabledState ? 1 : 0.4);
  }

  setLabel(text) {
    this.label.setText(text);
    return this;
  }

  setEnabled(on) {
    this.enabledState = on;
    this.draw('idle');
    return this;
  }

  // Lets keyboard users trigger the button.
  trigger() {
    if (!this.enabledState) return;
    audio.unlock();
    audio.ui();
    this.onClick?.();
  }
}

// Shared title text treatment.
export function title(scene, x, y, text, size = 64, color = '#e8e2d0') {
  return scene.add.text(x, y, text, {
    fontFamily: FONT.display,
    fontSize: `${size}px`,
    color,
    stroke: '#050607',
    strokeThickness: Math.round(size / 9),
    align: 'center',
  }).setOrigin(0.5).setShadow(0, 6, '#000000', 12, true, true);
}

export function label(scene, x, y, text, size = 22, color = '#b9b4a6', opts = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: FONT.ui,
    fontSize: `${size}px`,
    color,
    align: opts.align || 'center',
    fontStyle: opts.bold ? '600' : 'normal',
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
    lineSpacing: opts.lineSpacing || 4,
  }).setOrigin(opts.originX ?? 0.5, opts.originY ?? 0.5);
}
