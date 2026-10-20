// Menu / overlay screens rendered as DOM. Each button carries a data-action that the game
// controller handles — there are no decorative, non-functional buttons.

import { MISSIONS } from '../core/missions';
import { isUnlocked, totalStars, type RewardBreakdown, type RunResult } from '../core/progression';
import type { SaveData } from '../core/save';
import { UPGRADES, UPGRADE_IDS, upgradeCost, type UpgradeId } from '../core/upgrades';
import { WEAPON_IDS, WEAPONS, sustainedDps } from '../core/weapons';
import { BOSSES } from '../core/bosses';
import type { MissionDef } from '../core/types';
import { ICON } from './icons';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function starsHtml(n: number, max = 3): string {
  let h = '<span class="stars">';
  for (let i = 0; i < max; i++) h += i < n ? '★' : '<span class="off">★</span>';
  return h + '</span>';
}

export function diffHtml(d: number): string {
  let h = '<span class="diff">';
  for (let i = 1; i <= 5; i++) h += `<i class="${i <= d ? 'on' : ''}"></i>`;
  return h + '</span>';
}

const scrapChip = (n: number) => `<div class="chip"><i>⚙</i><span>${n}</span></div>`;

function objectiveText(m: MissionDef): string {
  switch (m.objective.type) {
    case 'reach': return 'Reach the safe zone';
    case 'survivors': return `Arrive with ${m.objective.count}+ survivors`;
    case 'boss': return `Defeat ${BOSSES[m.boss!].name}`;
  }
}

export function menuScreen(save: SaveData, next: MissionDef): string {
  const prog = save.missions[next.id];
  return `<div class="screen dim" data-screen="menu">
    <div class="menu-top">
      ${scrapChip(save.scrap)}
      <div class="chip"><i>★</i><span>${totalStars(save)}/${MISSIONS.length * 3}</span></div>
      <button class="icon-btn" data-action="settings" aria-label="Settings">${ICON.gear}</button>
    </div>
    <div class="logo-block"><span class="t1 gold">LAST<br/>CONVOY</span><span class="t2">MOBILE APOCALYPSE</span></div>
    <div class="menu-spacer"></div>
    <button class="panel next-card" data-action="brief" data-id="${next.id}">
      <div class="num">${next.id}</div>
      <div class="meta"><b>${esc(next.title)}${next.boss ? '<span class="tag-boss">BOSS</span>' : ''}</b>
        <span>${esc(objectiveText(next))} · ${diffHtml(next.difficulty)}</span></div>
      <div>${starsHtml(prog?.stars ?? 0)}</div>
    </button>
    <button class="btn big play-btn" data-action="brief" data-id="${next.id}">${ICON.play.replace('<svg', '<svg width="30" height="30" style="fill:#2a1600"')} PLAY</button>
    <div class="menu-actions">
      <button class="btn dark" data-action="missions">${ICON.map}MISSIONS</button>
      <button class="btn dark" data-action="upgrades">${ICON.wrench}UPGRADES</button>
      <button class="btn dark" data-action="armory">${ICON.gun}ARMORY</button>
    </div>
  </div>`;
}

export function missionsScreen(save: SaveData): string {
  const items = MISSIONS.map((m) => {
    const unlocked = isUnlocked(save, m.id);
    const p = save.missions[m.id];
    return `<button class="panel mitem ${unlocked ? '' : 'locked'} ${m.boss ? 'boss' : ''}" data-action="${unlocked ? 'brief' : 'locked'}" data-id="${m.id}">
      <div class="num">${unlocked ? m.id : '🔒'}</div>
      <div class="meta"><b>${esc(m.title)}${m.boss ? '<span class="tag-boss">BOSS</span>' : ''}</b>
        <span>${unlocked ? esc(objectiveText(m)) : `Clear mission ${m.id - 1} to unlock`}</span></div>
      <div class="right">${starsHtml(p?.stars ?? 0)}<br/>${diffHtml(m.difficulty)}<br/><span class="muted">⚙ ${p?.cleared ? Math.round(m.reward / 2) : m.reward}</span></div>
    </button>`;
  }).join('');
  return `<div class="screen solid" data-screen="missions">
    <div class="topbar"><button class="icon-btn" data-action="menu" aria-label="Back">${ICON.back}</button><h2 class="gold">MISSIONS</h2>${scrapChip(save.scrap)}</div>
    <div class="scroll"><div class="mlist">${items}</div></div>
  </div>`;
}

