// Touch steering: press anywhere and drag horizontally. Relative drag — the finger never
// has to cover the squad. Only the first active pointer steers; cancels are handled.

import { ROAD_HALF } from '../core/constants';

export class SteerInput {
  target = 0;             // desired squad x (m)
  active = false;
  touched = false;        // has the player touched at least once this run
  enabled = false;
  private pointerId: number | null = null;
  private startX = 0;
  private startTarget = 0;
  private sensitivity = 1;
  private keys = { left: false, right: false };

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('blur', this.reset);
    // keyboard is a development convenience only — the game is designed for touch
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.key);
  }

  /** Full road width maps to ~72 % of the stage width. */
  setStageWidth(px: number): void {
    this.sensitivity = (ROAD_HALF * 2) / Math.max(200, px * 0.72);
  }

  resetTo(x: number): void {
    this.target = x;
    this.reset();
    this.touched = false;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startTarget = this.target;
    this.active = true;
    this.touched = true;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  };

  private move = (e: PointerEvent) => {
    if (!this.enabled || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    // the camera looks down +z, so world +x is on the LEFT of the screen: invert the drag
    const dx = e.clientX - this.startX;
    const t = this.startTarget - dx * this.sensitivity;
    this.target = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, t));
    // re-anchor when clamped so reversing direction responds immediately
    if (t !== this.target) { this.startX = e.clientX; this.startTarget = this.target; }
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.reset();
  };

  private reset = () => {
    this.pointerId = null;
    this.active = false;
  };

  private key = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    if (e.key === 'ArrowLeft' || e.key === 'a') this.keys.left = down;
    if (e.key === 'ArrowRight' || e.key === 'd') this.keys.right = down;
  };

  /** Per-frame update for keyboard steering (dev only). */
  tick(dt: number): void {
    if (!this.enabled) return;
    const k = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    if (k) {
      this.touched = true;
      this.target = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, this.target + k * 11 * dt));
    }
  }
}

export function haptic(pattern: number | number[], enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch { /* unsupported (e.g. iOS Safari) — haptics are optional */ }
}

export const hapticsSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
