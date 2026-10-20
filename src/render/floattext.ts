// World-anchored floating text (damage numbers, "+3", gate labels) rendered as pooled DOM
// elements over the canvas. Crisp at any pixel ratio and cheap: ≤ 48 nodes, transform-only.

import * as THREE from 'three';

interface Item { el: HTMLDivElement; x: number; y: number; z: number; t: number; max: number; live: boolean; rise: number }

const tmp = new THREE.Vector3();

export class FloatText {
  private items: Item[] = [];
  constructor(layer: HTMLElement, private camera: THREE.Camera, capacity = 48) {
    for (let i = 0; i < capacity; i++) {
      const el = document.createElement('div');
      el.className = 'ft';
      el.style.display = 'none';
      layer.appendChild(el);
      this.items.push({ el, x: 0, y: 0, z: 0, t: 0, max: 1, live: false, rise: 1 });
    }
  }

  spawn(x: number, y: number, z: number, text: string, cls: string): void {
    let it = this.items.find((i) => !i.live);
    if (!it) it = this.items.reduce((a, b) => (a.t > b.t ? a : b));
    it.live = true;
    it.x = x; it.y = y; it.z = z; it.t = 0;
    it.max = cls.startsWith('dmg') ? 0.7 : 1.3;
    it.rise = cls.startsWith('dmg') ? 1.4 : 1.8;
    it.el.className = `ft ${cls}`;
    it.el.textContent = text;
    it.el.style.display = 'block';
  }

  update(dt: number, w: number, h: number): void {
    for (const it of this.items) {
      if (!it.live) continue;
      it.t += dt;
      if (it.t >= it.max) {
        it.live = false;
        it.el.style.display = 'none';
        continue;
      }
      const k = it.t / it.max;
      tmp.set(it.x, it.y + it.rise * k, it.z).project(this.camera);
      if (tmp.z > 1) { it.el.style.display = 'none'; continue; }
      const half = it.el.offsetWidth * 0.62;
      const px = Math.max(half + 6, Math.min(w - half - 6, (tmp.x * 0.5 + 0.5) * w)), py = (-tmp.y * 0.5 + 0.5) * h;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      it.el.style.display = 'block';
      it.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      it.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
    }
  }

  clear(): void {
    for (const it of this.items) { it.live = false; it.el.style.display = 'none'; }
  }
}
