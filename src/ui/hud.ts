// In-run HUD. Updates DOM only when a displayed value changes (cheap per frame).

import type { Simulation } from '../core/sim';
import { WEAPON_MAX_LEVEL } from '../core/constants';
import { formationDepth } from '../core/formation';
import { WEAPONS } from '../core/weapons';
import { ICON } from './icons';

export class Hud {
  readonly root: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
  private els: Record<string, HTMLElement>;
  private last: Record<string, string | number | boolean> = {};
  private captionTimer = 0;
  private captionQueue: { text: string; tone: string }[] = [];
  private bossLag = 1;
  private bumpT = 0;

  constructor(parent: HTMLElement, onPause: () => void, onStrike: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="vignette"></div><div class="flash"></div>
      <div class="hud-top">
        <button class="icon-btn pause" data-hud="pause" aria-label="Pause">${ICON.pause}</button>
        <div class="center">
          <div class="obj"></div>
          <div class="prog"><div></div><span class="flag">🏁</span></div>
        </div>
        <div class="right">
          <div class="weapon"><b class="wname"></b><span class="lv"></span></div>
          <div class="chip scrap"><i>⚙</i><span class="scrapv">0</span></div>
        </div>
      </div>
      <div class="bossbar"><div class="name gold"></div><div class="bar"><div class="lag"></div><div class="fill"></div><div class="ticks"></div><span></span></div></div>
      <div class="buffs"></div>
      <div class="squad-anchor"><div class="squad-badge">${ICON.person}<span>0</span></div></div>
      <div class="caption gold"></div>
      <div class="hint"><div class="hand">${ICON.hand}</div><div>DRAG TO STEER</div></div>
      <button class="strike" aria-label="Call airstrike">${ICON.plane}<b>1</b></button>`;
    parent.appendChild(this.root);
    this.els = {
      obj: this.q('.obj'), prog: this.q('.prog > div'), wname: this.q('.wname'), lv: this.q('.lv'), scrap: this.q('.scrapv'),
      buffs: this.q('.buffs'), boss: this.q('.bossbar'), bossName: this.q('.bossbar .name'), bossFill: this.q('.bossbar .fill'),
      bossLag: this.q('.bossbar .lag'), bossTxt: this.q('.bossbar .bar span'), bossTicks: this.q('.bossbar .ticks'),
      anchor: this.q('.squad-anchor'), badge: this.q('.squad-badge'), badgeN: this.q('.squad-badge span'), caption: this.q('.caption'), hint: this.q('.hint'),
      strike: this.q('.strike'), strikeN: this.q('.strike b'), vignette: this.q('.vignette'), flash: this.q('.flash'),
    };
    this.q('[data-hud=pause]').addEventListener('click', (e) => { e.stopPropagation(); onPause(); });
    this.els.strike.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); onStrike(); });
  }

  private set(key: string, v: string | number | boolean, fn: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    fn();
  }

  reset(sim: Simulation): void {
    this.last = {};
    this.captionQueue = [];
    this.captionTimer = 0;
    this.bossLag = 1;
    this.els.caption.classList.remove('show');
    this.els.boss.classList.remove('on');
    this.els.hint.style.opacity = '1';
    const b = sim.mission.boss ? sim.boss : null;
    void b;
    this.els.bossTicks.innerHTML = '';
  }

  caption(text: string, tone: string): void {
    if (this.captionQueue.length > 2) this.captionQueue.shift();
    this.captionQueue.push({ text, tone });
  }

  flash(): void {
    const f = this.els.flash;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  bump(): void { this.bumpT = 0.3; }

  update(sim: Simulation, dt: number, project: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean }, touched: boolean): void {
    const m = sim.mission;
    const left = Math.max(0, Math.round(m.length - sim.squadZ));
    const obj = m.objective.type === 'boss'
      ? (sim.phase === 'boss' ? 'Defeat the boss!' : `Boss ahead · ${left} m`)
      : m.objective.type === 'survivors'
        ? `Bring ${m.objective.count} home · ${left} m`
        : `Safe zone · ${left} m`;
    this.set('obj', obj, () => (this.els.obj.textContent = obj));
    const pct = Math.round(sim.progress * 1000) / 10;
    this.set('prog', pct, () => (this.els.prog.style.width = `${pct}%`));
    const w = WEAPONS[sim.weapon];
    this.set('wname', w.short, () => (this.els.wname.textContent = w.short));
    this.set('lv', sim.weaponLevel, () => {
      let h = '';
      for (let i = 1; i <= WEAPON_MAX_LEVEL; i++) h += `<i class="${i <= sim.weaponLevel ? 'on' : ''}"></i>`;
      this.els.lv.innerHTML = h;
    });
    const scrap = sim.killScrap + sim.bonusScrap;
    this.set('scrap', scrap, () => (this.els.scrap.textContent = String(scrap)));
    const buffs = `${sim.shieldT > 0 ? Math.ceil(sim.shieldT) : 0}|${sim.boostT > 0 ? Math.ceil(sim.boostT) : 0}`;
    this.set('buffs', buffs, () => {
      let h = '';
      if (sim.shieldT > 0) h += `<span class="buff shield">SHIELD ${Math.ceil(sim.shieldT)}s</span>`;
      if (sim.boostT > 0) h += `<span class="buff boost">DMG ×1.5 ${Math.ceil(sim.boostT)}s</span>`;
      this.els.buffs.innerHTML = h;
    });

    // squad badge anchored above the formation
    const n = sim.count;
    const p = project(sim.squadX, 3.0, sim.squadZ - formationDepth(n) * 0.35);
    this.els.anchor.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    this.set('n', n, () => {
      const prev = Number(this.els.badgeN.textContent);
      this.els.badgeN.textContent = String(n);
      if (n !== prev) { this.els.badge.classList.remove('bump'); void this.els.badge.offsetWidth; this.els.badge.classList.add('bump'); }
    });
    const low = n <= 2 && n < sim.mods.startSquad;
    this.set('hurt', low, () => this.els.badge.classList.toggle('hurt', low));
    this.set('danger', low && !sim.ended, () => this.els.vignette.classList.toggle('danger', low && !sim.ended));

    // boss bar
    const b = sim.boss;
    const bossOn = !!b && (b.active || m.length - sim.squadZ < 40) && !(b.dead && b.dieT > 2);
    this.set('bossOn', bossOn, () => {
      this.els.boss.classList.toggle('on', bossOn);
      if (bossOn && b) {
        this.els.bossName.textContent = b.def.name;
        let ticks = '';
        for (const ph of b.def.phases) if (ph.above > 0) ticks += `<i style="left:${ph.above * 100}%"></i>`;
        this.els.bossTicks.innerHTML = ticks;
      }
    });
    if (b && bossOn) {
      const frac = Math.max(0, b.hp / b.maxHp);
      this.bossLag = Math.max(frac, this.bossLag - dt * 0.4);
      this.set('bossHp', Math.ceil(b.hp), () => {
        this.els.bossFill.style.transform = `scaleX(${frac})`;
        this.els.bossTxt.textContent = formatHp(b.hp);
      });
      this.els.bossLag.style.transform = `scaleX(${this.bossLag})`;
    }

    // airstrike button
    const strikes = sim.airstrikes;
    const showStrike = strikes > 0 && !sim.ended;
    this.set('strike', showStrike, () => this.els.strike.classList.toggle('on', showStrike));
    this.set('strikeN', strikes, () => (this.els.strikeN.textContent = String(strikes)));

    // tutorial hint until the player has steered once
    this.set('hint', touched || sim.time > 5, () => (this.els.hint.style.opacity = touched || sim.time > 5 ? '0' : '1'));

    // captions
    this.captionTimer -= dt;
    if (this.captionTimer <= 0 && this.captionQueue.length) {
      const c = this.captionQueue.shift()!;
      const el = this.els.caption;
      el.textContent = c.text;
      el.className = `caption gold ${c.tone}`;
      void el.offsetWidth;
      el.classList.add('show');
      this.captionTimer = 1.05;
    }
    this.bumpT = Math.max(0, this.bumpT - dt);
  }

  show(v: boolean): void { this.root.style.display = v ? '' : 'none'; }
}

export function formatHp(hp: number): string {
  const v = Math.max(0, Math.ceil(hp));
  return v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}K` : String(v);
}
