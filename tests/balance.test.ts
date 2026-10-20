// Full-campaign balance simulation: a bot of "normal" skill plays missions in order, spends
// scrap on upgrades between runs and retries failed missions. Asserts the campaign is
// beatable without grinding walls, and prints a table for tuning.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bot } from '../src/core/bot';
import { MISSIONS } from '../src/core/missions';
import { applyRun, buyUpgrade, unlockWeapon } from '../src/core/progression';
import { defaultSave, type SaveData } from '../src/core/save';
import { Simulation } from '../src/core/sim';
import { runModifiers, upgradeCost, UPGRADE_IDS, type UpgradeId } from '../src/core/upgrades';
import { WEAPONS } from '../src/core/weapons';

function shop(save: SaveData): void {
  // spend like a sensible player: cheapest useful upgrade first, damage/squad favoured
  const weight: Record<UpgradeId, number> = { damage: 1, squad: 1.05, rate: 1.15, armor: 1.3, recruiter: 1.25, frags: 1.6 };
  for (;;) {
    let best: UpgradeId | null = null, bestCost = Infinity;
    for (const id of UPGRADE_IDS) {
      const c = upgradeCost(id, save.upgrades[id]);
      if (c !== null && c * weight[id] < bestCost && c <= save.scrap) { bestCost = c * weight[id]; best = id; }
    }
    if (!best) break;
    buyUpgrade(save, best);
  }
  if (save.scrap > WEAPONS.hmg.unlockCost * 3 && !save.weapons.hmg) { unlockWeapon(save, 'hmg'); save.loadout = 'hmg'; }
}

function play(save: SaveData, missionIdx: number, attempt: number, skill: number) {
  const m = MISSIONS[missionIdx];
  const sim = new Simulation(m, runModifiers(save.upgrades, save.loadout), m.seed + attempt * 7919);
  const bot = new Bot(skill, 11 + attempt * 31);
  let airCd = 0;
  while (!sim.ended && sim.time < 400) {
    sim.setSteer(bot.update(sim));
    airCd -= 1 / 60;
    if (airCd <= 0 && sim.airstrikes > 0 && (sim.boss?.active || sim.enemies.length > 18)) { sim.callAirstrike(); airCd = 6; }
    sim.step();
    sim.drainEvents();
  }
  assert.ok(sim.result, `mission ${m.id} ended`);
  return { sim, res: sim.result! };
}

function campaign(skill: number, maxTotal: number) {
  const save = defaultSave();
  const rows: string[] = [];
  let totalAttempts = 0;
  for (let i = 0; i < MISSIONS.length; i++) {
    let attempts = 0;
    let won = false;
    let last = '';
    while (!won && attempts < 12) {
      attempts++;
      const { sim, res } = play(save, i, attempts, skill);
      const rw = applyRun(save, MISSIONS[i], res);
      won = res.won;
      last = `${res.won ? 'WIN ' : 'LOSE'} ${String(res.reason ?? '').padEnd(9)} surv ${String(res.survivors).padStart(3)} peak ${String(res.peakSquad).padStart(3)} lost ${String(res.peakSquad - res.survivors).padStart(3)} kills ${String(res.kills).padStart(4)} +${String(rw.total).padStart(4)} scrap  t=${res.time.toFixed(0)}s boss=${sim.boss ? Math.round((sim.boss.hp / sim.boss.maxHp) * 100) + '% in ' + (sim.bossStartT >= 0 ? (res.time - sim.bossStartT).toFixed(0) : '-') + 's' : '-'}`;
      const fight = sim.bossStartT >= 0 && sim.boss?.dead ? res.time - sim.bossStartT - 3.7 : 0;
      if (fight > 0) last += ` dps≈${Math.round((sim.boss!.maxHp * sim.boss!.def.damageTaken) / fight)}`;
      rows.push(`M${String(i + 1).padStart(2)} try ${attempts}: ${last}`);
      shop(save);
    }
    totalAttempts += attempts;
    rows.push(`   -> upgrades ${JSON.stringify(save.upgrades)} weapon=${save.loadout} scrap=${save.scrap}`);
    assert.ok(won, `Mission ${i + 1} (${MISSIONS[i].title}) should be beatable within 12 attempts. Last: ${last}\n${rows.join('\n')}`);
  }
  console.log(`\n=== skill ${skill} ===\n` + rows.join('\n') + `\nTotal attempts: ${totalAttempts}`);
  assert.ok(totalAttempts <= maxTotal, `campaign took ${totalAttempts} attempts`);
}

test('campaign: good player (skill 0.85)', () => campaign(0.85, 22));
test('campaign: average player (skill 0.7)', () => campaign(0.7, 30));
test('campaign: casual player (skill 0.55) can still finish with grinding', () => campaign(0.55, 45));

test('mission 1 is winnable on a fresh save, mission 10 is not trivially winnable fresh', () => {
  const fresh = defaultSave();
  const r1 = play(fresh, 0, 1, 0.7).res;
  assert.ok(r1.won, 'first mission must be beatable without upgrades');
  const r10 = play(defaultSave(), 9, 1, 0.9).res;
  assert.equal(r10.won, false, 'final mission should require progression');
});
