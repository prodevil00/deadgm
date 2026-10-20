// Permanent garage upgrades bought with scrap between runs.

export const UPGRADES = [
  { id: 'armor', name: 'RECRUITS', desc: '+1 soldier at the start', max: 5, baseCost: 40 },
  { id: 'damage', name: 'HEAVY ROUNDS', desc: '+15% bullet damage', max: 5, baseCost: 50 },
  { id: 'rate', name: 'GREASED BOLT', desc: '+10% fire rate', max: 5, baseCost: 50 },
];

export function upgradeCost(def, level) {
  if (level >= def.max) return Infinity;
  return Math.round(def.baseCost * Math.pow(1.6, level));
}

// Converts saved upgrade levels into run-start stats.
export function statsFromUpgrades(levels = {}) {
  const armor = levels.armor || 0;
  const damage = levels.damage || 0;
  const rate = levels.rate || 0;
  return {
    maxHp: 100 + armor * 20,
    startSquad: 1 + armor,
    damageMul: 1 + damage * 0.15,
    rateMul: 1 + rate * 0.1,
  };
}

// In-run gate choices. `apply` mutates the run modifiers object.
export const GATE_EFFECTS = {
  damage: { label: 'DAMAGE\n+30%', color: 0xe8412c, apply: (m) => { m.damageMul *= 1.3; } },
  rate: { label: 'FIRE RATE\n+25%', color: 0xffb02e, apply: (m) => { m.rateMul *= 1.25; } },
  barrel: { label: 'EXTRA\nBARREL', color: 0x5fb3ff, apply: (m) => { m.barrels = Math.min(m.barrels + 1, 4); } },
  repair: { label: 'REPAIR\n+35', color: 0x9fd356, apply: (m) => { m.heal += 35; } },
  plating: { label: 'MAX HP\n+25', color: 0xc9c2b0, apply: (m) => { m.maxHpBonus += 25; m.heal += 25; } },
  blood: { label: 'BLOOD MONEY\n+40 SCRAP\nHORDE!', color: 0x8a1414, apply: (m) => { m.scrap += 40; m.horde = true; } },
};

// Pick two distinct gate effects. Never offers "barrel" once maxed.
export function rollGatePair(mods, rand = Math.random) {
  const pool = Object.keys(GATE_EFFECTS).filter((k) => !(k === 'barrel' && mods.barrels >= 4));
  const a = pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const b = pool[Math.floor(rand() * pool.length)];
  return [a, b];
}
