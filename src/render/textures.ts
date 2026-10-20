// Procedurally generated textures (drawn on canvases at startup). No image files needed.

import * as THREE from 'three';
import { Rng } from '../core/rng';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function tex(c: HTMLCanvasElement, repeat = false, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], rmin: number, rmax: number, rng: Rng) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rng.pick(colors);
    const r = rng.range(rmin, rmax);
    ctx.globalAlpha = rng.range(0.15, 0.6);
    ctx.fillRect(rng.next() * w, rng.next() * h, r, r);
  }
  ctx.globalAlpha = 1;
}

/** Asphalt with worn tyre tracks, cracks and painted lane markings. Tiles along v. */
export function roadTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = new Rng(11);
  ctx.fillStyle = '#4a4a4f';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 9000, ['#3b3b40', '#56565c', '#2f2f33', '#626168'], 1, 3, rng);
  // tyre wear bands
  for (const x of [0.17, 0.33, 0.67, 0.83]) {
    const g = ctx.createLinearGradient(W * (x - 0.05), 0, W * (x + 0.05), 0);
    g.addColorStop(0, 'rgba(20,20,24,0)');
    g.addColorStop(0.5, 'rgba(20,20,24,0.18)');
    g.addColorStop(1, 'rgba(20,20,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(W * (x - 0.05), 0, W * 0.1, H);
  }
  // cracks / patches
  ctx.strokeStyle = 'rgba(25,25,28,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = rng.next() * W, y = rng.next() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rng.range(-18, 18); y += rng.range(-18, 18); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(${rng.pick(['35,35,40', '70,70,74'])},0.35)`;
    ctx.fillRect(rng.next() * W, rng.next() * H, rng.range(20, 60), rng.range(14, 40));
  }
  // edge lines (solid) and lane dashes
  ctx.fillStyle = '#e9e4d6';
  ctx.fillRect(W * 0.035, 0, 9, H);
  ctx.fillRect(W * 0.965 - 9, 0, 9, H);
  ctx.fillStyle = '#efe9da';
  for (const x of [0.333, 0.667]) {
    ctx.globalAlpha = 0.9;
    ctx.fillRect(W * x - 4, H * 0.08, 8, H * 0.36);
    ctx.fillRect(W * x - 4, H * 0.58, 8, H * 0.36);
  }
  ctx.globalAlpha = 1;
  // paint wear
  speckle(ctx, W, H, 1500, ['#4a4a4f'], 1, 3, rng);
  return tex(c, true);
}

export function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = new Rng(23);
  ctx.fillStyle = '#d9b07a';
  ctx.fillRect(0, 0, S, S);
  // wind ripples
  for (let i = 0; i < 70; i++) {
    const y = rng.next() * S;
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(170,125,75,0.18)' : 'rgba(245,215,165,0.22)';
    ctx.lineWidth = rng.range(2, 5);
    ctx.beginPath();
    for (let x = -10; x <= S + 10; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 6);
    ctx.stroke();
  }
  speckle(ctx, S, S, 7000, ['#c79a62', '#e8c48f', '#b98c58', '#f0d3a2', '#a67c4d'], 1, 3, rng);
  return tex(c, true);
}

export function concreteTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = new Rng(31);
  ctx.fillStyle = '#b9b5ad';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 1500, ['#a29d94', '#cfcbc3', '#8f8a82'], 1, 2, rng);
  ctx.fillStyle = 'rgba(80,70,60,0.25)';
  ctx.fillRect(0, S * 0.82, S, S * 0.18);
  // hazard stripe band
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, S * 0.12, S, S * 0.14);
  ctx.clip();
  for (let x = -S; x < S * 2; x += 24) {
    ctx.fillStyle = '#e8b52a';
    ctx.beginPath();
    ctx.moveTo(x, S * 0.12); ctx.lineTo(x + 12, S * 0.12); ctx.lineTo(x + 12 - 18, S * 0.26); ctx.lineTo(x - 18, S * 0.26);
    ctx.fill();
  }
  ctx.restore();
  return tex(c, true);
}

