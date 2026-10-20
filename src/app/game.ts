// Game controller: state machine, main loop, screen flow, persistence, audio and haptics.

import { AudioEngine } from '../audio/audio';
import { Bot } from '../core/bot';
import { MAX_STEPS_PER_FRAME, SIM_DT } from '../core/constants';
import { MISSIONS, missionById } from '../core/missions';
import { applyRun, buyUpgrade, currentMission, isUnlocked, unlockWeapon, type RewardBreakdown } from '../core/progression';
import { browserStore, loadSave, resetProgress, writeSave, type KeyValueStore, type Quality, type SaveData } from '../core/save';
import { Simulation, type SimEvent } from '../core/sim';
import type { MissionDef } from '../core/types';
import { runModifiers, type UpgradeId } from '../core/upgrades';
import { WEAPONS, type WeaponId } from '../core/weapons';
import { GameView, type QualityLevel } from '../render/view';
import { Hud } from '../ui/hud';
import * as S from '../ui/screens';
import { haptic, hapticsSupported, SteerInput } from './input';

export type State = 'loading' | 'menu' | 'missions' | 'briefing' | 'run' | 'paused' | 'victory' | 'defeat' | 'upgrades';

export class Game {
  state: State = 'loading';
  save: SaveData;
  readonly store: KeyValueStore | null;
  readonly audio = new AudioEngine();
  view!: GameView;
  hud!: Hud;
  input!: SteerInput;
  sim: Simulation | null = null;
  mission: MissionDef = MISSIONS[0];

  private ui: HTMLElement;
  private stage: HTMLElement;
  private attract: { sim: Simulation; bot: Bot } | null = null;
  private acc = 0;
  private lastT = 0;
  private lastRender = 0;
  private resultShown = false;
  private lastReward: RewardBreakdown | null = null;
  private returnTo: State = 'menu';
  private settingsOpen = false;
  private tipIndex = 0;
  private perf = { t: 0, frames: 0, slow: 0 };
  private autoLevel: QualityLevel = 'medium';
  private hapticGap = 0;
  private toastTimer = 0;
  /** QA hook: when set, a bot steers during real runs (used by automated browser tests). */
  autopilot: Bot | null = null;
  readonly version: string;

  constructor(stage: HTMLElement, ui: HTMLElement, version: string) {
    this.stage = stage;
    this.ui = ui;
    this.version = version;
    this.store = browserStore();
    this.save = loadSave(this.store);
    this.autoLevel = detectQuality();
  }

  // ------------------------------------------------------------------ boot

  async boot(progress: (p: number, label: string) => void): Promise<void> {
    progress(0.1, 'LOADING FONTS');
    await loadFonts(2500);
    progress(0.35, 'STARTING ENGINE');
    const canvas = this.stage.querySelector('#game') as HTMLCanvasElement;
    const float = this.stage.querySelector('#float') as HTMLElement;
    this.view = new GameView(canvas, this.effectiveQuality(), float);
    this.view.shakeEnabled = this.save.settings.shake;
    this.input = new SteerInput(canvas);
    this.hud = new Hud(this.stage, () => this.pause(), () => this.strike());
    this.hud.show(false);
    this.applyAudioSettings();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.persist());
    this.ui.addEventListener('click', (e) => this.onClick(e));
    this.ui.addEventListener('input', (e) => this.onRange(e));
    // first touch anywhere unlocks audio (mobile browser policy)
    const unlock = () => { this.audio.unlock(); this.syncMusic(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    progress(0.6, 'BUILDING THE WASTELAND');
    await nextFrame();
    this.startAttract();
    progress(0.85, 'COMPILING SHADERS');
    await nextFrame();
    this.view.frame(this.attract!.sim, 0.016);
    progress(1, 'READY');
    this.showMenu();
    this.lastT = performance.now();
    requestAnimationFrame(this.loop);
  }

  private effectiveQuality(): QualityLevel {
    const q = this.save.settings.quality;
    return q === 'auto' ? this.autoLevel : q;
  }

  private onResize(): void {
    const r = this.stage.getBoundingClientRect();
    this.view.resize(r.width, r.height);
    this.input.setStageWidth(r.width);
    if (this.state !== 'run' && this.sim) this.renderOnce();
  }

  private onVisibility(): void {
    if (document.hidden) {
      if (this.state === 'run') this.pause();
      this.audio.suspend();
      this.persist();
    } else {
      this.audio.resume();
      this.lastT = performance.now();
    }
  }

  // ------------------------------------------------------------------ loop

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const cap = this.view.fpsCap;
    if (now - this.lastRender < 1000 / cap - 2) return; // frame cap saves battery / heat
    this.lastRender = now;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.ui.querySelector('.toast')?.remove(); }

