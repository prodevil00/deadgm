// Gate rules — pure functions so the exact effect of every gate can be unit-tested.

import { MAX_SQUAD, WEAPON_MAX_LEVEL } from './constants';
import type { GateSpec } from './types';

export interface GateInput {
  count: number;
  weaponLevel: number;
  recruiterBonus: number; // permanent upgrade: extra soldiers on every positive "+" gate
}

export interface GateOutcome {
  count: number;
  weaponLevel: number;
  shield: number;   // seconds of shield granted
  heal: boolean;
  rateBonus: number; // additive fraction, e.g. 0.2
  dmgBonus: number;
}

export function applyGate(g: GateSpec, s: GateInput): GateOutcome {
  const out: GateOutcome = { count: s.count, weaponLevel: s.weaponLevel, shield: 0, heal: false, rateBonus: 0, dmgBonus: 0 };
  switch (g.kind) {
    case 'add':
      out.count = g.value > 0 ? s.count + g.value + s.recruiterBonus : s.count + g.value;
      break;
    case 'mul':
      out.count = Math.floor(s.count * g.value);
      break;
    case 'weapon':
      out.weaponLevel = Math.min(WEAPON_MAX_LEVEL, s.weaponLevel + g.value);
      break;
    case 'heal':
      out.heal = true;
      out.shield = g.value;
      break;
    case 'rate':
      out.rateBonus = g.value / 100;
      break;
    case 'dmg':
      out.dmgBonus = g.value / 100;
      break;
  }
  out.count = Math.max(0, Math.min(MAX_SQUAD, out.count));
  return out;
}

export function gateLabel(g: GateSpec): string {
  switch (g.kind) {
    case 'add': return g.value >= 0 ? `+${g.value}` : `${g.value}`;
    case 'mul': return `×${g.value}`;
    case 'weapon': return `GUN +${g.value}`;
    case 'heal': return 'SHIELD';
    case 'rate': return `RATE +${g.value}%`;
    case 'dmg': return `DMG +${g.value}%`;
  }
}

export function gateSubLabel(g: GateSpec): string {
  switch (g.kind) {
    case 'add': return g.value >= 0 ? 'SOLDIERS' : 'LOSE SOLDIERS';
    case 'mul': return 'MULTIPLY SQUAD';
    case 'weapon': return 'WEAPON LEVEL';
    case 'heal': return `HEAL + ${g.value}s SHIELD`;
    case 'rate': return 'FIRE RATE';
    case 'dmg': return 'DAMAGE';
  }
}

export function isGoodGate(g: GateSpec): boolean {
  return !(g.kind === 'add' && g.value < 0);
}

/** Colour key used by the renderer and UI. */
export function gateColor(g: GateSpec): number {
  switch (g.kind) {
    case 'add': return g.value >= 0 ? 0x2f7dff : 0xff3b3b;
    case 'mul': return g.value >= 3 ? 0xffb21f : 0xffd93b;
    case 'weapon': return 0xff4fb8;
    case 'heal': return 0x3fe07a;
    case 'rate': return 0x9b5bff;
    case 'dmg': return 0xff7a1f;
  }
}

/** Value after `hits` bullet hits on a growing gate. */
export function grownValue(g: GateSpec, base: number, hits: number): number {
  if (!g.grow) return base;
  const steps = Math.floor(hits / g.grow);
  const max = g.max ?? (g.kind === 'add' ? 9 : g.kind === 'weapon' ? 3 : base);
  return Math.min(max, base + steps);
}
