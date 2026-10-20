import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, gateLabel, grownValue } from '../src/core/gates';
import { formationSlots, leaderLimit, formationHalfWidth } from '../src/core/formation';
import { MAX_SQUAD, ROAD_HALF, SOLDIER_SPACING } from '../src/core/constants';
import { weaponStats, sustainedDps, WEAPONS } from '../src/core/weapons';
import { runModifiers, emptyUpgrades, upgradeCost, UPGRADES } from '../src/core/upgrades';
import { defaultSave, loadSave, sanitize, writeSave, SAVE_KEY, resetProgress, type KeyValueStore } from '../src/core/save';
import { applyRun, buyUpgrade, computeRewards, currentMission, isUnlocked, unlockWeapon, type RunResult } from '../src/core/progression';
import { MISSIONS } from '../src/core/missions';
import { Simulation } from '../src/core/sim';
import type { MissionDef } from '../src/core/types';

const base = { count: 10, weaponLevel: 1, recruiterBonus: 0 };

test('gates: additive, multiplicative and penalties change the real count', () => {
  assert.equal(applyGate({ kind: 'add', value: 3 }, base).count, 13);
  assert.equal(applyGate({ kind: 'add', value: 5 }, base).count, 15);
  assert.equal(applyGate({ kind: 'add', value: -3 }, base).count, 7);
  assert.equal(applyGate({ kind: 'add', value: -1 }, base).count, 9);
  assert.equal(applyGate({ kind: 'mul', value: 2 }, base).count, 20);
  assert.equal(applyGate({ kind: 'mul', value: 3 }, base).count, 30);
  assert.equal(applyGate({ kind: 'add', value: -50 }, base).count, 0, 'never negative');
  assert.equal(applyGate({ kind: 'mul', value: 3 }, { ...base, count: 120 }).count, MAX_SQUAD, 'capped');
});

test('gates: recruiter bonus applies only to positive add gates', () => {
  const r = { ...base, recruiterBonus: 2 };
  assert.equal(applyGate({ kind: 'add', value: 3 }, r).count, 15);
  assert.equal(applyGate({ kind: 'add', value: -3 }, r).count, 7);
  assert.equal(applyGate({ kind: 'mul', value: 2 }, r).count, 20);
});

test('gates: weapon / heal / rate / dmg', () => {
  assert.equal(applyGate({ kind: 'weapon', value: 1 }, base).weaponLevel, 2);
  assert.equal(applyGate({ kind: 'weapon', value: 9 }, base).weaponLevel, 6, 'max level');
  const h = applyGate({ kind: 'heal', value: 5 }, base);
  assert.equal(h.heal, true); assert.equal(h.shield, 5); assert.equal(h.count, 10);
  assert.equal(applyGate({ kind: 'rate', value: 25 }, base).rateBonus, 0.25);
  assert.equal(applyGate({ kind: 'dmg', value: 30 }, base).dmgBonus, 0.3);
});

test('gates: labels match effects; growing gates step and cap', () => {
  assert.equal(gateLabel({ kind: 'add', value: 3 }), '+3');
  assert.equal(gateLabel({ kind: 'add', value: -3 }), '-3');
  assert.equal(gateLabel({ kind: 'mul', value: 2 }), '×2');
  const g = { kind: 'add' as const, value: -4, grow: 4, max: 6 };
  assert.equal(grownValue(g, -4, 3), -4);
  assert.equal(grownValue(g, -4, 4), -3);
  assert.equal(grownValue(g, -4, 40), 6);
});

test('formation: n slots, no overlap, stays on the road', () => {
  for (const n of [1, 2, 5, 13, 40, 77, MAX_SQUAD]) {
    const s = formationSlots(n);
    assert.equal(s.length, n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z);
      assert.ok(d >= SOLDIER_SPACING * 0.7, `overlap n=${n} d=${d}`);
    }
    assert.ok(leaderLimit(n) < ROAD_HALF);
    assert.ok(formationHalfWidth(n) <= ROAD_HALF);
  }
});