export function woodTexture(): THREE.CanvasTexture {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = new Rng(41);
  const planks = 6;
  for (let i = 0; i < planks; i++) {
    const y = (i * H) / planks;
    ctx.fillStyle = rng.pick(['#a36a37', '#9a6232', '#ad7442', '#8f5a2c']);
    ctx.fillRect(0, y, W, H / planks);
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = 'rgba(60,32,12,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const yy = y + rng.next() * (H / planks);
      ctx.moveTo(0, yy);
      ctx.bezierCurveTo(W * 0.3, yy + rng.range(-3, 3), W * 0.6, yy + rng.range(-3, 3), W, yy + rng.range(-2, 2));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,20,8,0.6)';
    ctx.fillRect(0, y, W, 3);
  }
  // metal bands
  for (const yy of [0.14, 0.86]) {
    ctx.fillStyle = '#5a5a5e';
    ctx.fillRect(0, H * yy - 8, W, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, H * yy - 8, W, 3);
    for (let x = 12; x < W; x += 40) {
      ctx.fillStyle = '#2d2d30';
      ctx.beginPath(); ctx.arc(x, H * yy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  return tex(c, true);
}

export function polkaTexture(base: string, dot: string): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = dot;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    ctx.beginPath();
    ctx.arc((x + (y % 2) * 0.5) * (S / 4) + 8, y * (S / 4) + 16, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, true);
}

export function camoTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = new Rng(51);
  ctx.fillStyle = '#6b6a3f';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng.pick(['#4f5130', '#8a7a4a', '#3c3a26', '#7d7b4c']);
    ctx.beginPath();
    ctx.ellipse(rng.next() * S, rng.next() * S, rng.range(6, 18), rng.range(4, 10), rng.next() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, true);
}

export function rustTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = new Rng(61);
  ctx.fillStyle = '#7a4a2e';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 2500, ['#5b331e', '#9a5d36', '#3f2416', '#b07548', '#6d6b66'], 1, 4, rng);
  return tex(c, true);
}

/** Soft round sprite used for glows, muzzle flashes and smoke. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, false);
}

/** Star-shaped burst for muzzle flashes. */
export function flashTexture(): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.3, 'rgba(255,210,110,0.9)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? S / 2 : S / 7;
    const a = (i / 16) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.fill();
  return tex(c, false);
}

/** Blood splat / scorch decal. */
export function splatTexture(color: string, seed: number): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = new Rng(seed);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.22, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2, d = rng.range(S * 0.15, S * 0.45);
    ctx.globalAlpha = rng.range(0.4, 0.85);
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rng.range(3, 11), 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, false);
}

export function scorchTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(15,10,8,0.9)');
  g.addColorStop(0.55, 'rgba(30,22,16,0.55)');
  g.addColorStop(1, 'rgba(30,22,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return tex(c, false);
}

/** Gate glass panel: big number, sub label, glossy frame. Redrawn when the value changes. */
export class GateLabel {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  constructor() {
    [this.canvas, this.ctx] = canvas(256, 192);
    this.texture = tex(this.canvas);
  }
  draw(label: string, sub: string, color: number, cracked: boolean): void {
    const ctx = this.ctx, W = 256, H = 192;
    const col = new THREE.Color(color);
    const css = (a: number, k = 1) => `rgba(${Math.round(col.r * 255 * k)},${Math.round(col.g * 255 * k)},${Math.round(col.b * 255 * k)},${a})`;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(0.82, 1.15));
    g.addColorStop(0.55, css(0.62, 0.95));
    g.addColorStop(1, css(0.78, 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // glossy highlight
    const hl = ctx.createLinearGradient(0, 0, W, H);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    if (cracked) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      const cx = W * 0.72, cy = H * 0.3;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 22);
        ctx.lineTo(cx + Math.cos(a + 0.2) * 44, cy + Math.sin(a + 0.2) * 38);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = label.length > 4 ? 66 : 104;
    ctx.font = `${big}px Anton, Impact, "Arial Black", sans-serif`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = css(1, 0.35);
    ctx.strokeText(label, W / 2, H * 0.46);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, W / 2, H * 0.46);
    ctx.font = '600 22px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(sub, W / 2, H * 0.85);
    this.texture.needsUpdate = true;
  }
  dispose(): void { this.texture.dispose(); }
}

/** Number plate for crates (white numerals with dark outline, like the reference). */
export class NumberLabel {
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private last = '';
  constructor(private w = 192, private h = 128) {
    const [c, ctx] = canvas(w, h);
    this.ctx = ctx;
    this.texture = tex(c);
  }
  draw(text: string, color = '#ffffff', outline = '#3a2410'): void {
    if (text === this.last) return;
    this.last = text;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = text.length > 3 ? 70 : 96;
    ctx.font = `${size}px Anton, Impact, "Arial Black", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, this.w / 2, this.h / 2 + 4);
    ctx.fillStyle = color;
    ctx.fillText(text, this.w / 2, this.h / 2 + 4);
    this.texture.needsUpdate = true;
  }
  dispose(): void { this.texture.dispose(); }
}

/** Generic label sprite texture (e.g. "+4" above survivors). */
export function textTexture(text: string, color: string, size = 72): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px Anton, Impact, sans-serif`;
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,14,8,0.9)';
  ctx.strokeText(text, 128, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 68);
  return tex(c);
}
