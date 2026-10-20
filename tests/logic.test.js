// Run with: npm test   (uses Node's built-in test runner — no extra dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { circlesOverlap, segmentHitsCircle, circleHitsBox, segmentHitsBox, clamp } from '../src/systems/collision.js';
import { scrollSpeed, spawnInterval, pickZombieType, groupSize, maxAliveZombies } from '../src/systems/difficulty.js';
import { UPGRADES, upgradeCost, statsFromUpgrades, rollGatePair, GATE_EFFECTS } from '../src/systems/upgrades.js';
import { loadSave, writeSave, DEFAULT_SAVE } from '../src/systems/save.js';
import { Pool } from '../src/systems/Pool.js';
import { LEVEL, STORAGE_KEY } from '../src/config.js';

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('circle overlap', () => {
  assert.equal(circlesOverlap(0, 0, 10, 15, 0, 6), true);
  assert.equal(circlesOverlap(0, 0, 10, 17, 0, 6), false);
});

test('swept bullet test catches tunnelling', () => {
  // bullet jumps from y=100 to y=0 in one frame; target at y=50 is between
  assert.equal(segmentHitsCircle(0, 100, 0, 0, 0, 50, 5), true);
  assert.equal(segmentHitsCircle(0, 100, 0, 0, 20, 50, 5), false);
  // zero-length segment behaves like a point test
  assert.equal(segmentHitsCircle(3, 3, 3, 3, 0, 0, 5), true);
});

test('circle vs box and segment vs box', () => {
  assert.equal(circleHitsBox(0, 0, 10, 15, 0, 6, 6), true);
  assert.equal(circleHitsBox(0, 0, 10, 30, 0, 6, 6), false);
  assert.equal(segmentHitsBox(0, 100, 0, 0, 0, 50, 10, 10), true);
  assert.equal(segmentHitsBox(50, 100, 50, 0, 0, 50, 10, 10), false);
  assert.equal(clamp(5, 0, 3), 3);
});

test('difficulty ramps up over the route', () => {
  assert.equal(scrollSpeed(0), LEVEL.baseScroll);
  assert.equal(scrollSpeed(1), LEVEL.maxScroll);
  assert.equal(scrollSpeed(5), LEVEL.maxScroll);
  assert.ok(spawnInterval(1) < spawnInterval(0));
  assert.ok(maxAliveZombies(1) > maxAliveZombies(0));
  assert.ok(groupSize(0, () => 0.99) <= 2);
  assert.equal(groupSize(0, () => 0), 1);
  assert.ok(groupSize(1, () => 0.99) >= 4);
});

test('only walkers at the very start, brutes appear late', () => {
  for (let i = 0; i < 50; i++) assert.equal(pickZombieType(0.05, () => i / 50), 'walker');
  const late = new Set();
  for (let i = 0; i < 100; i++) late.add(pickZombieType(0.95, () => i / 100));
  assert.ok(late.has('brute') && late.has('runner') && late.has('walker'));
});

test('upgrade costs escalate and cap', () => {
  const def = UPGRADES[0];
  assert.ok(upgradeCost(def, 1) > upgradeCost(def, 0));
  assert.equal(upgradeCost(def, def.max), Infinity);
  const st = statsFromUpgrades({ armor: 2, damage: 1, rate: 3 });
  assert.equal(st.maxHp, 140);
  assert.ok(Math.abs(st.damageMul - 1.15) < 1e-9);
  assert.ok(Math.abs(st.rateMul - 1.3) < 1e-9);
});

test('gate pairs are distinct and respect the barrel cap', () => {
  for (let i = 0; i < 40; i++) {
    const [a, b] = rollGatePair({ barrels: 4 }, seq([i / 40, (39 - i) / 40]));
    assert.notEqual(a, b);
    assert.ok(GATE_EFFECTS[a] && GATE_EFFECTS[b]);
    assert.ok(a !== 'barrel' && b !== 'barrel');
  }
});

test('gate effects mutate run modifiers', () => {
  const m = { damageMul: 1, rateMul: 1, barrels: 1, heal: 0, maxHpBonus: 0, scrap: 0, horde: false };
  GATE_EFFECTS.damage.apply(m);
  GATE_EFFECTS.barrel.apply(m);
  GATE_EFFECTS.blood.apply(m);
  assert.ok(m.damageMul > 1);
  assert.equal(m.barrels, 2);
  assert.equal(m.scrap, 40);
  assert.equal(m.horde, true);
});

test('save system survives missing/corrupt storage', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadSave(store), JSON.parse(JSON.stringify(DEFAULT_SAVE)));
  mem.set(STORAGE_KEY, '{not json');
  assert.equal(loadSave(store).scrap, 0);
  const data = loadSave(store);
  data.scrap = 77;
  data.upgrades.armor = 2;
  assert.equal(writeSave(data, store), true);
  const back = loadSave(store);
  assert.equal(back.scrap, 77);
  assert.equal(back.upgrades.armor, 2);
  assert.equal(back.settings.sound, true);
  assert.equal(loadSave(null).scrap, 0);
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(loadSave(throwing).scrap, 0);
  assert.equal(writeSave(data, throwing), false);
});

test('pool reuses objects and respects capacity', () => {
  let made = 0;
  const pool = new Pool(() => {
    made++;
    const o = { active: false, kill() { this.active = false; } };
    return o;
  }, 3);
  const a = pool.obtain(); a.active = true;
  const b = pool.obtain(); b.active = true;
  const c = pool.obtain(); c.active = true;
  assert.equal(pool.obtain(), null);
  b.kill();
  assert.equal(pool.obtain(), b);
  assert.equal(made, 3);
  b.active = true;
  assert.equal(pool.countActive(), 3);
  pool.killAll();
  assert.equal(pool.countActive(), 0);
});
