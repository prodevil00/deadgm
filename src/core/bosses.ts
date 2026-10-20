// Boss definitions: health, phases and the attack pattern of each phase.

import type { EnemyType } from './enemies';

export type BossId = 'matron' | 'rothulk' | 'breaker' | 'queen';
export type BossAttackKind = 'summon' | 'slam' | 'spit' | 'throw' | 'charge';

export interface BossAttack {
  kind: BossAttackKind;
  cooldown: number;          // s between uses
  windup: number;            // telegraph time before it lands (s)
  count?: number;            // summon size / number of circles
  enemy?: EnemyType;         // summon type
  radius?: number;           // circle radius for spit/throw
}

export interface BossPhase {
  above: number;             // phase is active while hp fraction > above
  speed: number;             // walking speed toward the squad (m/s)
  caption: string;
  attacks: BossAttack[];
}

export interface BossLook {
  skin: number;
  outfit: number;
  outfitAlt: number;
  hair: number;
  accent: number;
  style: 'apron' | 'hulk' | 'armor' | 'queen';
}

export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  hp: number;
  scale: number;             // body height ≈ 1.75 * scale
  radius: number;            // hit radius (m)
  damageTaken: number;
  stompRadius: number;       // contact attack radius when it reaches the squad
  scrap: number;
  look: BossLook;
  phases: BossPhase[];
}

export const BOSSES: Record<BossId, BossDef> = {
  matron: {
    id: 'matron', name: 'THE MATRON', title: 'Queen of the Diner', hp: 24000, scale: 3.3, radius: 1.7,
    damageTaken: 1, stompRadius: 3, scrap: 60,
    look: { skin: 0xb98a72, outfit: 0xd8483a, outfitAlt: 0xf4eadc, hair: 0x6a3b2a, accent: 0xffd27a, style: 'apron' },
    phases: [
      { above: 0.6, speed: 0.95, caption: 'THE MATRON APPROACHES', attacks: [
        { kind: 'summon', cooldown: 6.5, windup: 0.9, count: 7, enemy: 'walker' },
      ] },
      { above: 0.25, speed: 1.05, caption: 'GROUND SLAM — DODGE THE RED LANE', attacks: [
        { kind: 'slam', cooldown: 4.6, windup: 1.5 },
        { kind: 'summon', cooldown: 8, windup: 0.9, count: 6, enemy: 'walker' },
      ] },
      { above: 0, speed: 1.6, caption: 'THE MATRON IS ENRAGED', attacks: [
        { kind: 'slam', cooldown: 3.2, windup: 1.25 },
        { kind: 'summon', cooldown: 7, windup: 0.8, count: 6, enemy: 'runner' },
      ] },
    ],
  },
  rothulk: {
    id: 'rothulk', name: 'ROT HULK', title: 'Failed Experiment #7', hp: 31000, scale: 3.8, radius: 1.9,
    damageTaken: 1, stompRadius: 3.2, scrap: 110,
    look: { skin: 0x7f9a5a, outfit: 0x3d4a3a, outfitAlt: 0xc9e36a, hair: 0x2c3326, accent: 0xa6ff4d, style: 'hulk' },
    phases: [
      { above: 0.65, speed: 1.0, caption: 'ROT HULK — KEEP FIRING', attacks: [
        { kind: 'summon', cooldown: 6, windup: 0.8, count: 6, enemy: 'runner' },
        { kind: 'spit', cooldown: 5, windup: 1.3, count: 2, radius: 1.6 },
      ] },
      { above: 0.3, speed: 1.15, caption: 'ACID STORM — KEEP MOVING', attacks: [
        { kind: 'spit', cooldown: 3.6, windup: 1.25, count: 3, radius: 1.6 },
        { kind: 'slam', cooldown: 5.5, windup: 1.4 },
      ] },
      { above: 0, speed: 1.7, caption: 'ROT HULK IS ENRAGED', attacks: [
        { kind: 'slam', cooldown: 3.4, windup: 1.2 },
        { kind: 'spit', cooldown: 4, windup: 1.15, count: 3, radius: 1.7 },
        { kind: 'summon', cooldown: 8, windup: 0.8, count: 5, enemy: 'walker' },
      ] },
    ],
  },
  breaker: {
    id: 'breaker', name: 'THE CONVOY BREAKER', title: 'Armoured Juggernaut', hp: 110000, scale: 3.9, radius: 2,
    damageTaken: 0.75, stompRadius: 3.3, scrap: 170,
    look: { skin: 0x9a7a66, outfit: 0x4b5258, outfitAlt: 0xb0b8bf, hair: 0x1f1f1f, accent: 0xffa62b, style: 'armor' },
    phases: [
      { above: 0.6, speed: 0.65, caption: 'INCOMING WRECKAGE — WATCH THE CIRCLES', attacks: [
        { kind: 'throw', cooldown: 4.4, windup: 1.45, count: 2, radius: 2 },
        { kind: 'summon', cooldown: 9, windup: 0.9, count: 5, enemy: 'armored' },
      ] },
      { above: 0.3, speed: 0.75, caption: 'CHARGE — LEAVE ITS LANE', attacks: [
        { kind: 'charge', cooldown: 5.2, windup: 1.55 },
        { kind: 'throw', cooldown: 5.5, windup: 1.4, count: 2, radius: 2 },
      ] },
      { above: 0, speed: 1.05, caption: 'THE BREAKER IS ENRAGED', attacks: [
        { kind: 'charge', cooldown: 3.9, windup: 1.35 },
        { kind: 'throw', cooldown: 4.2, windup: 1.3, count: 3, radius: 2 },
        { kind: 'summon', cooldown: 8, windup: 0.8, count: 6, enemy: 'runner' },
      ] },
    ],
  },
  queen: {
    id: 'queen', name: 'THE WASTELAND QUEEN', title: 'Mother of the Horde', hp: 190000, scale: 4.4, radius: 2.3,
    damageTaken: 0.85, stompRadius: 3.6, scrap: 300,
    look: { skin: 0xa88c8a, outfit: 0x5a1f4a, outfitAlt: 0xe8c45a, hair: 0x231018, accent: 0xff4dc4, style: 'queen' },
    phases: [
      { above: 0.75, speed: 0.7, caption: 'THE QUEEN RISES', attacks: [
        { kind: 'summon', cooldown: 6, windup: 0.9, count: 8, enemy: 'walker' },
        { kind: 'spit', cooldown: 5.4, windup: 1.35, count: 2, radius: 1.6 },
      ] },
      { above: 0.5, speed: 0.75, caption: 'PHASE 2 — SHOCKWAVES', attacks: [
        { kind: 'slam', cooldown: 4.4, windup: 1.4 },
        { kind: 'summon', cooldown: 8, windup: 0.9, count: 5, enemy: 'armored' },
      ] },
      { above: 0.2, speed: 0.85, caption: 'PHASE 3 — SHE THROWS THE CONVOY', attacks: [
        { kind: 'throw', cooldown: 4.2, windup: 1.35, count: 3, radius: 2 },
        { kind: 'charge', cooldown: 6.5, windup: 1.5 },
        { kind: 'summon', cooldown: 9, windup: 0.8, count: 6, enemy: 'runner' },
      ] },
      { above: 0, speed: 1.2, caption: 'FINAL FRENZY — HOLD THE LINE', attacks: [
        { kind: 'slam', cooldown: 3.2, windup: 1.15 },
        { kind: 'spit', cooldown: 3.8, windup: 1.15, count: 3, radius: 1.6 },
        { kind: 'summon', cooldown: 7, windup: 0.7, count: 6, enemy: 'runner' },
      ] },
    ],
  },
};