    if (this.state === 'run' && this.sim) {
      this.input.tick(dt);
      const sim = this.sim;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
        sim.setSteer(this.autopilot ? this.autopilot.update(sim) : this.input.target);
        sim.step();
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // device too slow: drop time instead of spiralling
      const events = sim.drainEvents();
      this.view.handle(events, sim);
      this.react(events, sim);
      this.view.frame(sim, dt);
      this.hud.update(sim, dt, (x, y, z) => this.view.project(x, y, z), this.input.touched);
      this.trackPerf(dt);
      if (sim.ended && !this.resultShown && sim.endT > (sim.phase === 'won' ? 1.4 : 1.8)) this.showResult();
    } else if (this.state === 'victory' || this.state === 'defeat') {
      // keep the outro alive behind the result panel (victory cheer, settling bodies)
      if (this.sim) {
        this.sim.step(dt);
        this.view.handle(this.sim.drainEvents(), this.sim);
        this.view.frame(this.sim, dt);
      }
    } else if (this.state !== 'paused' && this.state !== 'loading' && this.attract) {
      // animated menu background: the bot plays a mission behind the UI
      const a = this.attract;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 3) {
        a.sim.setSteer(a.bot.update(a.sim));
        a.sim.step();
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === 3) this.acc = 0;
      this.view.handle(a.sim.drainEvents(), a.sim);
      this.view.frame(a.sim, dt);
      if (a.sim.ended && a.sim.endT > 2) this.startAttract();
    }
  };

  private renderOnce(): void {
    if (this.sim) this.view.frame(this.sim, 0);
  }

  private trackPerf(dt: number): void {
    if (this.save.settings.quality !== 'auto') return;
    const p = this.perf;
    p.t += dt; p.frames++;
    if (p.t >= 3) {
      const fps = p.frames / p.t;
      p.slow = fps < 40 ? p.slow + 1 : 0;
      p.t = 0; p.frames = 0;
      if (p.slow >= 2 && this.autoLevel !== 'low') {
        this.autoLevel = this.autoLevel === 'high' ? 'medium' : 'low';
        this.view.applyQuality(this.autoLevel);
        p.slow = 0;
      }
    }
  }

  // ------------------------------------------------------------------ menu background

  private startAttract(): void {
    const next = currentMission(this.save, MISSIONS);
    const m = { ...next, events: next.events.filter((e) => e.type !== 'wall' || e.kind !== 'container') };
    const mods = runModifiers(this.save.upgrades, this.save.loadout);
    const sim = new Simulation(m, { ...mods, startSquad: Math.max(12, mods.startSquad * 3), dmgMult: mods.dmgMult * 2.5, airstrikes: 0 }, (Date.now() & 0xffff) + 1);
    this.attract = { sim, bot: new Bot(0.9, Date.now() & 0xff) };
    this.view.load(sim, this.effectiveQuality());
  }

  // ------------------------------------------------------------------ screens

  private render(html: string): void {
    this.ui.innerHTML = html;
  }

  private showMenu(): void {
    this.setState('menu');
    this.hud.show(false);
    this.input.enabled = false;
    if (!this.attract || this.sim) { this.sim = null; this.startAttract(); }
    this.render(S.menuScreen(this.save, currentMission(this.save, MISSIONS)));
  }

  private showMissions(): void {
    this.setState('missions');
    this.render(S.missionsScreen(this.save));
  }

  private showBriefing(m: MissionDef): void {
    this.mission = m;
    this.setState('briefing');
    this.render(S.briefingScreen(m, this.save));
  }

  private showUpgrades(tab: 'upgrades' | 'armory', from: State): void {
    if (this.state !== 'upgrades') this.returnTo = from;
    this.setState('upgrades');
    this.render(S.upgradesScreen(this.save, tab));
  }

  private openSettings(): void {
    this.settingsOpen = true;
    const div = document.createElement('div');
    div.innerHTML = S.settingsScreen(this.save, hapticsSupported, this.version, this.effectiveQuality());
    const el = div.firstElementChild as HTMLElement;
    el.dataset.overlay = 'settings';
    this.ui.appendChild(el);
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.ui.querySelector('[data-overlay=settings]')?.remove();
    this.persist();
  }

  private refreshSettings(): void {
    const el = this.ui.querySelector('[data-overlay=settings]');
    if (!el) return;
    const div = document.createElement('div');
    div.innerHTML = S.settingsScreen(this.save, hapticsSupported, this.version, this.effectiveQuality());
    const fresh = div.firstElementChild as HTMLElement;
    fresh.dataset.overlay = 'settings';
    fresh.style.animation = 'none';
    (fresh.firstElementChild as HTMLElement).style.animation = 'none';
    el.replaceWith(fresh);
  }

  private setState(s: State): void {
    this.state = s;
    this.syncMusic();
  }

  private syncMusic(): void {
    if (!this.audio.ready) return;
    const s = this.state;
    if (s === 'run') {
      this.audio.setMusic(this.sim?.phase === 'boss' || (this.sim?.boss && this.sim.mission.length - this.sim.squadZ < 40) ? 'boss' : 'run');
      this.audio.ambienceOn(true);
    } else if (s === 'paused' || s === 'victory' || s === 'defeat') {
      this.audio.setMusic(null);
    } else {
      this.audio.setMusic('menu');
      this.audio.ambienceOn(false);
    }
  }

  // ------------------------------------------------------------------ run flow

  startMission(m: MissionDef): void {
    if (!isUnlocked(this.save, m.id)) return;
    this.mission = m;
    this.attract = null;
    this.sim = new Simulation(m, runModifiers(this.save.upgrades, this.save.loadout));
    this.view.load(this.sim, this.effectiveQuality());
    this.view.shakeEnabled = this.save.settings.shake;
    this.resultShown = false;
    this.lastReward = null;
    this.acc = 0;
    this.input.resetTo(0);
    this.input.enabled = true;
    this.render('');
    this.hud.reset(this.sim);
    this.hud.show(true);
    this.hud.caption(`MISSION ${m.id}`, 'gold');
    this.hud.caption(m.title.toUpperCase(), 'gold');
    this.setState('run');
    this.perf = { t: 0, frames: 0, slow: 0 };
  }

  pause(): void {
    if (this.state !== 'run' || !this.sim || this.sim.ended) return;
    this.setState('paused');
    this.input.enabled = false;
    this.render(S.pauseScreen(this.mission));
    this.audio.click();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.render('');
    this.input.enabled = true;
    this.input.resetTo(this.sim ? this.sim.steerX : 0);
    this.input.touched = true;
    this.lastT = performance.now();
    this.acc = 0;
    this.setState('run');
  }

  private strike(): void {
    if (this.state !== 'run' || !this.sim) return;
    if (this.sim.callAirstrike()) {
      this.audio.airstrike();
      haptic(30, this.save.settings.haptics);
    }
  }

  private showResult(): void {
    const sim = this.sim;
    if (!sim || !sim.result || this.resultShown) return;
    this.resultShown = true; // rewards are applied exactly once per run
    this.input.enabled = false;
    const r = sim.result;
    const rw = applyRun(this.save, this.mission, r);
    this.lastReward = rw;
    this.persist();
    this.hud.show(false);
    if (r.won) {
      this.setState('victory');
      const hasNext = this.mission.id < MISSIONS.length;
      this.render(S.victoryScreen(this.mission, r, rw, hasNext));
      this.audio.victory();
      haptic([30, 60, 30], this.save.settings.haptics);
    } else {
      this.setState('defeat');
      this.render(S.defeatScreen(this.mission, r, rw, this.tipIndex++));
      this.audio.defeat();
      haptic([80, 40, 80], this.save.settings.haptics);
    }
  }

  private quitRun(): void {
    if (this.sim && !this.sim.ended) {
      // record the abandoned run (kills still earn salvage), then leave
      this.sim.abort();
      const r = this.sim.result!;
      applyRun(this.save, this.mission, r);
      this.persist();
    }
    this.sim = null;
    this.showMenu();
  }

  // ------------------------------------------------------------------ sim event reactions

  private react(events: SimEvent[], sim: Simulation): void {
    const h = this.save.settings.haptics;
    this.hapticGap -= 1 / 60;
    for (const e of events) {
      switch (e.t) {
        case 'fire': this.audio.gun(e.weapon, e.n); break;
        case 'hit':
          if (e.target === 'crate') this.audio.crateHit();
          else if (e.target === 'enemy' || e.target === 'boss') this.audio.impact();
          break;
        case 'kill': this.audio.splat(); break;
        case 'zombieGroan': this.audio.groan(e.type === 'heavy' ? 0.6 : e.type === 'runner' ? 1.25 : 1); break;
        case 'soldierDown':
          this.audio.soldierDown();
          if (this.hapticGap <= 0) { haptic(25, h); this.hapticGap = 0.15; }
          break;
        case 'recruit': this.audio.recruit(); this.hud.bump(); break;
        case 'gate':
          this.audio.gate(e.good);
          haptic(e.good ? 15 : [40, 30, 40], h);
          if (e.good) this.hud.flash();
          break;
        case 'crateOpen': this.audio.crate(); haptic(20, h); break;
        case 'crateSmash': this.audio.explosion(false); haptic(40, h); break;
        case 'explosion':
          if (e.kind === 'acid') this.audio.splat();
          else if (e.kind === 'slam' || e.kind === 'charge') this.audio.slam();
          else this.audio.explosion(e.kind === 'airstrike' || e.kind === 'barrel' || e.kind === 'throw');
          if (e.kind !== 'rocket' && this.hapticGap <= 0) { haptic(35, h); this.hapticGap = 0.2; }
          break;
        case 'telegraph': this.audio.warn(); break;
        case 'bossSpawn': this.audio.roar(); this.syncMusic(); break;
        case 'bossStart': this.audio.roar(); haptic(60, h); this.syncMusic(); break;
        case 'bossPhase': this.audio.roar(); haptic([50, 30, 50], h); break;
        case 'bossAttack':
          if (e.kind === 'slam' || e.kind === 'stomp' || e.kind === 'charge') { this.audio.slam(); haptic(45, h); }
          else if (e.kind === 'summon') this.audio.roar();
          break;
        case 'bossDead': this.audio.explosion(true); this.audio.roar(); haptic([80, 50, 120], h); break;
        case 'weapon': this.audio.upgrade(); break;
        case 'caption': this.hud.caption(e.text, e.tone); break;
        case 'end': this.audio.setMusic(null); this.audio.ambienceOn(false); break;
        default: break;
      }
    }
    void sim;
  }

  // ------------------------------------------------------------------ input from UI

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t) return;
    const a = t.dataset.action!;
    const id = t.dataset.id ?? '';
    this.audio.unlock();
    if (a !== 'buy' && a !== 'unlock' && a !== 'locked') this.audio.click();
    switch (a) {
      case 'menu': this.sim = null; this.showMenu(); break;
      case 'missions': this.showMissions(); break;
      case 'brief': { const m = missionById(Number(id)); if (m && isUnlocked(this.save, m.id)) this.showBriefing(m); break; }
      case 'locked': this.audio.deny(); this.toast('Clear the previous mission first'); break;
      case 'start': { const m = missionById(Number(id)); if (m) this.startMission(m); break; }
      case 'back':
        if (this.state === 'upgrades') {
          if (this.returnTo === 'briefing') this.showBriefing(this.mission);
          else if (this.returnTo === 'victory' || this.returnTo === 'defeat') this.showResultAgain();
          else this.showMenu();
        } else if (this.state === 'briefing') this.showMenu();
        else this.showMenu();
        break;
      case 'upgrades': this.showUpgrades('upgrades', this.state); break;
      case 'armory': this.showUpgrades('armory', this.state); break;
      case 'tab-upgrades': this.showUpgrades('upgrades', this.returnTo); break;
      case 'tab-armory': this.showUpgrades('armory', this.returnTo); break;
      case 'buy': this.buy(id as UpgradeId); break;
      case 'unlock': this.unlock(id as WeaponId); break;
      case 'equip':
        if (this.save.weapons[id as WeaponId]) { this.save.loadout = id as WeaponId; this.persist(); this.audio.upgrade(); this.showUpgrades('armory', this.returnTo); }
        break;
      case 'settings': this.openSettings(); break;
      case 'close-settings': this.closeSettings(); break;
      case 'toggle': this.toggleSetting(id); break;
      case 'quality': this.setQuality(id as Quality); break;
      case 'reset': {
        const div = document.createElement('div');
        div.innerHTML = S.confirmScreen('All scrap, upgrades, weapons and mission progress will be erased.', 'ERASE EVERYTHING', 'confirm-reset');
        this.ui.appendChild(div.firstElementChild!);
        break;
      }
      case 'confirm-reset':
        this.save = resetProgress(this.store, this.save.settings);
        this.ui.querySelector('[data-screen=confirm]')?.remove();
        this.closeSettings();
        this.sim = null;
        this.attract = null;
        this.showMenu();
        this.toast('Progress reset');
        break;
      case 'cancel-confirm': this.ui.querySelector('[data-screen=confirm]')?.remove(); break;
      case 'resume': this.resume(); break;
      case 'restart': this.startMission(this.mission); break;
      case 'quit': this.quitRun(); break;
      case 'next': { const m = missionById(this.mission.id + 1); if (m && isUnlocked(this.save, m.id)) this.showBriefing(m); break; }
    }
  }

  private showResultAgain(): void {
    const sim = this.sim;
    if (!sim?.result || !this.lastReward) { this.showMenu(); return; }
    if (sim.result.won) {
      this.setState('victory');
      this.render(S.victoryScreen(this.mission, sim.result, this.lastReward, this.mission.id < MISSIONS.length));
    } else {
      this.setState('defeat');
      this.render(S.defeatScreen(this.mission, sim.result, this.lastReward, this.tipIndex));
    }
  }

  private buy(id: UpgradeId): void {
    if (buyUpgrade(this.save, id)) {
      this.persist();
      this.audio.upgrade();
      haptic(15, this.save.settings.haptics);
      this.showUpgrades('upgrades', this.returnTo);
      this.ui.querySelector(`[data-card=${id}]`)?.classList.add('bought');
    } else this.audio.deny();
  }

  private unlock(id: WeaponId): void {
    if (unlockWeapon(this.save, id)) {
      this.save.loadout = id;
      this.persist();
      this.audio.upgrade();
      this.toast(`${WEAPONS[id].name} unlocked & equipped`);
      this.showUpgrades('armory', this.returnTo);
    } else this.audio.deny();
  }

  private toggleSetting(id: string): void {
    const s = this.save.settings;
    if (id === 'muted') s.muted = !s.muted;
    if (id === 'haptics') { s.haptics = !s.haptics; haptic(20, s.haptics); }
    if (id === 'shake') { s.shake = !s.shake; this.view.shakeEnabled = s.shake; }
    this.applyAudioSettings();
    this.persist();
    this.refreshSettings();
  }

  private setQuality(q: Quality): void {
    this.save.settings.quality = q;
    if (q === 'auto') this.autoLevel = detectQuality();
    this.view.applyQuality(this.effectiveQuality());
    this.persist();
    this.refreshSettings();
    if (this.state !== 'run') this.toast('Graphics updated');
  }

  private onRange(e: Event): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.range as 'master' | 'music' | 'sfx' | undefined;
    if (!key) return;
    this.save.settings[key] = Number(el.value) / 100;
    this.applyAudioSettings();
    this.persist();
  }

  private applyAudioSettings(): void {
    const s = this.save.settings;
    this.audio.setVolumes(s.master, s.music, s.sfx, s.muted);
  }

  persist(): void {
    if (!writeSave(this.store, this.save) && this.store) this.toast('Could not save progress (storage full?)');
  }

  toast(text: string): void {
    this.ui.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.ui.appendChild(t);
    this.toastTimer = 2;
  }

  /** Debug / test hooks (used by the automated browser tests). */
  debug() {
    return {
      setAutopilot: (on: boolean) => { this.autopilot = on ? new Bot(0.9, 5) : null; },
      unlockAll: () => {
        for (const m of MISSIONS) this.save.missions[m.id] = this.save.missions[m.id] ?? { cleared: true, stars: 1, best: 1 };
        this.persist();
      },
      start: (id: number) => { const m = missionById(id); if (m) this.startMission(m); },
      state: this.state,
      sim: this.sim,
      save: this.save,
      stats: this.view.stats,
      quality: this.effectiveQuality(),
      settingsOpen: this.settingsOpen,
    };
  }
}

// ------------------------------------------------------------------ helpers

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function loadFonts(timeout: number): Promise<void> {
  if (!document.fonts) return;
  const load = Promise.all([
    document.fonts.load('40px Anton'),
    document.fonts.load('700 20px "Barlow Condensed"'),
    document.fonts.load('800 20px "Barlow Condensed"'),
  ]).catch(() => undefined);
  await Promise.race([load, new Promise((r) => setTimeout(r, timeout))]);
}

function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const ua = navigator.userAgent;
  const iphone = /iPhone|iPad/.test(ua);
  if (mem <= 2 || cores <= 2) return 'low';
  if (!coarse) return 'high';
  // modern iPhones handle shadows well; most Android phones get medium
  if (iphone && cores >= 6) return 'high';
  return cores >= 8 && mem >= 6 ? 'high' : 'medium';
}