test('weapons: levels and multipliers scale damage', () => {
  const a = weaponStats('rifle', 1), b = weaponStats('rifle', 3, 1.5, 1.2);
  assert.ok(b.damage > a.damage * 1.5);
  assert.ok(b.rate > a.rate);
  for (const id of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]) assert.ok(sustainedDps(id, 1) > 0);
  assert.ok(sustainedDps('hmg', 1) > sustainedDps('rifle', 1));
});

test('upgrades: modifiers and costs', () => {
  const lv = emptyUpgrades();
  assert.equal(runModifiers(lv).startSquad, 3);
  lv.squad = 2; lv.damage = 5;
  const m = runModifiers(lv);
  assert.equal(m.startSquad, 5);
  assert.ok(Math.abs(m.dmgMult - 1.4) < 1e-9);
  assert.equal(upgradeCost('recruiter', 3), null);
  for (const u of Object.values(UPGRADES)) assert.equal(u.costs.length, u.max);
});

class MemStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

test('save: round-trips, survives corrupt and hostile data', () => {
  const st = new MemStore();
  const d = defaultSave();
  d.scrap = 321; d.upgrades.damage = 3; d.missions[1] = { cleared: true, stars: 2, best: 14 };
  assert.ok(writeSave(st, d));
  const l = loadSave(st);
  assert.equal(l.scrap, 321); assert.equal(l.upgrades.damage, 3); assert.equal(l.missions[1].stars, 2);

  st.setItem(SAVE_KEY, '{not json');
  assert.equal(loadSave(st).scrap, 0);
  assert.ok(st.getItem(`${SAVE_KEY}.corrupt`));

  const bad = sanitize({ scrap: -5, upgrades: { damage: 999, squad: 'x' }, weapons: { rifle: false, hmg: 'yes' }, loadout: 'hmg', missions: { 1: { stars: 9 }, abc: {} }, settings: { master: 7, quality: 'ultra' } });
  assert.equal(bad.scrap, 0);
  assert.equal(bad.upgrades.damage, UPGRADES.damage.max);
  assert.equal(bad.upgrades.squad, 0);
  assert.equal(bad.weapons.rifle, true);
  assert.equal(bad.weapons.hmg, false);
  assert.equal(bad.loadout, 'rifle', 'cannot equip a locked weapon');
  assert.equal(bad.missions[1].stars, 3);
  assert.equal(bad.settings.master, 1);
  assert.equal(bad.settings.quality, 'auto');
  assert.equal(loadSave(null).scrap, 0);

  const r = resetProgress(st, { ...d.settings, muted: true });
  assert.equal(r.scrap, 0); assert.equal(r.settings.muted, true);
});

test('progression: rewards, replays, unlocks and purchases', () => {
  const save = defaultSave();
  const m = MISSIONS[0];
  const win: RunResult = { missionId: 1, won: true, reason: null, kills: 30, killScrap: 30, bonusScrap: 0, survivors: 25, peakSquad: 30, time: 50, bossKilled: false };
  assert.equal(isUnlocked(save, 2), false);
  const r1 = applyRun(save, m, win);
  assert.equal(r1.firstClear, true);
  assert.equal(r1.starsEarned, 3);
  assert.equal(save.scrap, r1.total);
  assert.equal(isUnlocked(save, 2), true);
  assert.equal(currentMission(save, MISSIONS).id, 2);
  const r2 = computeRewards(m, win, save);
  assert.equal(r2.mission, Math.round(m.reward / 2), 'replay pays half');
  const lose = computeRewards(m, { ...win, won: false, reason: 'wiped' }, save);
  assert.equal(lose.mission, 0); assert.ok(lose.kills > 0 && lose.kills < 30);

  save.scrap = 1000;
  assert.ok(buyUpgrade(save, 'squad'));
  assert.equal(save.upgrades.squad, 1);
  assert.equal(save.scrap, 1000 - UPGRADES.squad.costs[0]);
  save.scrap = 0;
  assert.equal(buyUpgrade(save, 'squad'), false, 'cannot afford');
  save.scrap = 200;
  assert.ok(unlockWeapon(save, 'shotgun'));
  assert.equal(unlockWeapon(save, 'shotgun'), false, 'no double unlock');
});