export function briefingScreen(m: MissionDef, save: SaveData): string {
  const p = save.missions[m.id];
  const reward = p?.cleared ? Math.round(m.reward / 2) : m.reward;
  return `<div class="screen dim" data-screen="briefing">
    <div class="topbar"><button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button><div style="flex:1"></div>${scrapChip(save.scrap)}</div>
    <div class="panel brief">
      <div class="kicker">MISSION ${m.id} · ${esc(m.tagline.toUpperCase())}</div>
      <h1 class="gold">${esc(m.title)}</h1>
      <p>${esc(m.intro)}</p>
      <div class="grid">
        <div class="cell"><small>OBJECTIVE</small><b>${esc(objectiveText(m))}</b></div>
        <div class="cell"><small>THREAT</small><b>${diffHtml(m.difficulty)}</b></div>
        <div class="cell"><small>REWARD</small><b>⚙ ${reward}${p?.cleared ? ' <span class="muted">(replay)</span>' : ''}</b></div>
        <div class="cell"><small>BEST</small><b>${starsHtml(p?.stars ?? 0)}</b></div>
      </div>
      ${m.introduces.length ? `<div class="intro-tags">${m.introduces.map((t) => `<span>NEW: ${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="muted" style="font-weight:700;font-size:15px">★★ ${m.stars[0]}+ survivors · ★★★ ${m.stars[1]}+ survivors</div>
      <div class="row">
        <button class="btn dark" data-action="upgrades" style="flex:0.7">${ICON.wrench}</button>
        <button class="btn big" data-action="start" data-id="${m.id}">START</button>
      </div>
    </div>
  </div>`;
}

export function pauseScreen(m: MissionDef): string {
  return `<div class="modal" data-screen="pause"><div class="panel">
    <h2 class="gold">PAUSED</h2>
    <div class="sub">Mission ${m.id} · ${esc(m.title)}</div>
    <button class="btn big" data-action="resume">RESUME</button>
    <button class="btn dark" data-action="restart">RESTART MISSION</button>
    <button class="btn dark" data-action="settings">SETTINGS</button>
    <button class="btn red" data-action="quit">QUIT TO MENU</button>
  </div></div>`;
}

const starSvg = (on: boolean, delay: number) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" style="animation-delay:${delay}s">${ICON.star.replace(/<\/?svg[^>]*>/g, '')}</svg>`;

export function victoryScreen(m: MissionDef, r: RunResult, rw: RewardBreakdown, hasNext: boolean): string {
  const rating = ['', 'GOOD', 'GREAT', 'PERFECT'][rw.starsEarned] ?? '';
  return `<div class="modal" data-screen="victory"><div class="panel">
    <div class="result-banner"><span class="t gold">VICTORY</span></div>
    <div class="result-stars">${starSvg(rw.starsEarned >= 1, 0.2)}${starSvg(rw.starsEarned >= 2, 0.45)}${starSvg(rw.starsEarned >= 3, 0.7)}</div>
    <div class="sub">${rating} · ${r.survivors} survivors · ${r.kills} kills · ${Math.round(r.time)}s</div>
    <div class="rows">
      <div><span>Mission reward${rw.firstClear ? '' : ' (replay)'}</span><span>⚙ ${rw.mission}</span></div>
      <div><span>Kills</span><span>⚙ ${rw.kills}</span></div>
      <div><span>Survivors</span><span>⚙ ${rw.survivors}</span></div>
      <div><span>Star bonus</span><span>⚙ ${rw.stars}</span></div>
      ${rw.crates ? `<div><span>Salvage crates</span><span>⚙ ${rw.crates}</span></div>` : ''}
      <div class="total"><span>TOTAL</span><span>⚙ ${rw.total}</span></div>
    </div>
    ${hasNext ? `<button class="btn big" data-action="next">NEXT MISSION</button>` : `<div class="tip">You beat the final mission — the last convoy made it out! Replay missions for 3 stars.</div>`}
    <div style="display:flex;gap:10px"><button class="btn dark" data-action="upgrades" style="flex:1">UPGRADES</button><button class="btn dark" data-action="restart" style="flex:1">REPLAY</button></div>
    <button class="btn dark" data-action="menu">MENU</button>
  </div></div>`;
}

const REASONS: Record<string, string> = {
  wiped: 'Your whole squad was overrun.',
  boss: 'The boss wiped out your squad.',
  survivors: 'Not enough survivors reached the safe zone.',
  quit: 'Mission abandoned.',
};

const TIPS = [
  'Steer through the higher gate value — ×2 is huge when your squad is big.',
  'Line up with a numbered crate and shoot its number down to zero before you reach it.',
  'Upgrades are permanent — spend your scrap before retrying.',
  'Red circles and red lanes mean incoming damage. Move out before they fill up!',
  'Shoot cracked gates to raise their value — even a red gate can turn blue.',
  'Weapon gates make every soldier stronger. Pick them when your squad is already large.',
  'Airstrikes deal massive damage to bosses — save one for the final phase.',
];

export function defeatScreen(m: MissionDef, r: RunResult, rw: RewardBreakdown, tipIndex: number): string {
  return `<div class="modal" data-screen="defeat"><div class="panel">
    <div class="result-banner"><span class="t gold" style="filter:drop-shadow(0 3px 0 #4a0a04)">DEFEAT</span></div>
    <div class="reason">${esc(REASONS[r.reason ?? 'wiped'] ?? REASONS.wiped)}${m.objective.type === 'survivors' && r.reason === 'survivors' ? ` (${r.survivors}/${m.objective.count})` : ''}</div>
    <div class="rows">
      <div><span>Kills</span><span>${r.kills}</span></div>
      <div><span>Peak squad</span><span>${r.peakSquad}</span></div>
      <div class="total"><span>SALVAGED</span><span>⚙ ${rw.total}</span></div>
    </div>
    <div class="tip">TIP: ${esc(TIPS[tipIndex % TIPS.length])}</div>
    <button class="btn big" data-action="restart">RETRY</button>
    <button class="btn blue" data-action="upgrades">UPGRADE SQUAD</button>
    <button class="btn dark" data-action="menu">MENU</button>
  </div></div>`;
}

const UP_ICON: Record<UpgradeId, string> = { squad: ICON.people, damage: ICON.crosshair, rate: ICON.ammo, armor: ICON.shield, recruiter: ICON.person, frags: ICON.plane };

export function upgradesScreen(save: SaveData, tab: 'upgrades' | 'armory'): string {
  let body = '';
  if (tab === 'upgrades') {
    body = UPGRADE_IDS.map((id) => {
      const u = UPGRADES[id];
      const lv = save.upgrades[id];
      const cost = upgradeCost(id, lv);
      const cur = u.format(u.value(lv));
      const nxt = cost !== null ? u.format(u.value(lv + 1)) : null;
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < lv ? 'on' : ''}"></i>`;
      return `<div class="panel card" data-card="${id}">
        <div class="ico">${UP_ICON[id]}</div>
        <div class="info"><b>${esc(u.name)}</b><div class="d">${esc(u.desc)}</div>
          <div class="v">${esc(cur)}${nxt ? ` → <em>${esc(nxt)}</em>` : ' <span class="muted">(MAX)</span>'}</div><div class="pips">${pips}</div></div>
        ${cost !== null
          ? `<button class="btn buy" data-action="buy" data-id="${id}" ${save.scrap < cost ? 'disabled' : ''}>⚙ ${cost}<small>LV ${lv + 1}</small></button>`
          : `<button class="btn buy dark" disabled>MAX</button>`}
      </div>`;
    }).join('');
  } else {
    body = WEAPON_IDS.map((id) => {
      const w = WEAPONS[id];
      const owned = save.weapons[id];
      const eq = save.loadout === id;
      const dps = Math.round(sustainedDps(id, 1));
      return `<div class="panel card ${eq ? 'equipped' : ''}">
        <div class="ico">${ICON.gun}</div>
        <div class="info"><b>${esc(w.name)}</b><div class="d">${esc(w.desc)}</div>
          <div class="stat">DPS ${dps} · RANGE ${w.range}m${w.pellets > 1 ? ` · ${w.pellets} PELLETS` : ''}${w.splashRadius ? ' · SPLASH' : ''}${w.pierce ? ` · PIERCE ${w.pierce + 1}` : ''}</div></div>
        ${eq ? `<button class="btn buy dark" disabled>EQUIPPED</button>`
          : owned ? `<button class="btn buy blue" data-action="equip" data-id="${id}">EQUIP</button>`
          : `<button class="btn buy" data-action="unlock" data-id="${id}" ${save.scrap < w.unlockCost ? 'disabled' : ''}>⚙ ${w.unlockCost}<small>UNLOCK</small></button>`}
      </div>`;
    }).join('');
    body = `<div class="tip" style="margin-bottom:4px">Your starting weapon for every mission. Crates on the road can still swap it mid-run.</div>` + body;
  }
  return `<div class="screen solid" data-screen="upgrades">
    <div class="topbar"><button class="icon-btn" data-action="back" aria-label="Back">${ICON.back}</button><h2 class="gold">${tab === 'upgrades' ? 'UPGRADES' : 'ARMORY'}</h2>${scrapChip(save.scrap)}</div>
    <div class="tabs"><button class="${tab === 'upgrades' ? 'on' : ''}" data-action="tab-upgrades">SQUAD</button><button class="${tab === 'armory' ? 'on' : ''}" data-action="tab-armory">WEAPONS</button></div>
    <div class="scroll"><div class="cards">${body}</div></div>
  </div>`;
}

export function settingsScreen(save: SaveData, hapticsOk: boolean, version: string, effectiveQuality: string): string {
  const s = save.settings;
  const tog = (key: string, on: boolean) => `<button class="toggle ${on ? 'on' : ''}" data-action="toggle" data-id="${key}" aria-pressed="${on}"></button>`;
  const q = (v: string, label: string) => `<button class="${s.quality === v ? 'on' : ''}" data-action="quality" data-id="${v}">${label}</button>`;
  return `<div class="modal" data-screen="settings"><div class="panel">
    <h2 class="gold">SETTINGS</h2>
    <div class="set-row"><span>Sound</span>${tog('muted', !s.muted)}</div>
    <div class="set-row"><span>Master</span><input type="range" min="0" max="100" value="${Math.round(s.master * 100)}" data-range="master" /></div>
    <div class="set-row"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-range="music" /></div>
    <div class="set-row"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-range="sfx" /></div>
    ${hapticsOk ? `<div class="set-row"><span>Vibration</span>${tog('haptics', s.haptics)}</div>` : ''}
    <div class="set-row"><span>Screen shake</span>${tog('shake', s.shake)}</div>
    <div class="set-row"><span>Graphics</span><div class="seg">${q('auto', 'AUTO')}${q('low', 'LOW')}${q('medium', 'MED')}${q('high', 'HIGH')}</div></div>
    <div class="muted" style="font-size:14px;font-weight:700;text-align:right;margin-top:-6px">Active: ${esc(effectiveQuality.toUpperCase())}</div>
    <button class="btn dark" data-action="close-settings">DONE</button>
    <button class="btn red" data-action="reset" style="min-height:48px;font-size:17px">RESET PROGRESS</button>
    <div class="version">LAST CONVOY v${esc(version)} · ${save.stats.wins} wins · ${save.stats.kills} kills</div>
  </div></div>`;
}

export function confirmScreen(text: string, yes: string, action: string): string {
  return `<div class="modal" data-screen="confirm" style="z-index:5"><div class="panel">
    <h2 class="gold" style="font-size:32px">ARE YOU SURE?</h2>
    <div class="sub" style="color:#e8dcc4">${esc(text)}</div>
    <button class="btn red" data-action="${action}">${esc(yes)}</button>
    <button class="btn dark" data-action="cancel-confirm">CANCEL</button>
  </div></div>`;
}
