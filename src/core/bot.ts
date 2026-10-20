// A simple steering AI that plays like a reasonable human. Used by the balance tests and the
// animated main-menu background. `skill` 0..1 controls how often it picks the best option.

import { ROAD_HALF } from './constants';
import { formationHalfWidth, leaderLimit } from './formation';
import { applyGate } from './gates';
import type { Simulation } from './sim';
import { Rng } from './rng';

export class Bot {
  private rng: Rng;
  private decided = new Map<number, number>(); // gate group -> chosen x
  private target = 0;
  private wobble = 0;

  constructor(private skill = 0.85, seed = 7) {
    this.rng = new Rng(seed);
  }

  update(sim: Simulation): number {
    const front = sim.squadZ;
    const n = sim.count;
    const half = formationHalfWidth(n);
    const lim = leaderLimit(n);
    let want = this.target;

    // 1. upcoming gate group (decide once per group)
    const nextGate = sim.gates.find((g) => !g.used && g.z > front && g.z - front < 26);
    if (nextGate) {
      const group = sim.gates.filter((g) => g.group === nextGate.group);
      if (!this.decided.has(nextGate.group)) {
        let best = group[0], bestScore = -Infinity;
        for (const g of group) {
          const score = this.scoreGate(sim, g.spec);
          if (score > bestScore) { bestScore = score; best = g; }
        }
        if (group.length > 1 && this.rng.next() > this.skill) best = group[Math.floor(this.rng.next() * group.length)];
        const cx = (best.xMin + best.xMax) / 2;
        this.decided.set(nextGate.group, Math.max(-lim, Math.min(lim, cx)));
      }
      want = this.decided.get(nextGate.group)!;
    } else {
      // 2. otherwise line up with a closed crate ahead, if not too close
      const crate = sim.crates.find((c) => c.state === 'closed' && c.z - front > 6 && c.z - front < 30);
      if (crate) want = crate.x;
      else want = sim.boss?.active ? sim.boss.x * 0.3 : 0;
    }

    // 3. never run into a closed crate that is about to be reached
    for (const c of sim.crates) {
      if (c.state !== 'closed') continue;
      const dz = c.z - front;
      if (dz > -2 && dz < 6 && Math.abs(c.x - want) < half + 0.9) want = c.x > 0 ? c.x - half - 1.1 : c.x + half + 1.1;
    }
    // 4. avoid walls, hazards and barrels in the near future
    const avoid = (x: number, w: number, z0: number, z1: number, margin = half + 0.25) => {
      if (z1 < front - 1 || z0 - front > 14) return;
      const minX = x - w / 2 - margin, maxX = x + w / 2 + margin;
      if (want > minX && want < maxX) {
        const left = minX, right = maxX;
        const canL = left >= -lim, canR = right <= lim;
        // stay on the side the squad is already on — never cut across an obstacle
        const preferLeft = front < z0 - 1 ? Math.abs(sim.squadX - left) < Math.abs(sim.squadX - right) : sim.squadX < x;
        if (canL && (!canR || preferLeft)) want = left;
        else if (canR) want = right;
      }
    };
    // walls / fire only need the leader clear: the formation squeezes past them
    for (const w of sim.walls) avoid(w.x, w.w, w.z - w.d / 2, w.z + w.d / 2, 0.9);
    for (const h of sim.hazards) avoid(h.x, h.w, h.z - h.d / 2, h.z + h.d / 2, 0.9);
    for (const b of sim.barrels) if (!b.exploded) avoid(b.x, 1.1, b.z - 0.5, b.z + 0.5);
    // 5. dodge telegraphed attacks
    const reaction = 0.3 + (1 - this.skill) * 0.7;
    for (const t of sim.telegraphs) {
      if (t.friendly || t.t < reaction) continue;
      const w = t.kind === 'strip' ? t.r * 2 : t.r * 2;
      const minX = t.x - w / 2 - half - 0.3, maxX = t.x + w / 2 + half + 0.3;
      if (want > minX && want < maxX) {
        const l = Math.max(-lim, minX), r = Math.min(lim, maxX);
        want = Math.abs(want - l) < Math.abs(want - r) && l > -lim + 0.01 ? l : r < lim - 0.01 ? r : l;
      }
    }
    this.wobble += 0.016;
    this.target = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, want + Math.sin(this.wobble * 1.3) * (1 - this.skill) * 0.6));
    return this.target;
  }

  private scoreGate(sim: Simulation, spec: Parameters<typeof applyGate>[0]): number {
    const out = applyGate(spec, { count: sim.count, weaponLevel: sim.weaponLevel, recruiterBonus: sim.mods.recruiterBonus });
    let s = out.count - sim.count;
    s += (out.weaponLevel - sim.weaponLevel) * Math.max(4, sim.count * 0.4);
    s += out.rateBonus * sim.count * 1.6 + out.dmgBonus * sim.count * 1.6;
    if (out.heal) s += 3 + sim.count * 0.1;
    if (spec.grow && spec.kind === 'add') s += 2;
    return s;
  }
}