test('missions: 10 valid, ordered, distinct missions', () => {
  assert.equal(MISSIONS.length, 10);
  MISSIONS.forEach((m, i) => {
    assert.equal(m.id, i + 1);
    assert.ok(m.events.length >= 10, `${m.title} has content`);
    for (const e of m.events) assert.ok(e.z > 0 && e.z < m.length + 1, `${m.title} event inside length`);
    if (m.objective.type === 'boss') assert.ok(m.boss);
    assert.ok(m.stars[0] < m.stars[1]);
  });
  assert.equal(new Set(MISSIONS.map((m) => m.title)).size, 10);
  assert.equal(MISSIONS[9].boss, 'queen');
});

// ---------------------------------------------------------------- simulation

const tiny = (events: MissionDef['events'], extra: Partial<MissionDef> = {}): MissionDef => ({
  id: 99, title: 't', tagline: '', intro: '', objective: { type: 'reach' }, difficulty: 1, length: 60, speed: 8,
  enemyHp: 1, reward: 10, stars: [1, 2], time: 'noon', seed: 1, introduces: [], events, ...extra,
});

const mods = (startSquad = 5) => ({ ...runModifiers(emptyUpgrades()), startSquad });

function run(sim: Simulation, steer: number | ((s: Simulation) => number), maxT = 120) {
  const evs = [];
  while (!sim.ended && sim.time < maxT) {
    sim.setSteer(typeof steer === 'number' ? steer : steer(sim));
    sim.step();
    evs.push(...sim.drainEvents());
  }
  return evs;
}

test('sim: passing a gate changes the real squad exactly once', () => {
  const sim = new Simulation(tiny([{ type: 'gates', z: 20, gates: { L: { kind: 'add', value: 3 }, R: { kind: 'mul', value: 2 } } }]), mods(5));
  const evs = run(sim, 3);
  const gateEvs = evs.filter((e) => e.t === 'gate');
  assert.equal(gateEvs.length, 1);
  assert.equal(sim.count, 10);
  assert.equal(sim.phase, 'won');
});

test('sim: left gate picks the left option', () => {
  const sim = new Simulation(tiny([{ type: 'gates', z: 20, gates: { L: { kind: 'add', value: 3 }, R: { kind: 'mul', value: 2 } } }]), mods(5));
  run(sim, -3);
  assert.equal(sim.count, 8);
});

test('sim: penalty gate removes soldiers and can wipe the squad', () => {
  const sim = new Simulation(tiny([{ type: 'gates', z: 20, gates: { C: { kind: 'add', value: -9 } } }]), mods(5));
  const evs = run(sim, 0);
  assert.equal(sim.count, 0);
  assert.equal(sim.phase, 'lost');
  assert.equal(evs.filter((e) => e.t === 'end').length, 1, 'single end event');
  assert.equal(sim.result?.reason, 'wiped');
});

test('sim: soldiers shoot and kill zombies, earning scrap', () => {
  const sim = new Simulation(tiny([{ type: 'horde', z: 40, count: 6, mix: { walker: 1 } }], { length: 90 }), mods(8));
  run(sim, 0);
  assert.ok(sim.kills >= 4, `kills ${sim.kills}`);
  assert.ok(sim.killScrap >= 4);
  assert.equal(sim.phase, 'won');
});

test('sim: zombies that reach the squad deal damage', () => {
  const m = tiny([{ type: 'horde', z: 14, count: 30, mix: { walker: 1 } }], { length: 40, enemyHp: 30 });
  const sim = new Simulation(m, mods(3));
  run(sim, 0);
  assert.equal(sim.phase, 'lost');
});

