// Enemy archetypes. Behaviour is implemented in sim.ts; this file is the data.

export type EnemyType = 'walker' | 'runner' | 'armored' | 'heavy' | 'elite';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  desc: string;
  hp: number;
  speed: number;          // chase speed m/s
  aggro: number;          // starts chasing when the squad is this close (m)
  radius: number;         // collision radius
  scale: number;          // render scale
  damageTaken: number;    // multiplier on incoming damage (armour)
  contactDamage: number;  // damage dealt to the soldier it reaches
  scrap: number;
  threat: number;         // targeting priority bonus (m)
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  walker: {
    type: 'walker', name: 'Walker', desc: 'Slow and weak, but never alone.',
    hp: 22, speed: 1.6, aggro: 30, radius: 0.36, scale: 1, damageTaken: 1, contactDamage: 10, scrap: 1, threat: 0,
  },
  runner: {
    type: 'runner', name: 'Runner', desc: 'Sprints at the squad from far away. Low health.',
    hp: 15, speed: 5.4, aggro: 44, radius: 0.33, scale: 0.94, damageTaken: 1, contactDamage: 10, scrap: 1, threat: 6,
  },
  armored: {
    type: 'armored', name: 'Riot Zombie', desc: 'Plated gear absorbs over half of all damage.',
    hp: 60, speed: 1.3, aggro: 30, radius: 0.42, scale: 1.12, damageTaken: 0.45, contactDamage: 20, scrap: 3, threat: 3,
  },
  heavy: {
    type: 'heavy', name: 'Mutant', desc: 'Huge and tough. Telegraphs a ground slam once it reaches you.',
    hp: 800, speed: 1.7, aggro: 36, radius: 0.95, scale: 2.1, damageTaken: 1, contactDamage: 60, scrap: 16, threat: 10,
  },
  elite: {
    type: 'elite', name: 'Spitter', desc: 'Keeps its distance and lobs acid. Watch the red circles.',
    hp: 190, speed: 2.4, aggro: 40, radius: 0.55, scale: 1.25, damageTaken: 1, contactDamage: 30, scrap: 8, threat: 14,
  },
};

export const HEAVY_SLAM = { windup: 0.95, radius: 2.1, damage: 60, cooldown: 1.7 };
export const ELITE_SPIT = { hold: 13, cooldown: 3.4, windup: 1.25, radius: 1.45, damage: 40 };