test('sim: shooting a crate opens it and grants its reward', () => {
  const sim = new Simulation(tiny([{ type: 'crate', z: 30, x: 0, hits: 6, reward: { kind: 'weapon', weapon: 'hmg' } }], { length: 80 }), mods(4));
  let opened = false;
  run(sim, (s) => { if (s.crates[0].state === 'open') opened = true; return s.crates[0].state === 'closed' && s.crates[0].z - s.squadZ < 4 ? 3 : 0; });
  assert.ok(opened);
  assert.equal(sim.weapon, 'hmg');
});

test('sim: walking into a closed crate crushes soldiers', () => {
  const sim = new Simulation(tiny([{ type: 'crate', z: 12, x: 0, hits: 9999, reward: { kind: 'scrap', n: 10 } }], { length: 40 }), mods(6));
  run(sim, 0);
  assert.ok(sim.count < 6);
  assert.equal(sim.crates[0].state, 'smashed');
});

test('sim: survivors objective fails when too few arrive', () => {
  const sim = new Simulation(tiny([], { objective: { type: 'survivors', count: 10 } }), mods(5));
  run(sim, 0);
  assert.equal(sim.phase, 'lost');
  assert.equal(sim.result?.reason, 'survivors');
});

test('sim: boss fight starts, phases advance, and the boss can be defeated', () => {
  const m = tiny([], { length: 40, boss: 'matron', bossHp: 0.25, objective: { type: 'boss' } });
  const sim = new Simulation(m, { ...mods(40), dmgMult: 2 });
  const evs = run(sim, 0, 200);
  assert.ok(evs.some((e) => e.t === 'bossStart'));
  assert.ok(evs.some((e) => e.t === 'bossPhase'));
  assert.ok(evs.some((e) => e.t === 'bossDead'));
  assert.equal(sim.phase, 'won');
  assert.ok(sim.result?.bossKilled);
});

test('sim: no damage events after the run ends', () => {
  const m = tiny([{ type: 'horde', z: 50, count: 20, mix: { walker: 1 } }], { length: 45 });
  const sim = new Simulation(m, mods(5));
  run(sim, 0);
  assert.ok(sim.ended);
  const before = sim.count;
  for (let i = 0; i < 600; i++) sim.step();
  assert.equal(sim.count, before);
  assert.equal(sim.drainEvents().filter((e) => e.t === 'end' || e.t === 'soldierDown').length, 0);
});

test('sim: deterministic for the same seed and inputs', () => {
  const a = new Simulation(MISSIONS[2], mods(6));
  const b = new Simulation(MISSIONS[2], mods(6));
  const steer = (s: Simulation) => Math.sin(s.time * 0.8) * 3;
  run(a, steer); run(b, steer);
  assert.equal(a.count, b.count); assert.equal(a.kills, b.kills); assert.equal(a.phase, b.phase);
});

test('sim: soldiers always stay on the road, even when hugging the rail', () => {
  const sim = new Simulation(tiny([{ type: 'gates', z: 10, gates: { C: { kind: 'mul', value: 3 } } }], { length: 50 }), mods(30));
  while (!sim.ended) {
    sim.setSteer(sim.time % 4 < 2 ? 9 : -9);
    sim.step();
    for (const s of sim.soldiers) assert.ok(Math.abs(s.x) <= ROAD_HALF, `soldier x ${s.x}`);
  }
});

test('sim: bounded entity counts', () => {
  const sim = new Simulation(MISSIONS[9], { ...mods(60), dmgMult: 3 });
  let maxE = 0, maxB = 0;
  while (!sim.ended && sim.time < 200) {
    sim.setSteer(0); sim.step(); sim.drainEvents();
    maxE = Math.max(maxE, sim.enemies.length); maxB = Math.max(maxB, sim.bulletCount);
  }
  assert.ok(maxE <= 160 && maxB <= 520, `${maxE} ${maxB}`);
});
